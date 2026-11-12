// ===== تنظیمات بازی =====
const BUILDINGS = {
  house:   { name: 'خانه',    cost: 50,    income: 1 },
  shop:    { name: 'مغازه',   cost: 300,   income: 6 },
  factory: { name: 'کارخانه', cost: 2000,  income: 35 },
  tower:   { name: 'برج',     cost: 15000, income: 200 },
};
const COST_GROWTH = 1.15;
const VIP_DAYS = 30;
const VIP_PRICE_STARS = 100;
const DAY_MS = 86400000;
const MAX_TEXT = 300;
// پیام صوتی مستقیم در D1 ذخیره می‌شود (بدون R2، بدون کارت بانکی)
// حدود ۲۰ ثانیه ضبط فشرده ≈ ۸۰ تا ۱۵۰ کیلوبایت
const MAX_VOICE_BYTES = 300_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const enc = new TextEncoder();

// ===== احراز هویت تلگرام (initData) =====
async function hmacRaw(key, msg) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const toHex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');

async function getUser(request, env) {
  const initData = request.headers.get('X-Init-Data');
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmacRaw(enc.encode('WebAppData'), env.BOT_TOKEN);
  const expected = toHex(await hmacRaw(secret, dataCheck));
  if (expected !== hash) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > DAY_MS / 1000) return null;
  return JSON.parse(params.get('user'));
}

const isAdmin = (env, user) =>
  env.ADMIN_IDS.split(',').map((s) => s.trim()).includes(String(user.id));

// ===== تلگرام API =====
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ===== بازیکن و وضعیت =====
async function ensurePlayer(env, user) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO players (id, name, last_update, created_at) VALUES (?, ?, ?, ?)'
  ).bind(user.id, user.first_name || 'بازیکن', now, now).run();
  return env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(user.id).first();
}

// محاسبه‌ی درآمد آفلاین و ذخیره‌ی وضعیت (بازی بی‌پایان: همیشه از آخرین زمان حساب می‌شود)
async function sync(env, user) {
  const p = await ensurePlayer(env, user);
  if (p.banned) return null;

  const rows = (await env.DB.prepare('SELECT type, count FROM buildings WHERE user_id = ?')
    .bind(user.id).all()).results;
  const owned = Object.fromEntries(Object.keys(BUILDINGS).map((t) => [t, 0]));
  for (const r of rows) if (r.type in owned) owned[r.type] = r.count;

  const now = Date.now();
  const mult = p.vip_until > now ? 2 : 1;
  const rate = Object.entries(owned).reduce((s, [t, n]) => s + n * BUILDINGS[t].income, 0) * mult;
  const coins = p.coins + (rate * (now - p.last_update)) / 1000;

  await env.DB.prepare('UPDATE players SET coins = ?, last_update = ? WHERE id = ?')
    .bind(coins, now, user.id).run();

  return { p, owned, coins, rate, mult, vipActive: p.vip_until > now, vipUntil: p.vip_until };
}

const costOf = (type, count) => Math.floor(BUILDINGS[type].cost * Math.pow(COST_GROWTH, count));

function publicState(s) {
  return {
    id: s.p.id,
    name: s.p.name,
    coins: Math.floor(s.coins),
    rate: Math.floor(s.rate),
    clickPower: s.p.click_power * s.mult,
    vipActive: s.vipActive,
    vipUntil: s.vipUntil,
    buildings: Object.entries(BUILDINGS).map(([type, b]) => ({
      type,
      name: b.name,
      income: b.income,
      count: s.owned[type],
      cost: costOf(type, s.owned[type]),
    })),
  };
}

// ===== Router =====
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/webhook' && request.method === 'POST') return handleWebhook(request, env);

      if (!path.startsWith('/api/')) return new Response('Not found', { status: 404 });

      const user = await getUser(request, env);
      if (!user) return json({ error: 'unauthorized' }, 401);

      const route = `${request.method} ${path}`;

      // ----- بازی -----
      if (route === 'GET /api/state') {
        const s = await sync(env, user);
        if (!s) return json({ error: 'banned' }, 403);
        return json(publicState(s));
      }

      if (route === 'POST /api/click') {
        const s = await sync(env, user);
        if (!s) return json({ error: 'banned' }, 403);
        const gain = s.p.click_power * s.mult;
        s.coins += gain;
        await env.DB.prepare('UPDATE players SET coins = ? WHERE id = ?').bind(s.coins, user.id).run();
        return json(publicState(s));
      }

      if (route === 'POST /api/buy') {
        const { type } = await request.json();
        if (!BUILDINGS[type]) return json({ error: 'invalid building' }, 400);
        const s = await sync(env, user);
        if (!s) return json({ error: 'banned' }, 403);
        const price = costOf(type, s.owned[type]);
        if (s.coins < price) return json({ error: 'not enough coins', ...publicState(s) }, 400);
        s.coins -= price;
        await env.DB.prepare('UPDATE players SET coins = ? WHERE id = ?').bind(s.coins, user.id).run();
        await env.DB.prepare(
          `INSERT INTO buildings (user_id, type, count) VALUES (?, ?, 1)
           ON CONFLICT(user_id, type) DO UPDATE SET count = count + 1`
        ).bind(user.id, type).run();
        s.owned[type] += 1;
        return json(publicState(s));
      }

      // ----- چت متنی و صوتی -----
      if (route === 'GET /api/messages') {
        const rows = (await env.DB.prepare(
          'SELECT id, user_id, name, text, (voice_type IS NOT NULL) AS has_voice, created_at FROM messages ORDER BY id DESC LIMIT 50'
        ).all()).results;
        return json({ messages: rows.reverse() });
      }

      if (route === 'POST /api/messages') {
        const { text } = await request.json();
        const clean = String(text || '').trim().slice(0, MAX_TEXT);
        if (!clean) return json({ error: 'empty' }, 400);
        const p = await ensurePlayer(env, user);
        if (p.banned) return json({ error: 'banned' }, 403);
        await env.DB.prepare(
          'INSERT INTO messages (user_id, name, text, created_at) VALUES (?, ?, ?, ?)'
        ).bind(user.id, p.name, clean, Date.now()).run();
        return json({ ok: true });
      }

      if (route === 'POST /api/voice') {
        const p = await ensurePlayer(env, user);
        if (p.banned) return json({ error: 'banned' }, 403);
        const body = await request.arrayBuffer();
        if (body.byteLength === 0 || body.byteLength > MAX_VOICE_BYTES) return json({ error: 'bad size' }, 413);
        const type = (request.headers.get('Content-Type') || 'audio/webm').slice(0, 60);
        await env.DB.prepare(
          'INSERT INTO messages (user_id, name, voice_data, voice_type, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(user.id, p.name, new Uint8Array(body), type, Date.now()).run();
        return json({ ok: true });
      }

      if (request.method === 'GET' && path.startsWith('/api/voice/')) {
        const id = Number(path.slice('/api/voice/'.length));
        if (!id) return json({ error: 'bad id' }, 400);
        const row = await env.DB.prepare('SELECT voice_data, voice_type FROM messages WHERE id = ?')
          .bind(id).first();
        if (!row || !row.voice_data) return json({ error: 'not found' }, 404);
        const raw = row.voice_data;
        const bytes = raw instanceof ArrayBuffer || ArrayBuffer.isView(raw) ? raw : Uint8Array.from(raw);
        return new Response(bytes, {
          headers: { 'Content-Type': row.voice_type || 'audio/webm', ...CORS },
        });
      }

      // ----- اشتراک VIP با Telegram Stars -----
      if (route === 'POST /api/vip/invoice') {
        const res = await tg(env, 'createInvoiceLink', {
          title: 'اشتراک VIP شهرساز',
          description: `${VIP_DAYS} روز درآمد و کلیک دو برابر`,
          payload: `vip-${user.id}`,
          provider_token: '',
          currency: 'XTR',
          prices: [{ label: `VIP ${VIP_DAYS} روزه`, amount: VIP_PRICE_STARS }],
        });
        if (!res.ok) return json({ error: 'invoice failed' }, 500);
        return json({ link: res.result });
      }

      // ----- پنل مدیریت -----
      if (path.startsWith('/api/admin/')) {
        if (!isAdmin(env, user)) return json({ error: 'forbidden' }, 403);
        return handleAdmin(request, env, route, url);
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'server error' }, 500);
    }
  },
};

// ===== وب‌هوک تلگرام: تأیید پرداخت و فعال‌سازی VIP =====
async function handleWebhook(request, env) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const upd = await request.json();

  if (upd.pre_checkout_query) {
    await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: upd.pre_checkout_query.id, ok: true });
  }

  const sp = upd.message?.successful_payment;
  if (sp && sp.currency === 'XTR') {
    const from = upd.message.from;
    const p = await ensurePlayer(env, { id: from.id, first_name: from.first_name });
    const base = Math.max(p.vip_until, Date.now());
    await env.DB.prepare('UPDATE players SET vip_until = ? WHERE id = ?')
      .bind(base + VIP_DAYS * DAY_MS, from.id).run();
  }
  return new Response('ok');
}

// ===== پنل مدیریت =====
async function handleAdmin(request, env, route, url) {
  if (route === 'GET /api/admin/stats') {
    const now = Date.now();
    const players = await env.DB.prepare('SELECT COUNT(*) AS n FROM players').first();
    const vip = await env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE vip_until > ?').bind(now).first();
    const banned = await env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE banned = 1').first();
    const msgs = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages').first();
    return json({ players: players.n, vip: vip.n, banned: banned.n, messages: msgs.n });
  }

  if (route === 'GET /api/admin/users') {
    const q = (url.searchParams.get('q') || '').trim();
    const rows = q
      ? await env.DB.prepare(
          'SELECT id, name, coins, vip_until, banned, created_at FROM players WHERE CAST(id AS TEXT) LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 100'
        ).bind(`%${q}%`, `%${q}%`).all()
      : await env.DB.prepare(
          'SELECT id, name, coins, vip_until, banned, created_at FROM players ORDER BY created_at DESC LIMIT 100'
        ).all();
    return json({ users: rows.results });
  }

  if (route === 'POST /api/admin/user') {
    const b = await request.json();
    const id = Number(b.id);
    if (!id) return json({ error: 'id required' }, 400);
    const now = Date.now();
    if (b.coins !== undefined) {
      await env.DB.prepare('UPDATE players SET coins = ?, last_update = ? WHERE id = ?')
        .bind(Number(b.coins), now, id).run();
    }
    if (b.click_power !== undefined) {
      await env.DB.prepare('UPDATE players SET click_power = ? WHERE id = ?').bind(Number(b.click_power), id).run();
    }
    if (b.banned !== undefined) {
      await env.DB.prepare('UPDATE players SET banned = ? WHERE id = ?').bind(b.banned ? 1 : 0, id).run();
    }
    if (b.vip_days !== undefined) {
      const p = await env.DB.prepare('SELECT vip_until FROM players WHERE id = ?').bind(id).first();
      if (!p) return json({ error: 'not found' }, 404);
      const days = Number(b.vip_days);
      const vip = days > 0 ? Math.max(p.vip_until, now) + days * DAY_MS : now;
      await env.DB.prepare('UPDATE players SET vip_until = ? WHERE id = ?').bind(vip, id).run();
    }
    return json({ ok: true });
  }

  if (route === 'POST /api/admin/delete-message') {
    const { id } = await request.json();
    await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(Number(id)).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

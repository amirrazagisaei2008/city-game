# شهرساز — بازی کلیکی تلگرامی (MVP)

## ساختار پروژه

```
city-game/
├── .github/workflows/deploy.yml   # دیپلوی خودکار با GitHub Actions
├── frontend/
│   ├── index.html                 # Mini App (بازی + چت + VIP)
│   └── admin.html                 # پنل مدیریت
└── worker/
    ├── src/index.js               # API، ثبت‌نام، بازی، چت، پرداخت، ادمین
    ├── schema.sql                 # جداول D1
    └── wrangler.toml              # تنظیمات Cloudflare
```

---

## مرحله ۱: ربات تلگرام

1. در تلگرام به **@BotFather** پیام بده و `/newbot` را بزن. توکن ربات را نگه دار.
2. همان ربات را با `/newapp` یا از بخش **Bot Settings → Menu Button** به Mini App وصل کن
   (آدرس، همان آدرس `pages.dev` بخش frontend است).
3. یک رندوم بساز برای امنیت وب‌هوک (مثلاً یک رشته‌ی طولانی تصادفی).

## مرحله ۲: GitHub

```bash
cd city-game
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/USERNAME/city-game.git
git push -u origin main
```

## مرحله ۳: Cloudflare (رایگان)

1. در **dash.cloudflare.com** حساب بساز و یک **Account ID** بگیر (در صفحه‌ی اصلی داشبورد).
2. **API Token** بساز: My Profile → API Tokens → Create Token → قالب **Edit Cloudflare Workers** و
   دسترسی **Cloudflare Pages: Edit** و **D1: Edit** به آن اضافه کن.
3. دیتابیس D1 بساز: **Storage & Databases → D1 → Create** با نام `city-game-db`.
   شناسه‌ی دیتابیس (Database ID) را در `worker/wrangler.toml` جای `PUT_YOUR_D1_DATABASE_ID_HERE` بگذار.
4. پروژه‌ی Pages بساز: **Workers & Pages → Create → Pages → Direct Upload** با نام `city-game`.
   (اولین بار ساخته شود، بعد از آن GitHub Actions خودش دیپلوی می‌کند.)
5. در آدرس‌های `frontend/index.html` و `frontend/admin.html` مقدار `API_BASE` را با آدرس Worker خودت عوض کن
   (بعد از اولین دیپلوی Worker، آدرس در خروجی ترمینال یا داشبورد Workers دیده می‌شود).

## مرحله ۴: متغیرهای امنیتی (Secrets)

یک بار از ترمینال داخل پوشه‌ی `worker` اجرا کن:

```bash
cd worker
npx wrangler login
npx wrangler secret put BOT_TOKEN          # توکن ربات از BotFather
npx wrangler secret put WEBHOOK_SECRET     # همان رشته‌ی تصادفی مرحله ۱
npx wrangler secret put ADMIN_IDS          # شناسه‌ی عددی تلگرام خودت، با کاما برای چند ادمین (مثلاً 123456,789012)
```

شناسه‌ی عددی تلگرام را از **@userinfobot** بگیر.

## مرحله ۵: ثبت وب‌هوک تلگرام و قابلیت پرداخت

بعد از اولین دیپلوی Worker، این آدرس را در مرورگر باز کن (توکن و رشته‌ی امنیتی را جایگزین کن):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://city-game-api.YOUR-SUBDOMAIN.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>&allowed_updates=["message","pre_checkout_query"]
```

پرداخت با **Telegram Stars** است؛ نیازی به درگاه ایرانی یا حساب بانکی نیست.

## مرحله ۶: دیپلوی خودکار

هر بار که به شاخه‌ی `main` پوش می‌کنی، GitHub Actions سه کار را انجام می‌دهد:
اعمال schema روی D1، دیپلوی Worker، و دیپلوی frontend روی Pages.

برای این کار در GitHub به مسیر **Settings → Secrets and variables → Actions** برو و این دو مورد را اضافه کن:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

---

## استفاده

- **بازی**: کاربر وارد ربات می‌شود و Mini App را باز می‌کند. با اولین ورود خودکار ثبت‌نام می‌شود.
- **پنل مدیریت**: در مرورگر یا داخل تلگرام آدرس `.../admin.html` را باز کن (فقط شناسه‌های داخل `ADMIN_IDS` دسترسی دارند).
  از آنجا می‌توانی سکه تنظیم کنی، VIP اضافه یا لغو کنی، کاربر را مسدود کنی و آمار را ببینی.

## محدودیت‌های این نسخه (عمداً ساده نگه داشته شده)

- **پیام صوتی** مستقیم در D1 ذخیره می‌شود و حداکثر ۲۰ ثانیه و ۳۰۰ کیلوبایت است (سقف رایگان D1 و بدون نیاز به R2).
- **چت زنده و تماس صوتی** نیست؛ چت متنی و پیام صوتی ضبط‌شده است. چت هر ۴ ثانیه به‌روز می‌شود.
  برای چت لحظه‌ای بهتر است بعداً Durable Objects با WebSocket اضافه شود.
- **حذف پیام توسط ادمین** فقط از API پشتیبانی می‌شود (`/api/admin/delete-message`)؛ دکمه‌اش در پنل نیست.
- **همزمانی**: اگر یک کاربر خیلی سریع چند درخواست بفرستد ممکن است یک کلیک گم شود. برای نسخه‌ی تولیدی باید منطق سکه داخل Durable Object باشد.
- **CORS** با `*` باز است؛ امنیت اصلی با اعتبارسنجی `initData` تلگرام انجام می‌شود.
- **تعادل بازی** (قیمت‌ها و درآمدها) در بخش `BUILDINGS` در `worker/src/index.js` است؛ هر وقت خواستی تغییرشان بده.
- **دسترسی از ایران**: تلگرام، GitHub و Cloudflare ممکن است فیلتر یا کند باشند؛ این موضوع خارج از کد است.

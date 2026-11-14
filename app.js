/**
 * NetPlus Pro - Interactive Frontend Logic
 * Manages Demo Volume & Time Selectors for BOTH sections
 */

// State for Section 1 (VIP Single-User)
const stateVip = {
  volume: '20گیگ',
  time: '30روز',
  title: 'بخش اول: سرویس تک‌کاربره اختصاصی'
};

// State for Section 2 (Multi-User & Family)
const stateMulti = {
  volume: '50 گیگ',
  time: '60روز',
  title: 'بخش دوم: سرویس چندکاربره و تیمی'
};

// Base Price Matrix for Volumes (in Tomans) - Display/Demo Only
const volumeBasePrices = {
  '300مگ': 18000,
  '1گیگ': 29000,
  '5گیگ': 49000,
  '10گیگ': 78000,
  '15گیگ': 105000,
  '20گیگ': 125000,
  '30گیگ': 165000,
  '45گیگ': 210000,
  '50 گیگ': 235000,
  'نامحدود': 340000
};

// Multipliers for Time Options
const timeMultipliers = {
  '7روز': 0.55,
  '14 روز': 0.75,
  '21روز': 0.88,
  '30روز': 1.00,
  '45روز': 1.35,
  '60روز': 1.70,
  '75روز': 2.05,
  '90روز': 2.40,
  '1 سال': 6.80
};

// Helper: Format Persian/English Numbers with comma separators
function formatPrice(num) {
  const rounded = Math.round(num / 1000) * 1000;
  return rounded.toLocaleString('en-US');
}

// Calculate Price for a section
function calculatePrice(sectionKey) {
  const isVip = sectionKey === 'vip';
  const state = isVip ? stateVip : stateMulti;

  const base = volumeBasePrices[state.volume] || 100000;
  const mult = timeMultipliers[state.time] || 1.0;
  
  // Section 2 has multi-device factor (1.45x)
  const factor = isVip ? 1.0 : 1.45;

  return base * mult * factor;
}

// Update Section 1 UI
function updateVipUI() {
  // Update Chips Active States
  document.querySelectorAll('#vip-volume-chips .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === stateVip.volume);
  });
  document.querySelectorAll('#vip-time-chips .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === stateVip.time);
  });

  // Update Summary texts
  document.getElementById('vip-volume-display').textContent = stateVip.volume;
  document.getElementById('vip-time-display').textContent = stateVip.time;
  document.getElementById('vip-sum-vol').textContent = stateVip.volume;
  document.getElementById('vip-sum-time').textContent = stateVip.time;

  // Update Price
  const price = calculatePrice('vip');
  document.getElementById('vip-calc-price').textContent = formatPrice(price);
}

// Update Section 2 UI
function updateMultiUI() {
  // Update Chips Active States
  document.querySelectorAll('#multi-volume-chips .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === stateMulti.volume);
  });
  document.querySelectorAll('#multi-time-chips .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === stateMulti.time);
  });

  // Update Summary texts
  document.getElementById('multi-volume-display').textContent = stateMulti.volume;
  document.getElementById('multi-time-display').textContent = stateMulti.time;
  document.getElementById('multi-sum-vol').textContent = stateMulti.volume;
  document.getElementById('multi-sum-time').textContent = stateMulti.time;

  // Update Price
  const price = calculatePrice('multi');
  document.getElementById('multi-calc-price').textContent = formatPrice(price);
}

// Handler: Select Volume
function selectVolume(sectionKey, volumeVal) {
  if (sectionKey === 'vip') {
    stateVip.volume = volumeVal;
    updateVipUI();
  } else {
    stateMulti.volume = volumeVal;
    updateMultiUI();
  }
}

// Handler: Select Time
function selectTime(sectionKey, timeVal) {
  if (sectionKey === 'vip') {
    stateVip.time = timeVal;
    updateVipUI();
  } else {
    stateMulti.time = timeVal;
    updateMultiUI();
  }
}

// Switch View (Both, VIP only, Multi only)
function switchView(viewMode) {
  const btnBoth = document.getElementById('btn-show-both');
  const btnVip = document.getElementById('btn-show-vip');
  const btnMulti = document.getElementById('btn-show-multi');

  const cardVip = document.getElementById('section-vip');
  const cardMulti = document.getElementById('section-multi');
  const grid = document.getElementById('sections-grid');

  btnBoth.classList.remove('active');
  btnVip.classList.remove('active');
  btnMulti.classList.remove('active');

  if (viewMode === 'both') {
    btnBoth.classList.add('active');
    cardVip.style.display = 'flex';
    cardMulti.style.display = 'flex';
    grid.style.gridTemplateColumns = '1fr 1fr';
    if (window.innerWidth <= 1024) {
      grid.style.gridTemplateColumns = '1fr';
    }
  } else if (viewMode === 'vip') {
    btnVip.classList.add('active');
    cardVip.style.display = 'flex';
    cardMulti.style.display = 'none';
    grid.style.gridTemplateColumns = 'minmax(320px, 620px)';
    grid.style.justifyContent = 'center';
  } else if (viewMode === 'multi') {
    btnMulti.classList.add('active');
    cardVip.style.display = 'none';
    cardMulti.style.display = 'flex';
    grid.style.gridTemplateColumns = 'minmax(320px, 620px)';
    grid.style.justifyContent = 'center';
  }
}

// Order Modal Handlers
function openOrderModal(sectionTitle, sectionKey) {
  const modal = document.getElementById('orderModal');
  const state = sectionKey === 'vip' ? stateVip : stateMulti;
  const price = calculatePrice(sectionKey);

  document.getElementById('modalSectionName').textContent = sectionTitle;
  document.getElementById('modalVolumeValue').textContent = state.volume;
  document.getElementById('modalTimeValue').textContent = state.time;
  document.getElementById('modalPriceValue').textContent = `${formatPrice(price)} تومان`;

  // Dynamic sample config with selected parameters
  const serverHost = sectionKey === 'vip' ? 'de-vip.netplus-demo.net' : 'nl-multi.netplus-demo.net';
  const configType = sectionKey === 'vip' ? 'SingleUser' : 'FamilyTeam';
  const sampleUrl = `vless://8f3b21a0-4c21-4f11-9a22-381c19b33a21@${serverHost}:443?security=reality&sni=speedtest.net&fp=chrome&pbk=DEMO_PREVIEW_PUBLIC_KEY&type=grpc&serviceName=grpc#NetPlus-${configType}-${state.volume}-${state.time}-Demo`;
  
  document.getElementById('sampleConfigText').textContent = sampleUrl;

  modal.classList.add('active');
}

function openTestConfigModal() {
  openOrderModal('کانفیگ تستی و بررسی اتصال', 'vip');
}

function closeOrderModalDirect() {
  document.getElementById('orderModal').classList.remove('active');
}

function closeOrderModal(e) {
  if (e.target.id === 'orderModal') {
    closeOrderModalDirect();
  }
}

// Copy Config Text
function copySampleConfig() {
  const text = document.getElementById('sampleConfigText').textContent.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('کانفیگ نمونه نمایشی کپی شد!');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand('copy');
  document.body.removeChild(tempInput);
  showToast('کانفیگ نمونه کپی شد!');
}

// Toast Alert
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toastBox');
  const toastMsg = document.getElementById('toastMsg');
  toastMsg.textContent = msg;

  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// FAQ Accordion Toggle
function toggleFaq(elem) {
  const card = elem.closest('.faq-card');
  const isOpen = card.classList.contains('open');

  // Optional: close other open cards
  document.querySelectorAll('.faq-card').forEach(c => c.classList.remove('open'));

  if (!isOpen) {
    card.classList.add('open');
  }
}

// Keydown ESC to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeOrderModalDirect();
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  updateVipUI();
  updateMultiUI();
});

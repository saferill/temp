/**
 * Tempik Mail — Modern Gmail Material 3 Client
 * Handles inbox management, real-time polling, reading view, XSS sanitization,
 * search filtering, OTP detection, and starred messages.
 */

// ---- DOM Elements ----
const menuToggleBtn = document.getElementById('menuToggleBtn');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const gmailSidebar = document.getElementById('gmailSidebar');

const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');

const syncStatus = document.getElementById('syncStatus');
const chipAddressText = document.getElementById('chipAddressText');
const copyAddressChip = document.getElementById('copyAddressChip');
const quickCopyBtn = document.getElementById('quickCopyBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconDark = document.getElementById('themeIconDark');
const themeIconLight = document.getElementById('themeIconLight');

// Sidebar
const openComposeBtn = document.getElementById('openComposeBtn');
const navInbox = document.getElementById('navInbox');
const navStarred = document.getElementById('navStarred');
const inboxCountBadge = document.getElementById('inboxCountBadge');
const starredCountBadge = document.getElementById('starredCountBadge');
const totalInboxesCount = document.getElementById('totalInboxesCount');
const sidebarAddressList = document.getElementById('sidebarAddressList');
const navDeleteCurrentInboxBtn = document.getElementById('navDeleteCurrentInboxBtn');

// Toolbar
const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = document.getElementById('refreshIcon');
const currentViewTitle = document.getElementById('currentViewTitle');
const mailCountText = document.getElementById('mailCountText');
const mobileAddressSelect = document.getElementById('mobileAddressSelect');

// Views
const emailListView = document.getElementById('emailListView');
const emailRows = document.getElementById('emailRows');
const emailReadingView = document.getElementById('emailReadingView');

// Reading view elements
const readingBackBtn = document.getElementById('readingBackBtn');
const readingStarBtn = document.getElementById('readingStarBtn');
const readingStarIcon = document.getElementById('readingStarIcon');
const readingDeleteBtn = document.getElementById('readingDeleteBtn');
const readingSubject = document.getElementById('readingSubject');
const readingSenderAvatar = document.getElementById('readingSenderAvatar');
const readingSenderName = document.getElementById('readingSenderName');
const readingSenderAddress = document.getElementById('readingSenderAddress');
const readingRecipient = document.getElementById('readingRecipient');
const readingDateTime = document.getElementById('readingDateTime');
const readingBodyContent = document.getElementById('readingBodyContent');
const otpBanner = document.getElementById('otpBanner');
const detectedOtpCode = document.getElementById('detectedOtpCode');
const copyOtpBtn = document.getElementById('copyOtpBtn');

// Modal elements
const composeModalOverlay = document.getElementById('composeModalOverlay');
const closeComposeBtn = document.getElementById('closeComposeBtn');
const customLocalPartInput = document.getElementById('customLocalPartInput');
const modalDomainSelect = document.getElementById('modalDomainSelect');
const createRandomAddressBtn = document.getElementById('createRandomAddressBtn');
const createCustomAddressBtn = document.getElementById('createCustomAddressBtn');

const toastContainer = document.getElementById('toastContainer');

// ---- State & Storage Keys ----
const SESSION_KEY = 'tempik_session_id';
const THEME_KEY = 'tempik_theme_mode';
const STARRED_KEY = 'tempik_starred_messages';
const READ_KEY = 'tempik_read_messages';
const ACTIVE_ADDR_KEY = 'tempik_active_address';

let appConfig = {
  appName: 'Tempik',
  mailDomain: 'example.com',
  mailDomains: ['example.com'],
  webHost: 'tempik.example.com',
};

let sessionId = localStorage.getItem(SESSION_KEY) || '';
let inboxes = [];
let currentAddress = localStorage.getItem(ACTIVE_ADDR_KEY) || '';
let messages = [];
let activeMessage = null;
let currentFolder = 'inbox'; // 'inbox' | 'starred'
let searchQuery = '';

let starredIds = new Set(JSON.parse(localStorage.getItem(STARRED_KEY) || '[]'));
let readIds = new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));

let pollTimer = null;
let isSyncing = false;
let audioCtx = null;

// ---- Utilities ----

function saveStarred() {
  localStorage.setItem(STARRED_KEY, JSON.stringify([...starredIds]));
}

function saveRead() {
  localStorage.setItem(READ_KEY, JSON.stringify([...readIds]));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSenderInitials(fromStr) {
  if (!fromStr) return '?';
  const clean = fromStr.replace(/<.*?>/, '').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || '?';
}

function getAvatarBgColor(str) {
  const colors = [
    '#0b57d0', '#1a73e8', '#d93025', '#ea4335',
    '#188038', '#34a853', '#f29900', '#f9ab00',
    '#a142f4', '#9334e6', '#129eaf', '#e37400'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatRelativeTime(dateStr) {
  try {
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullTime(dateStr) {
  try {
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    return d.toLocaleString([], {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

// Gentle audio notification using Web Audio API
function playChime() {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Audio context may be blocked by browser policy until interaction
  }
}

function showToast(text, duration = 3000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('fadeout');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// Universal Clipboard Copy with Fallback for non-HTTPS / HTTP contexts
async function copyTextToClipboard(text) {
  if (!text) return false;

  // 1. Try Modern Clipboard API if available and in secure context
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('navigator.clipboard writeText failed, using fallback:', e);
    }
  }

  // 2. Reliable execCommand fallback for HTTP & non-secure contexts
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('execCommand copy failed:', err);
    return false;
  }
}

// Safe formatting for body with sandboxed iframe and automatic link detection
function renderSafeBody(container, rawBody) {
  container.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.style.background = 'transparent';
  iframe.style.display = 'block';
  iframe.style.minHeight = '150px';

  let contentHtml = '';
  const isHtml = /<[a-z][\s\S]*>/i.test(rawBody);

  if (!rawBody) {
    contentHtml = '<p style="color:var(--text-tertiary, #888);font-style:italic;">(Isi pesan kosong)</p>';
  } else if (isHtml) {
    contentHtml = rawBody;
  } else {
    // Plain text: escape HTML and convert newlines & URLs to links
    const escaped = escapeHtml(rawBody);
    const withLinks = escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    contentHtml = withLinks.replace(/\n/g, '<br/>');
  }

  const isDark = document.body.classList.contains('theme-dark');
  const textColor = isDark ? '#e2e2e6' : '#1f1f1f';

  // Inject <base target="_blank"> to force all links to open in a new tab
  let srcdoc = '';
  if (isHtml && /<html[\s\S]*>/i.test(contentHtml)) {
    if (/<head[\s\S]*>/i.test(contentHtml)) {
      srcdoc = contentHtml.replace(/<head\b[^>]*>/i, '$&<base target="_blank">');
    } else {
      srcdoc = `<base target="_blank">${contentHtml}`;
    }
  } else {
    srcdoc = `<!DOCTYPE html><html><head><base target="_blank"><style>body{margin:0;padding:2px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6;color:${textColor};word-break:break-word;overflow-wrap:break-word;}img{max-width:100%;height:auto;}a{color:#0b57d0;}</style></head><body>${contentHtml}</body></html>`;
  }

  iframe.srcdoc = srcdoc;

  iframe.onload = () => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        const links = doc.querySelectorAll('a');
        links.forEach((a) => a.setAttribute('target', '_blank'));
        if (doc.body) {
          const height = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0);
          if (height && height > 0) {
            iframe.style.height = `${height + 16}px`;
          }
        }
      }
    } catch (err) {
      // Ignored if cross-origin sandbox restrictions prevent access
    }
  };

  container.appendChild(iframe);
}

// Detect OTP / 4-8 digit verification code
function detectOtp(subject, body) {
  const full = `${subject || ''} ${body || ''}`;
  const patterns = [
    /(?:code|otp|kode|verifikasi|verification|pin)[^\w\d]{0,15}(?:G-)?(\d{4,8})\b/i,
    /\b(G-\d{6})\b/i,
  ];
  for (const regex of patterns) {
    const match = full.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// ---- API Helpers ----

async function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---- Theme Management ----

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.body.classList.replace('theme-light', 'theme-dark');
    themeIconDark.classList.add('hidden');
    themeIconLight.classList.remove('hidden');
  } else {
    document.body.classList.replace('theme-dark', 'theme-light');
    themeIconDark.classList.remove('hidden');
    themeIconLight.classList.add('hidden');
  }
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = document.body.classList.contains('theme-dark');
  if (isDark) {
    document.body.classList.replace('theme-dark', 'theme-light');
    themeIconDark.classList.remove('hidden');
    themeIconLight.classList.add('hidden');
    localStorage.setItem(THEME_KEY, 'light');
    showToast('☀️ Mode Terang aktif');
  } else {
    document.body.classList.replace('theme-light', 'theme-dark');
    themeIconDark.classList.add('hidden');
    themeIconLight.classList.remove('hidden');
    localStorage.setItem(THEME_KEY, 'dark');
    showToast('🌙 Mode Gelap aktif');
  }
});

// ---- Core Logic ----

async function loadConfig() {
  try {
    appConfig = await fetchJson('/api/config', { headers: {} });
    document.title = `${appConfig.appName} Mail — Disposable Temp Email`;

    // Populate modal domain dropdown
    const domains = appConfig.mailDomains || [appConfig.mailDomain];
    modalDomainSelect.innerHTML = '';
    domains.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `@${d}`;
      modalDomainSelect.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

async function ensureSession() {
  if (!sessionId) {
    const payload = await fetchJson('/api/session');
    sessionId = payload.sessionId;
    localStorage.setItem(SESSION_KEY, sessionId);
  }
}

// Load inboxes; if none exist, auto-create one!
async function loadInboxes(preferredAddress) {
  inboxes = await fetchJson('/api/inboxes');

  // Auto-generate first email if no inbox exists in this session
  if (!inboxes.length) {
    showToast('🎲 Membuat alamat email sementara pertama untuk Anda...', 2500);
    const newInbox = await fetchJson('/api/inboxes', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    inboxes = [newInbox];
    preferredAddress = newInbox.address;
    showToast('✨ Alamat email sementara siap digunakan!');
  }

  // Determine active address
  if (preferredAddress && inboxes.some((i) => i.address === preferredAddress)) {
    currentAddress = preferredAddress;
  } else if (!currentAddress || !inboxes.some((i) => i.address === currentAddress)) {
    currentAddress = inboxes[0].address;
  }
  localStorage.setItem(ACTIVE_ADDR_KEY, currentAddress);

  // Update UI components for addresses
  renderAddressList();
  updateActiveAddressChip();
  await loadMessages();
}

function updateActiveAddressChip() {
  chipAddressText.textContent = currentAddress || 'Belum ada alamat';
}

function renderAddressList() {
  totalInboxesCount.textContent = inboxes.length;
  sidebarAddressList.innerHTML = '';
  mobileAddressSelect.innerHTML = '';

  inboxes.forEach((inbox) => {
    // Sidebar item
    const item = document.createElement('div');
    item.className = `sidebar-address-item ${inbox.address === currentAddress ? 'active' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'address-dot';

    const name = document.createElement('span');
    name.className = 'address-name';
    name.title = inbox.address;
    name.textContent = inbox.address;

    item.appendChild(dot);
    item.appendChild(name);
    item.addEventListener('click', () => switchAddress(inbox.address));
    sidebarAddressList.appendChild(item);

    // Mobile select option
    const opt = document.createElement('option');
    opt.value = inbox.address;
    opt.textContent = inbox.address;
    opt.selected = inbox.address === currentAddress;
    mobileAddressSelect.appendChild(opt);
  });
}

async function switchAddress(address) {
  if (address === currentAddress) return;
  currentAddress = address;
  localStorage.setItem(ACTIVE_ADDR_KEY, currentAddress);
  renderAddressList();
  updateActiveAddressChip();
  closeMobileSidebar();
  showListView();
  await loadMessages();
  showToast(`📬 Beralih ke ${currentAddress}`);
}

mobileAddressSelect.addEventListener('change', (e) => {
  switchAddress(e.target.value);
});

// Load messages for current inbox
async function loadMessages() {
  if (!currentAddress) return;
  setSyncingState(true);

  try {
    messages = await fetchJson(`/api/inboxes/${encodeURIComponent(currentAddress)}/messages`);
    renderMessages();
  } catch (err) {
    console.error('Failed to load messages:', err);
    emailRows.innerHTML = `
      <div class="mail-empty-state">
        <div class="empty-icon-wrap">⚠️</div>
        <div class="empty-title">Gagal memuat pesan</div>
        <div class="empty-subtitle">${escapeHtml(err.message)}</div>
      </div>
    `;
  } finally {
    setSyncingState(false);
  }
}

// Background silent polling
async function silentRefresh() {
  if (document.visibilityState !== 'visible') return;
  if (!currentAddress || isSyncing) return;
  setSyncingState(true);

  try {
    const latestMessages = await fetchJson(`/api/inboxes/${encodeURIComponent(currentAddress)}/messages`);
    
    // Check if message ID list is identical (avoid unnecessary DOM rebuilds)
    const oldIds = messages.map((m) => m.id);
    const newIds = latestMessages.map((m) => m.id);
    const isSame =
      oldIds.length === newIds.length &&
      oldIds.every((id, idx) => id === newIds[idx]);

    if (isSame) {
      return;
    }

    const currentIdSet = new Set(oldIds);
    const newArrivals = latestMessages.filter((m) => !currentIdSet.has(m.id));

    messages = latestMessages;
    renderMessages();

    if (newArrivals.length > 0) {
      playChime();

      // Show toast and browser title notification
      const sender = newArrivals[0].from_address;
      showToast(`📬 Email baru diterima dari: ${sender}`);
      document.title = `(${newArrivals.length}) Pesan Baru — ${appConfig.appName}`;
    }
  } catch (e) {
    console.debug('Background sync check failed:', e);
  } finally {
    setSyncingState(false);
  }
}

function setSyncingState(syncing) {
  isSyncing = syncing;
  const pulse = syncStatus.querySelector('.sync-pulse');
  if (syncing) {
    pulse.classList.add('syncing');
    refreshIcon.classList.add('spinning');
  } else {
    pulse.classList.remove('syncing');
    refreshIcon.classList.remove('spinning');
  }
}

// Render message rows
function renderMessages() {
  // Filter by folder (inbox vs starred)
  let list = messages;
  if (currentFolder === 'starred') {
    list = list.filter((m) => starredIds.has(m.id));
    currentViewTitle.textContent = 'Berbintang';
  } else {
    currentViewTitle.textContent = 'Kotak Masuk';
  }

  // Filter by search query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from_address.toLowerCase().includes(q) ||
        (m.snippet && m.snippet.toLowerCase().includes(q)) ||
        (m.body && m.body.toLowerCase().includes(q))
    );
    currentViewTitle.textContent = `Pencarian: "${searchQuery}"`;
  }

  // Update badges
  const unreadCount = messages.filter((m) => !readIds.has(m.id)).length;
  inboxCountBadge.textContent = unreadCount;
  inboxCountBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';

  const starredCount = messages.filter((m) => starredIds.has(m.id)).length;
  starredCountBadge.textContent = starredCount;
  starredCountBadge.style.display = starredCount > 0 ? 'inline-block' : 'none';

  mailCountText.textContent = `${list.length} pesan`;

  // Empty state
  if (!list.length) {
    if (searchQuery) {
      emailRows.innerHTML = `
        <div class="mail-empty-state">
          <div class="empty-icon-wrap">🔍</div>
          <div class="empty-title">Tidak ada hasil pencarian</div>
          <div class="empty-subtitle">Tidak ada email yang cocok dengan "${escapeHtml(searchQuery)}"</div>
        </div>
      `;
    } else if (currentFolder === 'starred') {
      emailRows.innerHTML = `
        <div class="mail-empty-state">
          <div class="empty-icon-wrap">⭐</div>
          <div class="empty-title">Belum ada email berbintang</div>
          <div class="empty-subtitle">Klik ikon bintang pada email untuk menyimpannya di sini.</div>
        </div>
      `;
    } else {
      emailRows.innerHTML = `
        <div class="mail-empty-state">
          <div class="empty-icon-wrap">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5v-3h3.56c.69 1.19 1.97 2 3.44 2s2.75-.81 3.44-2H19v3zm0-5h-4.99c0 1.1-.9 2-2 2s-2-.9-2-2H5V5h14v9z"/></svg>
          </div>
          <div class="empty-title">Kotak Masuk Anda Bersih</div>
          <div class="empty-subtitle">Kirimkan email ke <b>${escapeHtml(currentAddress)}</b>. Email akan otomatis muncul di sini.</div>
        </div>
      `;
    }
    return;
  }

  // Render rows
  emailRows.innerHTML = '';
  list.forEach((msg) => {
    const isUnread = !readIds.has(msg.id);
    const isStarred = starredIds.has(msg.id);
    const initials = getSenderInitials(msg.from_address);
    const avatarBg = getAvatarBgColor(msg.from_address);
    const timeDisplay = formatRelativeTime(msg.received_at);
    const snippetText = (msg.snippet || msg.body || '')
      .replace(/<[^>]*>?/gm, '')
      .slice(0, 100);

    const row = document.createElement('div');
    row.className = `mail-row ${isUnread ? 'unread' : 'read'}`;
    row.innerHTML = `
      <button class="star-btn ${isStarred ? 'starred' : ''}" title="Bintang" data-id="${msg.id}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      </button>

      <div class="mail-avatar" style="background-color: ${avatarBg}">${initials}</div>

      <div class="mail-sender" title="${escapeHtml(msg.from_address)}">
        ${escapeHtml(msg.from_address.split('<')[0].trim() || msg.from_address)}
      </div>

      <div class="mail-subject-snippet">
        <span class="mail-subject">${escapeHtml(msg.subject || '(Tanpa Subjek)')}</span>
        <span class="mail-snippet">— ${escapeHtml(snippetText)}</span>
      </div>

      <div class="mail-date">${timeDisplay}</div>

      <div class="mail-row-actions">
        <button class="action-icon-btn danger-action" title="Hapus email ini" data-delete-id="${msg.id}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // Row click: open reading view
    row.addEventListener('click', (e) => {
      // Don't open if clicking star or delete icon
      if (e.target.closest('.star-btn') || e.target.closest('.action-icon-btn')) {
        return;
      }
      openReadingView(msg);
    });

    // Star click
    const starBtn = row.querySelector('.star-btn');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(msg.id);
    });

    // Delete single message click
    const deleteBtn = row.querySelector('[data-delete-id]');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Hapus pesan email ini?')) return;
      await deleteSingleMessage(msg.id);
    });

    emailRows.appendChild(row);
  });
}

// Toggle star state
function toggleStar(msgId) {
  if (starredIds.has(msgId)) {
    starredIds.delete(msgId);
  } else {
    starredIds.add(msgId);
  }
  saveStarred();
  renderMessages();

  // If currently in reading view and viewing this message, update button
  if (activeMessage && activeMessage.id === msgId) {
    updateReadingStarIcon();
  }
}

// Delete single message
async function deleteSingleMessage(msgId) {
  try {
    await fetchJson(
      `/api/inboxes/${encodeURIComponent(currentAddress)}/messages/${encodeURIComponent(msgId)}`,
      { method: 'DELETE' }
    );
    starredIds.delete(msgId);
    readIds.delete(msgId);
    saveStarred();
    saveRead();

    showToast('🗑️ Pesan berhasil dihapus');

    if (activeMessage && activeMessage.id === msgId) {
      showListView();
    }
    await loadMessages();
  } catch (err) {
    showToast('❌ Gagal menghapus pesan');
    console.error(err);
  }
}

// Open reading view (fetches full message body on demand)
async function openReadingView(msg) {
  activeMessage = msg;
  readIds.add(msg.id);
  saveRead();

  // Reset title in case it had (1) Pesan Baru
  document.title = `${appConfig.appName} Mail — Disposable Temp Email`;

  readingSubject.textContent = msg.subject || '(Tanpa Subjek)';
  const initials = getSenderInitials(msg.from_address);
  readingSenderAvatar.textContent = initials;
  readingSenderAvatar.style.backgroundColor = getAvatarBgColor(msg.from_address);

  readingSenderName.textContent = msg.from_address.split('<')[0].trim() || msg.from_address;
  readingSenderAddress.textContent = `<${msg.from_address}>`;
  readingRecipient.textContent = `saya <${currentAddress}>`;
  readingDateTime.textContent = formatFullTime(msg.received_at);

  // Initial loading state
  otpBanner.classList.add('hidden');
  readingBodyContent.innerHTML = '<p style="color:var(--text-tertiary, #888);padding:16px 0;font-style:italic;">Memuat isi pesan...</p>';

  updateReadingStarIcon();

  // Switch views
  emailListView.classList.add('hidden');
  emailReadingView.classList.remove('hidden');

  const viewingId = msg.id;
  try {
    const fullMsg = await fetchJson(
      `/api/inboxes/${encodeURIComponent(currentAddress)}/messages/${encodeURIComponent(viewingId)}`
    );

    // Make sure user hasn't navigated away from this message
    if (activeMessage && activeMessage.id === viewingId) {
      msg.body = fullMsg.body || '';
      renderSafeBody(readingBodyContent, msg.body);

      // OTP Detection on full message body
      const otp = detectOtp(msg.subject, msg.body);
      if (otp) {
        detectedOtpCode.textContent = otp;
        otpBanner.classList.remove('hidden');
      } else {
        otpBanner.classList.add('hidden');
      }
    }
  } catch (err) {
    if (activeMessage && activeMessage.id === viewingId) {
      console.error('Failed to load full message body:', err);
      readingBodyContent.innerHTML = `<p style="color:#d93025;padding:16px 0;">Gagal memuat isi pesan: ${escapeHtml(err.message)}</p>`;
    }
  }
}

function updateReadingStarIcon() {
  if (!activeMessage) return;
  const isStarred = starredIds.has(activeMessage.id);
  if (isStarred) {
    readingStarIcon.setAttribute('fill', 'var(--star-active)');
    readingStarIcon.style.color = 'var(--star-active)';
  } else {
    readingStarIcon.setAttribute('fill', 'none');
    readingStarIcon.style.color = 'currentColor';
  }
}

function showListView() {
  activeMessage = null;
  emailReadingView.classList.add('hidden');
  emailListView.classList.remove('hidden');
  renderMessages();
}

readingBackBtn.addEventListener('click', showListView);

readingStarBtn.addEventListener('click', () => {
  if (!activeMessage) return;
  toggleStar(activeMessage.id);
});

readingDeleteBtn.addEventListener('click', async () => {
  if (!activeMessage) return;
  if (!confirm('Hapus pesan email ini secara permanen?')) return;
  await deleteSingleMessage(activeMessage.id);
});

copyOtpBtn.addEventListener('click', async () => {
  const code = detectedOtpCode.textContent;
  if (!code) return;
  const ok = await copyTextToClipboard(code);
  if (ok) {
    showToast(`📋 Kode OTP disalin: ${code}`);
  } else {
    showToast(`📋 Kode OTP: ${code}`);
  }
});

// Navigation Folders (Inbox vs Starred)
navInbox.addEventListener('click', () => {
  currentFolder = 'inbox';
  navInbox.classList.add('active');
  navStarred.classList.remove('active');
  showListView();
  closeMobileSidebar();
});

navStarred.addEventListener('click', () => {
  currentFolder = 'starred';
  navStarred.classList.add('active');
  navInbox.classList.remove('active');
  showListView();
  closeMobileSidebar();
});

// Delete Entire Active Inbox
navDeleteCurrentInboxBtn.addEventListener('click', async () => {
  if (!currentAddress) return;
  if (!confirm(`Hapus alamat ${currentAddress}? Seluruh email masuk di alamat ini akan dihapus permanen.`)) {
    return;
  }

  try {
    await fetchJson(`/api/inboxes/${encodeURIComponent(currentAddress)}`, {
      method: 'DELETE',
    });
    showToast(`🗑️ Alamat ${currentAddress} dan seluruh isinya telah dihapus`);
    currentAddress = '';
    localStorage.removeItem(ACTIVE_ADDR_KEY);
    await loadInboxes();
  } catch (err) {
    showToast('❌ Gagal menghapus alamat email');
    console.error(err);
  }
});

// Quick Copy Active Address
async function handleCopyCurrentAddress() {
  if (!currentAddress) return;
  const ok = await copyTextToClipboard(currentAddress);
  if (ok) {
    showToast(`📋 Alamat disalin: ${currentAddress}`);
    quickCopyBtn.classList.add('copied');
    setTimeout(() => quickCopyBtn.classList.remove('copied'), 1500);
  } else {
    showToast(`📋 Alamat: ${currentAddress}`);
  }
}

copyAddressChip.addEventListener('click', handleCopyCurrentAddress);

quickCopyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  handleCopyCurrentAddress();
});

// Refresh Button
refreshBtn.addEventListener('click', async () => {
  await loadMessages();
  showToast('🔄 Pesan diperbarui');
});

// Search Input Handler
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  if (searchQuery) {
    searchClearBtn.classList.remove('hidden');
  } else {
    searchClearBtn.classList.add('hidden');
  }
  showListView();
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClearBtn.classList.add('hidden');
  showListView();
});

// Compose Modal (Create New Address)
openComposeBtn.addEventListener('click', () => {
  customLocalPartInput.value = '';
  composeModalOverlay.classList.remove('hidden');
  customLocalPartInput.focus();
});

closeComposeBtn.addEventListener('click', () => {
  composeModalOverlay.classList.add('hidden');
});

composeModalOverlay.addEventListener('click', (e) => {
  if (e.target === composeModalOverlay) {
    composeModalOverlay.classList.add('hidden');
  }
});

createRandomAddressBtn.addEventListener('click', async () => {
  const domain = modalDomainSelect.value;
  composeModalOverlay.classList.add('hidden');
  showToast('🎲 Sedang membuat alamat acak baru...');

  try {
    const inbox = await fetchJson('/api/inboxes', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    });
    showToast(`✨ Berhasil membuat: ${inbox.address}`);
    await loadInboxes(inbox.address);
  } catch (err) {
    showToast(`❌ Gagal: ${err.message}`);
  }
});

createCustomAddressBtn.addEventListener('click', async () => {
  const localPart = customLocalPartInput.value.trim();
  const domain = modalDomainSelect.value;
  composeModalOverlay.classList.add('hidden');
  showToast('✦ Sedang membuat alamat kustom...');

  try {
    const inbox = await fetchJson('/api/inboxes', {
      method: 'POST',
      body: JSON.stringify({ localPart, domain }),
    });
    showToast(`✨ Berhasil membuat: ${inbox.address}`);
    await loadInboxes(inbox.address);
  } catch (err) {
    showToast(`❌ Gagal: ${err.message}`);
  }
});

// Mobile Sidebar Drawer
function openMobileSidebar() {
  gmailSidebar.classList.add('open');
  sidebarBackdrop.classList.add('active');
}

function closeMobileSidebar() {
  gmailSidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('active');
}

menuToggleBtn.addEventListener('click', () => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    if (gmailSidebar.classList.contains('open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  } else {
    // Desktop: collapse / expand sidebar toggle
    gmailSidebar.classList.toggle('collapsed');
  }
});

sidebarBackdrop.addEventListener('click', closeMobileSidebar);

// ---- App Initialization ----

async function init() {
  initTheme();
  try {
    await loadConfig();
    await ensureSession();
    await loadInboxes();

    // Start background polling every 6 seconds
    pollTimer = setInterval(silentRefresh, 6000);
  } catch (err) {
    console.error('Initialization error:', err);
    emailRows.innerHTML = `
      <div class="mail-empty-state">
        <div class="empty-icon-wrap">⚠️</div>
        <div class="empty-title">Terjadi Kesalahan Koneksi</div>
        <div class="empty-subtitle">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

// Start application
init();

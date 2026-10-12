'use strict';

/* ==========================================================================
   Simpan — personal study vault
   ========================================================================== */

const STORAGE_KEY = 'simpan.materials.v1';
const PREFS_KEY = 'simpan.prefs.v1';
const CATEGORIES = ['UTBK', 'Coding', 'Cybersecurity', 'School', 'Personal', 'Other'];
const STATUS_LABELS = { learning: 'Learning', done: 'Done' };
const SORT_OPTIONS = ['recent', 'oldest', 'alpha'];
const CONTINUE_LIMIT = 3;
const RECENT_LIMIT = 5;
const MAX_TITLE = 140;
const MAX_DESCRIPTION = 2000;
const MAX_TAGS = 12;
const TOAST_DURATION = 3200;

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const state = {
  materials: [],
  view: 'overview',
  query: '',
  statusFilter: 'all',
  categoryFilter: 'all',
  sort: 'recent',
  editingId: null,
  pendingDeleteId: null,
  isSaving: false,
  // Where to send focus if the element that opened a dialog no longer exists.
  focusReturn: null,
};

const els = {
  searchInput: document.getElementById('search-input'),
  statusNav: document.getElementById('status-nav'),
  categoryNav: document.getElementById('category-nav'),

  viewOverview: document.getElementById('view-overview'),
  viewLibrary: document.getElementById('view-library'),
  greeting: document.getElementById('greeting'),
  todayLabel: document.getElementById('today-label'),
  overviewEmpty: document.getElementById('overview-empty'),
  overviewContent: document.getElementById('overview-content'),
  statTotal: document.getElementById('stat-total'),
  statLearning: document.getElementById('stat-learning'),
  statDone: document.getElementById('stat-done'),
  statCategories: document.getElementById('stat-categories'),
  progressText: document.getElementById('progress-text'),
  progressFill: document.getElementById('progress-fill'),
  continueList: document.getElementById('continue-list'),
  recentList: document.getElementById('recent-list'),
  categoryGrid: document.getElementById('category-grid'),

  libraryTitle: document.getElementById('library-title'),
  resultSummary: document.getElementById('result-summary'),
  categoryFilter: document.getElementById('category-filter'),
  sortSelect: document.getElementById('sort-select'),
  activeFilters: document.getElementById('active-filters'),
  libraryList: document.getElementById('library-list'),
  libraryEmpty: document.getElementById('library-empty'),

  materialDialog: document.getElementById('material-dialog'),
  form: document.getElementById('material-form'),
  formEyebrow: document.getElementById('material-dialog-eyebrow'),
  formTitle: document.getElementById('material-dialog-title'),
  submitButton: document.getElementById('material-submit'),
  categorySelect: document.getElementById('f-category'),

  detailDialog: document.getElementById('detail-dialog'),
  detailContent: document.getElementById('detail-content'),

  confirmDialog: document.getElementById('confirm-dialog'),
  confirmName: document.getElementById('confirm-name'),
  confirmCancel: document.getElementById('confirm-cancel'),

  toastRegion: document.getElementById('toast-region'),
};

/* ---------- Utilities ---------- */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function createId() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(iso) {
  return shortDate.format(new Date(iso));
}

function formatSerial(serial) {
  return `No. ${String(serial).padStart(3, '0')}`;
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function shorten(text, max = 48) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getGreeting(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

/**
 * Returns a normalized http(s) URL, '' for empty input, or null when invalid.
 * A missing scheme ("example.com/page") is treated as https.
 */
function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/\s/.test(value)) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname;
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const hasTld = /\.[a-z\d-]{2,}$/i.test(host) && !/^[\d.]+$/.test(host);
    if (host !== 'localhost' && !isIp && !hasTld) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseTags(raw) {
  const tags = String(raw || '')
    .split(',')
    .map((tag) => tag.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase().slice(0, 30))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

/* ---------- Storage ---------- */

function sanitizeMaterial(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;

  const created = new Date(raw.createdAt);
  const createdAt = Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString();
  const updated = new Date(raw.updatedAt);
  const updatedAt = Number.isNaN(updated.getTime()) ? createdAt : updated.toISOString();

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
    serial: Number.isInteger(raw.serial) && raw.serial > 0 ? raw.serial : 0,
    title: title.slice(0, MAX_TITLE),
    description: typeof raw.description === 'string' ? raw.description.slice(0, MAX_DESCRIPTION) : '',
    category: CATEGORIES.includes(raw.category) ? raw.category : 'Other',
    tags: Array.isArray(raw.tags) ? parseTags(raw.tags.join(',')) : [],
    url: normalizeUrl(raw.url) || '',
    status: raw.status === 'done' ? 'done' : 'learning',
    createdAt,
    updatedAt,
  };
}

function loadMaterials() {
  let parsed;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];

  const materials = parsed.map(sanitizeMaterial).filter(Boolean);

  // Repair missing serial numbers in creation order.
  let next = materials.reduce((max, m) => Math.max(max, m.serial), 0) + 1;
  materials
    .filter((m) => !m.serial)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((m) => { m.serial = next++; });

  return materials;
}

function saveMaterials() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.materials));
    return true;
  } catch {
    showToast('Could not save. Browser storage may be full or disabled.', 'error');
    return false;
  }
}

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (SORT_OPTIONS.includes(prefs.sort)) state.sort = prefs.sort;
  } catch {
    /* ignore malformed prefs */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: state.sort }));
  } catch {
    /* non-critical */
  }
}

/** Runs a mutation and persists it, rolling back if storage fails. */
function commit(mutate) {
  const snapshot = structuredClone(state.materials);
  const result = mutate();
  if (!saveMaterials()) {
    state.materials = snapshot;
    return null;
  }
  return result ?? true;
}

/* ---------- Material operations ---------- */

function findMaterial(id) {
  return state.materials.find((m) => m.id === id) || null;
}

function nextSerial() {
  return state.materials.reduce((max, m) => Math.max(max, m.serial), 0) + 1;
}

function createMaterial(fields) {
  const now = new Date().toISOString();
  const material = { id: createId(), serial: nextSerial(), ...fields, createdAt: now, updatedAt: now };
  state.materials.push(material);
  return material;
}

function updateMaterial(id, changes) {
  const material = findMaterial(id);
  if (!material) return null;
  Object.assign(material, changes, { updatedAt: new Date().toISOString() });
  return material;
}

function deleteMaterial(id) {
  const index = state.materials.findIndex((m) => m.id === id);
  if (index === -1) return null;
  return state.materials.splice(index, 1)[0];
}

/* ---------- Queries ---------- */

function getSearchTerms() {
  return state.query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^#/, ''))
    .filter(Boolean);
}

function matchesSearch(material, terms) {
  if (!terms.length) return true;
  const haystack = [material.title, material.description, material.category, ...material.tags]
    .join(' ')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function sortMaterials(list, sort) {
  const sorted = [...list];
  if (sort === 'alpha') {
    sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  } else {
    const direction = sort === 'oldest' ? 1 : -1;
    sorted.sort((a, b) => direction * (a.createdAt.localeCompare(b.createdAt) || a.serial - b.serial));
  }
  return sorted;
}

function getVisibleMaterials() {
  const terms = getSearchTerms();
  const filtered = state.materials.filter((m) =>
    (state.statusFilter === 'all' || m.status === state.statusFilter) &&
    (state.categoryFilter === 'all' || m.category === state.categoryFilter) &&
    matchesSearch(m, terms));
  return sortMaterials(filtered, state.sort);
}

function hasActiveFilters() {
  return Boolean(state.query.trim()) || state.statusFilter !== 'all' || state.categoryFilter !== 'all';
}

function getCategoryStats() {
  return CATEGORIES.map((name) => {
    const items = state.materials.filter((m) => m.category === name);
    return { name, total: items.length, done: items.filter((m) => m.status === 'done').length };
  });
}

/* ---------- Templates ---------- */

function renderStatusBadge(status) {
  return `<span class="status status--${status}"><span class="status__mark" aria-hidden="true"></span>${STATUS_LABELS[status]}</span>`;
}

function renderCard(material, headingLevel = 3) {
  const { id, status } = material;
  const title = escapeHTML(material.title);
  const tag = `h${headingLevel}`;
  const toggleLabel = status === 'done' ? 'Mark as learning' : 'Mark as done';

  const description = material.description
    ? `<p class="card__desc">${escapeHTML(material.description)}</p>`
    : '<p class="card__desc card__desc--empty">No description yet.</p>';

  const tags = material.tags.length
    ? `<ul class="tags" aria-label="Tags">${material.tags.map((t) => `<li class="tag">#${escapeHTML(t)}</li>`).join('')}</ul>`
    : '';

  const link = material.url
    ? `<a class="card__link" href="${escapeHTML(material.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(getDomain(material.url))} <span aria-hidden="true">↗</span><span class="sr-only"> — resource for ${title}, opens in a new tab</span></a>`
    : '';

  return `
    <article class="card" data-status="${status}">
      <p class="card__meta">
        <span class="card__category">${material.category}</span>
        <span class="card__serial">${formatSerial(material.serial)}</span>
      </p>
      <${tag} class="card__title">${title}</${tag}>
      ${description}
      ${tags}
      ${link}
      <div class="card__info">
        ${renderStatusBadge(status)}
        <time class="card__date" datetime="${material.createdAt}">Added ${formatDate(material.createdAt)}</time>
      </div>
      <div class="card__actions">
        <button type="button" class="action" data-action="open" data-id="${id}">Open<span class="sr-only"> ${title}</span></button>
        <button type="button" class="action" data-action="edit" data-id="${id}">Edit<span class="sr-only"> ${title}</span></button>
        <button type="button" class="action action--status" data-action="toggle-status" data-id="${id}">${toggleLabel}<span class="sr-only">: ${title}</span></button>
        <button type="button" class="action action--danger" data-action="delete" data-id="${id}">Delete<span class="sr-only"> ${title}</span></button>
      </div>
    </article>`;
}

function renderEmptyVault() {
  return `
    <div class="empty">
      <svg class="empty__art" viewBox="0 0 132 84" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="28" y="6" width="76" height="52" rx="3" opacity=".35"/>
          <rect x="18" y="16" width="96" height="60" rx="3" fill="#fffdf9"/>
          <path d="M30 34h44M30 44h64M30 54h36" stroke-linecap="round" opacity=".55"/>
          <path d="M96 16v20l5-4 5 4V16" fill="currentColor" stroke="none"/>
        </g>
      </svg>
      <h2 class="empty__title">Your vault is empty.</h2>
      <p class="empty__text">Start saving something worth remembering — a lecture, an article, a practice set, a tool you keep coming back to.</p>
      <div class="empty__actions">
        <button type="button" class="btn btn--primary" data-action="add">Add your first material</button>
        <button type="button" class="btn btn--quiet" data-action="load-samples">Or explore with sample materials</button>
      </div>
      <p class="empty__hint">Tip: press <kbd>/</kbd> to search your vault from anywhere.</p>
    </div>`;
}

function renderNoResults() {
  const query = state.query.trim();
  const message = query
    ? `Nothing matches “${escapeHTML(shorten(query, 40))}” with the current filters.`
    : 'No materials match these filters yet.';
  return `
    <div class="empty empty--compact">
      <h2 class="empty__title">Nothing here.</h2>
      <p class="empty__text">${message} Try another word, or clear the filters to see everything.</p>
      <div class="empty__actions">
        <button type="button" class="btn btn--ghost" data-action="clear-filters">Clear search &amp; filters</button>
        <button type="button" class="btn btn--quiet" data-action="add">Add a new material</button>
      </div>
    </div>`;
}

/* ---------- Rendering ---------- */

function render() {
  els.viewOverview.hidden = state.view !== 'overview';
  els.viewLibrary.hidden = state.view !== 'library';
  updateNavigation();
  if (state.view === 'overview') renderOverview();
  else renderLibrary();
}

function buildStaticControls() {
  els.statusNav.innerHTML = Object.entries(STATUS_LABELS).map(([value, label]) => `
    <li><button type="button" class="side-link" data-action="filter-status" data-value="${value}">
      <span>${label}</span><span class="count" data-count="${value}"></span>
    </button></li>`).join('');

  els.categoryNav.innerHTML = CATEGORIES.map((name) => `
    <li><button type="button" class="side-link" data-action="filter-category" data-value="${name}">
      <span>${name}</span><span class="count" data-count="cat-${name}"></span>
    </button></li>`).join('');

  const options = CATEGORIES.map((name) => `<option value="${name}">${name}</option>`).join('');
  els.categoryFilter.insertAdjacentHTML('beforeend', options);
  els.categorySelect.innerHTML = options;
}

function updateNavigation() {
  const counts = {
    all: state.materials.length,
    learning: state.materials.filter((m) => m.status === 'learning').length,
    done: state.materials.filter((m) => m.status === 'done').length,
  };
  CATEGORIES.forEach((name) => {
    counts[`cat-${name}`] = state.materials.filter((m) => m.category === name).length;
  });
  document.querySelectorAll('[data-count]').forEach((node) => {
    node.textContent = counts[node.dataset.count] ?? '';
  });

  document.querySelectorAll('.side-link[data-view-link]').forEach((link) => {
    toggleAttribute(link, 'aria-current', link.dataset.viewLink === state.view ? 'page' : null);
  });

  const inLibrary = state.view === 'library';
  els.statusNav.querySelectorAll('[data-value]').forEach((btn) => {
    toggleAttribute(btn, 'aria-current', inLibrary && btn.dataset.value === state.statusFilter ? 'true' : null);
  });
  els.categoryNav.querySelectorAll('[data-value]').forEach((btn) => {
    toggleAttribute(btn, 'aria-current', inLibrary && btn.dataset.value === state.categoryFilter ? 'true' : null);
  });
}

function toggleAttribute(node, name, value) {
  if (value === null) node.removeAttribute(name);
  else node.setAttribute(name, value);
}

function updateGreeting() {
  const now = new Date();
  els.greeting.textContent = getGreeting(now.getHours());
  els.todayLabel.textContent = longDate.format(now);
}

function renderOverview() {
  updateGreeting();
  const total = state.materials.length;
  els.overviewContent.hidden = total === 0;
  els.overviewEmpty.hidden = total > 0;

  if (!total) {
    els.overviewEmpty.innerHTML = renderEmptyVault();
    return;
  }
  els.overviewEmpty.innerHTML = '';

  const learning = state.materials.filter((m) => m.status === 'learning');
  const done = total - learning.length;
  const categoryStats = getCategoryStats();
  const percent = Math.round((done / total) * 100);

  els.statTotal.textContent = total;
  els.statLearning.textContent = learning.length;
  els.statDone.textContent = done;
  els.statCategories.textContent = categoryStats.filter((c) => c.total > 0).length;
  els.progressText.textContent = `${percent}% done`;
  els.progressFill.style.setProperty('--value', percent);

  // Continue learning: most recently touched materials first.
  const inProgress = [...learning]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, CONTINUE_LIMIT);
  els.continueList.innerHTML = inProgress.length
    ? inProgress.map((m) => renderCard(m, 3)).join('')
    : '<p class="note">Everything here is marked done. Add something new, or move a material back to Learning.</p>';

  els.recentList.innerHTML = sortMaterials(state.materials, 'recent')
    .slice(0, RECENT_LIMIT)
    .map((m) => `
      <li class="recent-item">
        <button type="button" class="recent" data-action="open" data-id="${m.id}">
          <span class="recent__serial">${formatSerial(m.serial)}</span>
          <span>
            <span class="recent__title">${escapeHTML(m.title)}</span>
            <span class="recent__cat">${m.category} · ${STATUS_LABELS[m.status]}</span>
          </span>
          <time class="recent__date" datetime="${m.createdAt}">${formatDate(m.createdAt)}</time>
        </button>
      </li>`).join('');

  els.categoryGrid.innerHTML = categoryStats.map(({ name, total: count, done: doneCount }) => {
    const ratio = count ? Math.round((doneCount / count) * 100) : 0;
    const meta = count ? `${doneCount} of ${count} done` : 'Empty shelf';
    return `
      <li>
        <button type="button" class="shelf" data-action="filter-category" data-value="${name}" data-force="true"${count ? '' : ' data-empty'}>
          <span class="shelf__name">${name}</span>
          <span class="shelf__count">${count}<span class="sr-only"> ${count === 1 ? 'material' : 'materials'}</span></span>
          <span class="shelf__bar" style="--value: ${ratio}" aria-hidden="true"></span>
          <span class="shelf__meta">${meta}</span>
        </button>
      </li>`;
  }).join('');
}

function renderLibrary() {
  const total = state.materials.length;
  const visible = getVisibleMaterials();

  els.categoryFilter.value = state.categoryFilter;
  els.sortSelect.value = state.sort;
  els.viewLibrary.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === state.statusFilter));
  });

  els.resultSummary.textContent = !total
    ? 'Nothing saved yet.'
    : hasActiveFilters()
      ? `Showing ${visible.length} of ${pluralize(total, 'material')}`
      : pluralize(total, 'material');

  renderActiveFilters();

  if (!total) {
    els.libraryList.innerHTML = '';
    els.libraryEmpty.innerHTML = renderEmptyVault();
    els.libraryEmpty.hidden = false;
    return;
  }

  if (!visible.length) {
    els.libraryList.innerHTML = '';
    els.libraryEmpty.innerHTML = renderNoResults();
    els.libraryEmpty.hidden = false;
    return;
  }

  els.libraryEmpty.hidden = true;
  els.libraryEmpty.innerHTML = '';
  els.libraryList.innerHTML = visible.map((m) => renderCard(m, 2)).join('');
}

function renderActiveFilters() {
  const chips = [];
  const query = state.query.trim();
  if (query) chips.push({ key: 'query', label: `Search: “${shorten(query, 30)}”` });
  if (state.statusFilter !== 'all') chips.push({ key: 'status', label: STATUS_LABELS[state.statusFilter] });
  if (state.categoryFilter !== 'all') chips.push({ key: 'category', label: state.categoryFilter });

  if (!chips.length) {
    els.activeFilters.innerHTML = '';
    return;
  }

  els.activeFilters.innerHTML = chips.map(({ key, label }) => `
    <button type="button" class="chip" data-action="remove-filter" data-value="${key}">
      ${escapeHTML(label)} <span class="chip__x" aria-hidden="true">×</span><span class="sr-only"> — remove filter</span>
    </button>`).join('') +
    (chips.length > 1 ? '<button type="button" class="link-btn" data-action="clear-filters">Clear all</button>' : '');
}

function renderDetail(material) {
  const title = escapeHTML(material.title);
  const isDone = material.status === 'done';
  const edited = material.updatedAt !== material.createdAt;

  const description = material.description
    ? `<p class="detail__desc">${escapeHTML(material.description)}</p>`
    : '<p class="detail__desc detail__desc--empty">No description yet.</p>';

  const tags = material.tags.length
    ? `<ul class="tags" aria-label="Tags">${material.tags.map((t) => `<li class="tag">#${escapeHTML(t)}</li>`).join('')}</ul>`
    : '';

  const resource = material.url
    ? `<div class="detail__resource">
        <span class="detail__url">${escapeHTML(material.url)}</span>
        <a class="btn btn--primary" href="${escapeHTML(material.url)}" target="_blank" rel="noopener noreferrer">Visit resource <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>
      </div>`
    : '';

  els.detailContent.innerHTML = `
    <header class="dialog__head">
      <p class="detail__meta">
        <span class="card__category">${material.category}</span>
        <span class="card__serial">${formatSerial(material.serial)}</span>
      </p>
      <h2 class="dialog__title" id="detail-title">${title}</h2>
      <button type="button" class="icon-btn dialog__close" data-close aria-label="Close">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </header>
    <div class="dialog__body">
      <dl class="detail__facts">
        <div><dt>Status</dt><dd>${renderStatusBadge(material.status)}</dd></div>
        <div><dt>Added</dt><dd><time datetime="${material.createdAt}">${formatDate(material.createdAt)}</time></dd></div>
        <div><dt>Updated</dt><dd>${edited ? `<time datetime="${material.updatedAt}">${formatDate(material.updatedAt)}</time>` : '—'}</dd></div>
      </dl>
      ${description}
      ${tags}
      ${resource}
    </div>
    <footer class="dialog__foot">
      <button type="button" class="btn btn--quiet btn--delete" data-action="delete" data-id="${material.id}">Delete</button>
      <button type="button" class="btn btn--ghost" data-action="edit" data-id="${material.id}">Edit</button>
      <button type="button" class="btn btn--ghost" data-action="toggle-status" data-id="${material.id}">${isDone ? 'Mark as learning' : 'Mark as done'}</button>
    </footer>`;
}

/* ---------- Navigation & filters ---------- */

function readRoute() {
  return location.hash === '#library' ? 'library' : 'overview';
}

function navigate(view) {
  const changed = state.view !== view;
  state.view = view;
  const hash = `#${view}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  render();
  if (changed) window.scrollTo(0, 0);
}

function setFilters({ status, category }) {
  if (status !== undefined) state.statusFilter = status;
  if (category !== undefined) state.categoryFilter = category;
  navigate('library');
}

function clearFilters() {
  state.query = '';
  state.statusFilter = 'all';
  state.categoryFilter = 'all';
  els.searchInput.value = '';
  render();
}

function getActiveView() {
  return state.view === 'library' ? els.viewLibrary : els.viewOverview;
}

function getActiveHeading() {
  return state.view === 'library' ? els.libraryTitle : els.greeting;
}

/** Moves focus to a matching control after re-rendering, with sensible fallbacks. */
function restoreFocus(target) {
  const root = getActiveView();
  let node = null;
  if (target?.id) {
    const id = CSS.escape(target.id);
    node = root.querySelector(`[data-id="${id}"][data-action="${target.action}"]`) ||
      root.querySelector(`[data-id="${id}"]`);
  }
  if (!node && target?.headingId) {
    const heading = document.getElementById(target.headingId);
    if (heading && root.contains(heading) && heading.offsetParent !== null) node = heading;
  }
  (node || getActiveHeading()).focus();
}

/* ---------- Dialogs ---------- */

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function openMaterialForm(id = null) {
  const material = id ? findMaterial(id) : null;
  if (id && !material) return;

  state.editingId = material ? material.id : null;
  els.form.reset();
  clearFormErrors();

  const fields = els.form.elements;
  if (material) {
    els.formEyebrow.textContent = `Editing ${formatSerial(material.serial)}`;
    els.formTitle.textContent = 'Edit material';
    els.submitButton.textContent = 'Save changes';
    fields.title.value = material.title;
    fields.description.value = material.description;
    fields.category.value = material.category;
    fields.tags.value = material.tags.join(', ');
    fields.url.value = material.url;
    fields.status.value = material.status;
  } else {
    els.formEyebrow.textContent = 'New entry';
    els.formTitle.textContent = 'Add material';
    els.submitButton.textContent = 'Save to vault';
    fields.category.value = state.categoryFilter !== 'all' ? state.categoryFilter : 'Other';
    fields.status.value = 'learning';
  }

  els.materialDialog.showModal();
  fields.title.focus();
}

function openDetail(id) {
  const material = findMaterial(id);
  if (!material) return;
  renderDetail(material);
  els.detailDialog.showModal();
  els.detailDialog.querySelector('.dialog__close').focus();
}

function openDeleteConfirm(id) {
  const material = findMaterial(id);
  if (!material) return;
  state.pendingDeleteId = id;
  els.confirmName.textContent = shorten(material.title, 60);
  els.confirmDialog.returnValue = '';
  els.confirmDialog.showModal();
  els.confirmCancel.focus();
}

function handleConfirmClose() {
  const id = state.pendingDeleteId;
  state.pendingDeleteId = null;
  if (els.confirmDialog.returnValue !== 'confirm' || !id) return;

  const material = findMaterial(id);
  if (!material) return;
  if (!commit(() => deleteMaterial(id))) return;

  render();
  showToast(`Deleted “${shorten(material.title)}”.`);
}

/** Closing a dialog by backdrop click — used for read-only dialogs only. */
function enableLightDismiss(dialog) {
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === dialog) dialog.close();
    pressedBackdrop = false;
  });
}

function handleDialogClosed() {
  requestAnimationFrame(() => {
    if (document.querySelector('dialog[open]')) return;
    const active = document.activeElement;
    const focusLost = !active || active === document.body || !active.isConnected || active.closest('dialog');
    if (focusLost) restoreFocus(state.focusReturn);
  });
}

/* ---------- Form ---------- */

function readFormData() {
  const data = new FormData(els.form);
  const get = (name) => String(data.get(name) ?? '');
  return {
    title: get('title').trim().replace(/\s+/g, ' '),
    description: get('description').trim(),
    category: CATEGORIES.includes(get('category')) ? get('category') : 'Other',
    tags: parseTags(get('tags')),
    urlRaw: get('url'),
    status: get('status') === 'done' ? 'done' : 'learning',
  };
}

function validateForm(data) {
  const errors = {};
  const url = normalizeUrl(data.urlRaw);

  if (!data.title) {
    errors.title = 'Give this material a title.';
  } else if (data.title.length > MAX_TITLE) {
    errors.title = `Keep the title under ${MAX_TITLE} characters.`;
  } else {
    const duplicate = state.materials.find((m) =>
      m.id !== state.editingId &&
      m.title.toLowerCase() === data.title.toLowerCase() &&
      m.category === data.category &&
      m.url === (url || ''));
    if (duplicate) errors.title = `This is already in your vault as ${formatSerial(duplicate.serial)}.`;
  }

  if (url === null) errors.url = 'Enter a valid web address, like https://example.com.';

  return { errors, url: url || '' };
}

function showFieldError(name, message) {
  const input = els.form.elements[name];
  const error = document.getElementById(`f-${name}-error`);
  if (!input || !error) return;
  input.setAttribute('aria-invalid', 'true');
  error.textContent = message;
}

function clearFieldError(name) {
  const input = els.form.elements[name];
  const error = document.getElementById(`f-${name}-error`);
  if (input) input.removeAttribute('aria-invalid');
  if (error) error.textContent = '';
}

function clearFormErrors() {
  ['title', 'url'].forEach(clearFieldError);
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (state.isSaving) return; // guards against double submission
  state.isSaving = true;
  els.submitButton.disabled = true;

  try {
    const data = readFormData();
    const { errors, url } = validateForm(data);
    clearFormErrors();

    const invalid = Object.keys(errors);
    if (invalid.length) {
      invalid.forEach((name) => showFieldError(name, errors[name]));
      els.form.elements[invalid[0]].focus();
      return;
    }

    const fields = {
      title: data.title,
      description: data.description,
      category: data.category,
      tags: data.tags,
      url,
      status: data.status,
    };

    const editingId = state.editingId;
    if (editingId && !findMaterial(editingId)) {
      closeDialog(els.materialDialog);
      showToast('That material no longer exists.', 'error');
      render();
      return;
    }

    const saved = commit(() => (editingId ? updateMaterial(editingId, fields) : createMaterial(fields)));
    if (!saved) return;

    if (!editingId) state.focusReturn = { id: saved.id, action: 'open' };
    state.editingId = null;
    closeDialog(els.materialDialog);
    render();

    if (editingId) {
      showToast('Changes saved.');
    } else {
      const hidden = state.view === 'library' && !getVisibleMaterials().some((m) => m.id === saved.id);
      showToast(hidden
        ? `Saved “${shorten(saved.title)}” — hidden by your current filters.`
        : `Saved “${shorten(saved.title)}” to your vault.`);
    }
  } finally {
    state.isSaving = false;
    els.submitButton.disabled = false;
  }
}

/* ---------- Actions ---------- */

function toggleStatus(id, fromDialog) {
  const material = findMaterial(id);
  if (!material) return;
  const next = material.status === 'done' ? 'learning' : 'done';
  if (!commit(() => updateMaterial(id, { status: next }))) return;

  render();
  if (fromDialog) {
    // The dialog's own content is the feedback here.
    renderDetail(findMaterial(id));
    els.detailDialog.querySelector('[data-action="toggle-status"]').focus();
    return;
  }

  restoreFocus(state.focusReturn);
  showToast(next === 'done'
    ? `Marked “${shorten(material.title)}” as done.`
    : `Moved “${shorten(material.title)}” back to learning.`);
}

function loadSampleMaterials() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const samples = [
    { title: 'Penalaran Matematika: Barisan & Deret', description: 'Rangkuman rumus barisan aritmetika dan geometri, plus 20 soal latihan bertahap untuk UTBK.', category: 'UTBK', tags: ['matematika', 'latihan'], url: '', status: 'learning', age: 9 },
    { title: 'MDN — JavaScript Guide', description: 'The canonical walkthrough of the language: grammar, functions, closures, promises and modules. Going chapter by chapter.', category: 'Coding', tags: ['javascript', 'reference'], url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', status: 'learning', age: 7 },
    { title: 'OWASP Top 10', description: 'The most critical web application security risks. Read once, then revisit after each lab.', category: 'Cybersecurity', tags: ['web-security', 'owasp'], url: 'https://owasp.org/www-project-top-ten/', status: 'done', age: 6 },
    { title: 'Sistem Pernapasan Manusia', description: 'Catatan biologi bab 6: organ pernapasan, mekanisme inspirasi–ekspirasi, dan gangguan pernapasan.', category: 'School', tags: ['biologi', 'ujian'], url: '', status: 'done', age: 4 },
    { title: 'PortSwigger: SQL injection labs', description: 'Hands-on labs from the Web Security Academy. Finished the apprentice level; practitioner labs next.', category: 'Cybersecurity', tags: ['sqli', 'labs'], url: 'https://portswigger.net/web-security/sql-injection', status: 'learning', age: 2 },
    { title: 'How to take smart notes', description: 'Notes on the Zettelkasten method — write in your own words, link ideas, keep a slip-box.', category: 'Personal', tags: ['note-taking', 'books'], url: '', status: 'learning', age: 1 },
  ];

  const added = commit(() => {
    samples.forEach(({ age, ...fields }) => {
      const material = createMaterial(fields);
      material.createdAt = new Date(now - age * day).toISOString();
      material.updatedAt = material.createdAt;
    });
    return true;
  });
  if (!added) return;

  state.focusReturn = null;
  render();
  getActiveHeading().focus();
  showToast('Added 6 sample materials. Edit or delete them anytime.');
}

function handleAction(trigger) {
  const { action, id, value } = trigger.dataset;
  const fromDialog = Boolean(trigger.closest('dialog'));

  // Remember where the action started so focus can return there after re-rendering.
  if (!fromDialog) {
    const section = trigger.closest('section');
    state.focusReturn = id
      ? { id, action, headingId: section?.querySelector('h1, h2')?.id }
      : null;
  }

  switch (action) {
    case 'add':
      closeDialog(els.detailDialog);
      openMaterialForm();
      break;
    case 'open':
      openDetail(id);
      break;
    case 'edit':
      closeDialog(els.detailDialog);
      openMaterialForm(id);
      break;
    case 'delete':
      closeDialog(els.detailDialog);
      openDeleteConfirm(id);
      break;
    case 'toggle-status':
      toggleStatus(id, fromDialog);
      break;
    case 'filter-status':
    case 'filter-category': {
      const key = action === 'filter-status' ? 'status' : 'category';
      const current = key === 'status' ? state.statusFilter : state.categoryFilter;
      // Sidebar items toggle off when clicked again; explicit controls always set.
      const toggleOff = !trigger.dataset.force && state.view === 'library' && current === value;
      const fromOverview = Boolean(trigger.closest('#view-overview'));
      const filters = { [key]: toggleOff ? 'all' : value };
      // Overview shortcuts show exactly what they describe.
      if (fromOverview) filters[key === 'status' ? 'category' : 'status'] = 'all';
      setFilters(filters);
      if (fromOverview) els.libraryTitle.focus();
      break;
    }
    case 'remove-filter':
      if (value === 'query') {
        state.query = '';
        els.searchInput.value = '';
      }
      if (value === 'status') state.statusFilter = 'all';
      if (value === 'category') state.categoryFilter = 'all';
      render();
      els.libraryTitle.focus();
      break;
    case 'clear-filters':
      clearFilters();
      els.libraryTitle.focus();
      break;
    case 'load-samples':
      loadSampleMaterials();
      break;
    default:
      break;
  }
}

/* ---------- Toasts ---------- */

function showToast(message, tone = 'default') {
  const toast = document.createElement('div');
  toast.className = `toast${tone === 'error' ? ' toast--error' : ''}`;
  toast.textContent = message;
  els.toastRegion.append(toast);

  while (els.toastRegion.children.length > 3) els.toastRegion.firstElementChild.remove();

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 250);
  }, TOAST_DURATION);
}

/* ---------- Events ---------- */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) {
      closeDialog(closer.closest('dialog'));
      return;
    }

    const viewLink = event.target.closest('a[data-view-link]');
    if (viewLink) {
      event.preventDefault();
      if (viewLink.dataset.viewLink === 'library') {
        // Library links always show the whole collection.
        state.statusFilter = 'all';
        state.categoryFilter = 'all';
      }
      navigate(viewLink.dataset.viewLink);
      if (viewLink.closest('.view')) getActiveHeading().focus();
      return;
    }

    const trigger = event.target.closest('[data-action]');
    if (trigger) handleAction(trigger);
  });

  els.searchInput.addEventListener('input', () => {
    state.query = els.searchInput.value;
    if (state.query.trim() && state.view !== 'library') navigate('library');
    else render();
  });

  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.searchInput.value) {
      event.preventDefault();
      els.searchInput.value = '';
      state.query = '';
      render();
    }
  });

  els.categoryFilter.addEventListener('change', () => {
    state.categoryFilter = els.categoryFilter.value;
    render();
  });

  els.sortSelect.addEventListener('change', () => {
    state.sort = SORT_OPTIONS.includes(els.sortSelect.value) ? els.sortSelect.value : 'recent';
    savePrefs();
    render();
  });

  els.form.addEventListener('submit', handleFormSubmit);

  els.form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      els.form.requestSubmit();
    }
  });

  // Clear an error as soon as the user starts fixing it.
  els.form.addEventListener('input', (event) => {
    const name = event.target.name;
    if (event.target.getAttribute('aria-invalid') === 'true') clearFieldError(name);
  });

  // Check the URL once the user leaves the field, not while typing.
  els.form.elements.url.addEventListener('blur', () => {
    const value = els.form.elements.url.value;
    if (value.trim() && normalizeUrl(value) === null) {
      showFieldError('url', 'Enter a valid web address, like https://example.com.');
    }
  });

  els.materialDialog.addEventListener('close', () => {
    state.editingId = null;
    clearFormErrors();
  });

  els.confirmDialog.addEventListener('close', handleConfirmClose);

  [els.materialDialog, els.detailDialog, els.confirmDialog].forEach((dialog) => {
    dialog.addEventListener('close', handleDialogClosed);
  });
  enableLightDismiss(els.detailDialog);
  enableLightDismiss(els.confirmDialog);

  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    const isSlash = event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey;
    const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    if (isSlash || isCmdK) {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    }
  });

  window.addEventListener('popstate', () => {
    state.view = readRoute();
    render();
  });

  // Keep multiple tabs in sync.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state.materials = loadMaterials();
    render();
    if (els.detailDialog.open) closeDialog(els.detailDialog);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateGreeting();
  });
  setInterval(updateGreeting, 60 * 1000);
}

/* ---------- Init ---------- */

function init() {
  state.materials = loadMaterials();
  loadPrefs();
  state.view = readRoute();
  buildStaticControls();
  bindEvents();
  render();
}

init();

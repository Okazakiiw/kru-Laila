/* ============================================================================
   public.js — entry ของหน้าเว็บ: app shell (rail / topbar / bottom bar) + hash router
   ข้อมูล: onSnapshot ครั้งเดียว → store → หน้าปัจจุบัน .update()
============================================================================ */
import { byId, $$, create, safeUrl, safePhoneTel, toast, debounce, withTransition } from './core/dom.js';
import { mountIcons, icon } from './ui/icons.js';
import { db, loadSiteSettings, loadTypes } from './data/firebase.js';
import { subscribeListings, getFavs } from './data/listings.js';
import { store, emit, onChange, setFilters } from './store.js';
import { parseRoute, navigateTo } from './router.js';
import { setMeta } from './seo.js';
import { hasOpenLayer } from './ui/overlay.js';

import * as home from './pages/home.js';
import * as explore from './pages/explore.js';
import * as listing from './pages/listing.js';
import * as favorites from './pages/favorites.js';
import * as calculator from './pages/calculator.js';
import * as contact from './pages/contact.js';
import * as notfound from './pages/notfound.js';

const PAGES = { home, explore, listing, favorites, calculator, contact, notfound };

mountIcons();
const view = byId('main');
const y = byId('year'); if (y) y.textContent = new Date().getFullYear();

/* ── Router ── */
let current = null;   // { name, id, inst }
function render(){
  const r = parseRoute();
  if (current && current.name === r.name && current.id === r.id) return;
  const swap = () => {
    if (current && current.inst && current.inst.destroy) { try { current.inst.destroy(); } catch(e){ console.error(e); } }
    view.textContent = '';
    document.body.className = 'page-' + r.name;
    const page = PAGES[r.name] || notfound;
    const inst = page.mount(view, { id: r.id }) || {};
    current = { name: r.name, id: r.id, inst };
    if (!inst.ownsMeta) setMeta(inst.meta || {});
    setNav(r.name);
    window.scrollTo(0, 0);
  };
  const first = !current;
  if (first) swap(); else withTransition(swap);
  if (!first) requestAnimationFrame(() => { const h = view.querySelector('h1'); if (h){ h.setAttribute('tabindex','-1'); h.focus({ preventScroll:true }); } });
  window.__kInternalNav = !first;
}
function setNav(name){
  $$('[data-nav]').forEach(a => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', render);

/* ── Data → pages ── */
onChange((kind) => { if (current && current.inst && current.inst.update) current.inst.update(kind); });

/* ── Topbar search (ใช้ตัวกรองร่วมกับทุกหน้า) ── */
const q = byId('q');
const pushQ = debounce(() => setFilters({ q: q.value }), 200);
q.addEventListener('input', () => {
  const r = parseRoute();
  if (r.name === 'home' || r.name === 'explore' || r.name === 'favorites') pushQ();
});
byId('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  setFilters({ q: q.value });
  const r = parseRoute();
  if (r.name !== 'home' && r.name !== 'explore') navigateTo('#/explore');
  q.blur();
});
onChange((kind) => { if (kind === 'filters' && q.value !== store.filters.q && document.activeElement !== q) q.value = store.filters.q; });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || hasOpenLayer()) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault(); q.focus();
});

/* ── Favourites badge ── */
function syncFavBadge(){
  const n = getFavs().length;
  $$('[data-fav-count]').forEach(b => { b.hidden = !n; b.textContent = String(n); });
  $$('[data-nav="favorites"]').forEach(a => {
    if (a.hasAttribute('aria-label')) a.setAttribute('aria-label', n ? `รายการโปรด ${n} รายการ` : 'รายการโปรด');
  });
}
document.addEventListener('favs-changed', () => { syncFavBadge(); emit('favs'); });
window.addEventListener('storage', (e) => { if (e.key === 'krulaila:favs'){ syncFavBadge(); emit('favs'); } });
syncFavBadge();

/* ── Contact links (topbar + footer) จาก meta/site ── */
function applySite(){
  const s = store.settings;
  const line = safeUrl(s.lineUrl), tel = safePhoneTel(s.phone), fb = safeUrl(s.facebookPage);
  const topLine = byId('topLine'), topCall = byId('topCall');
  if (line){ topLine.href = line; topLine.hidden = false; } else topLine.hidden = true;
  if (tel){ topCall.href = tel; topCall.removeAttribute('target'); }
  else { topCall.href = '#/contact'; }
  const fc = byId('footerContact');
  fc.textContent = '';
  if (s.phone && tel) fc.appendChild(create('a', { class:'btn btn-soft', href: tel }, [ icon('phone'), String(s.phone) ]));
  if (line) fc.appendChild(create('a', { class:'btn btn-soft', href: line, target:'_blank', rel:'noopener' }, [ icon('message-circle'), 'LINE' ]));
  if (fb) fc.appendChild(create('a', { class:'btn btn-soft', href: fb, target:'_blank', rel:'noopener' }, [ icon('facebook'), 'Facebook' ]));
}

/* ── Boot ── */
render();
if (!db){
  store.error = 'init';
  store.ready = true;
  emit('data');
} else {
  loadSiteSettings().then(s => { store.settings = s || {}; applySite(); emit('settings'); });
  loadTypes().then(t => { store.types = t || []; emit('settings'); });
  /* Real-time listings
     - ครั้งแรก: render หน้า (เปิด deep link)
     - ครั้งถัดไป (เช่น มีคนอื่นกดดู → views +1): หน้าอัปเดตเงียบ ๆ (หน้าประกาศไม่วาดแกลเลอรี/ฟอร์มใหม่) */
  subscribeListings(items => {
    store.items = items;
    store.ready = true;
    store.error = null;
    emit('data');
  }, err => {
    console.error('listings onSnapshot:', err);
    store.ready = true;
    store.error = String(err);
    emit('data');
    if (String(err).includes('permission')) toast('อ่านข้อมูลไม่ได้ — โปรดตั้ง Firestore Rules', 'error', 5000);
    else toast('โหลดข้อมูลไม่สำเร็จ', 'error');
  });
}

/* ความสูง topbar → ให้หน้าแผนที่เต็มจอพอดี */
const setTopH = () => document.documentElement.style.setProperty('--top-h', (byId('topbar').offsetHeight || 80) + 'px');
setTopH(); window.addEventListener('resize', debounce(setTopH, 100));

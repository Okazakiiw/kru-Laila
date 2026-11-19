/* ============================================================================
   admin/main.js — entry ของหน้าแอดมิน
   Auth (ย้ายมาจาก initAdminAuth() เดิม — logic เดิม) + app shell + hash router ของแอดมิน
   #/overview · #/listings · #/leads · #/types · #/settings  (+ drawer เพิ่ม/แก้ประกาศ)
============================================================================ */
import { byId, $$, toast, withTransition } from '../core/dom.js';
import { mountIcons } from '../ui/icons.js';
import { db, auth, rulesHint, loadSiteSettings, loadTypes } from '../data/firebase.js';
import { subscribeListings } from '../data/listings.js';
import { subscribeLeads } from './ops.js';
import { admin, emit, onChange } from './store.js';
import * as views from './views.js';
import { openEditor } from './editor.js';

mountIcons();

/* =========================================================================
   Auth (เดิม: initAdminAuth)
========================================================================= */
let _adminInited = false;
function initAdminAuth(){
  const loginBox = byId('loginBox'), adminBox = byId('adminBox');
  const emailEl = byId('loginEmail'), passEl = byId('loginPass');

  byId('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (emailEl?.value||'').trim();
    const pass  = (passEl?.value||'');
    if (!email || !pass) return toast('กรุณากรอกอีเมลและรหัสผ่าน','warn');
    const btn = byId('loginBtn'); btn.disabled = true;
    try{
      await auth.signInWithEmailAndPassword(email, pass);
    }catch(err){
      console.error(err);
      toast('เข้าสู่ระบบไม่สำเร็จ: ' + (err.code || err.message), 'error', 4000);
    }finally{ btn.disabled = false; }
  });

  byId('forgotBtn')?.addEventListener('click', async () => {
    const email = (emailEl?.value||'').trim();
    if (!email) return toast('กรอกอีเมลก่อน','warn');
    try{
      await auth.sendPasswordResetEmail(email);
      toast('ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว','success');
    }catch(err){ toast(err.message||'ส่งอีเมลไม่สำเร็จ','error'); }
  });

  byId('logoutBtn')?.addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(user => {
    if (user){
      loginBox.hidden = true;
      adminBox.hidden = false;
      admin.user = user;
      initAdmin();
    } else {
      loginBox.hidden = false;
      adminBox.hidden = true;
      admin.user = null;
      setTimeout(() => emailEl?.focus(), 50);
      // ออกจากระบบแล้วล็อกอินใหม่ → ต้อง init ใหม่ (เดิม _adminInited ค้างเป็น true
      // ทำให้ listener เดิมยังผูกอยู่กับ session เก่า และ onSnapshot ที่ถูกตัดสิทธิ์ไม่ถูกเปิดใหม่)
      if (_adminInited) location.reload();
    }
  });
}

/* =========================================================================
   Admin init: real-time listings + leads, settings, types
========================================================================= */
async function initAdmin(){
  if (_adminInited) return;
  _adminInited = true;

  $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openEditor(null)));
  window.addEventListener('hashchange', route);
  route();

  admin.settings = await loadSiteSettings();
  admin.types = await loadTypes();
  emit('settings');

  subscribeListings(items => {
    admin.items = items;
    admin.ready = true;
    emit('items');
  }, err => {
    console.error(err);
    admin.ready = true;
    emit('items');
    if (String(err).includes('permission')) rulesHint('โหลดรายการ');
  });

  subscribeLeads(leads => {
    admin.leads = leads;
    admin.leadsError = null;
    emit('leads');
  }, err => {
    console.warn('leads:', err);
    admin.leadsError = String(err).includes('permission')
      ? 'ยังอ่านกล่องข้อความไม่ได้ — อัปเดต Firestore Rules จากไฟล์ firestore.rules (ดู README)'
      : 'โหลดข้อความไม่สำเร็จ';
    emit('leads');
  });
}

/* ── Leads badge ── */
onChange(kind => {
  if (kind !== 'leads') return;
  const n = admin.leads.filter(l => !l.handled).length;
  $$('[data-leads-badge]').forEach(b => { b.hidden = !n; b.textContent = String(n); });
  $$('[data-nav="leads"]').forEach(a => { if (a.hasAttribute('aria-label')) a.setAttribute('aria-label', n ? `ลูกค้าที่สนใจ ${n} รายการใหม่` : 'ลูกค้าที่สนใจ'); });
});

/* =========================================================================
   Router
========================================================================= */
const VIEWS = ['overview', 'listings', 'leads', 'types', 'settings'];
let current = null;
function route(){
  const m = (location.hash || '').match(/^#\/([a-z]+)/);
  const name = m && VIEWS.includes(m[1]) ? m[1] : 'overview';
  if (current && current.name === name) return;
  const root = byId('main');
  const swap = () => {
    if (current && current.inst && current.inst.destroy) current.inst.destroy();
    root.textContent = '';
    const inst = views[name](root) || {};
    current = { name, inst };
    $$('[data-nav]').forEach(a => a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    document.title = (inst.title ? inst.title + ' · ' : '') + 'Admin | ครูไลลาขายบ้านและที่ดิน';
    window.scrollTo(0, 0);
  };
  if (!current) swap(); else withTransition(swap);
}
onChange(kind => { if (current && current.inst && current.inst.update) current.inst.update(kind); });

if (auth && db) initAdminAuth();
else { byId('loginBox').hidden = false; toast('เชื่อมต่อ Firebase ไม่สำเร็จ','error',5000); }

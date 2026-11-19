/* ============================================================================
   core/dom.js — DOM + security helpers (ย้ายมาจาก app.js เดิม ส่วน 0, 1, 4, 13)
   - ห้ามใส่ข้อมูลผู้ใช้ผ่าน innerHTML: ใช้ create() / textContent เสมอ
============================================================================ */
import { icon } from '../ui/icons.js';

export const byId = (id) => document.getElementById(id);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
export const create = (tag, props={}, children=[]) => {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k,v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') {/* never used */}
    else if (v != null) el.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
};

/* ── Security helpers — escape user content, validate URLs ── */
export function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
/** Return URL only if it has http(s)/tel/mailto/line scheme. Block javascript:, data:, etc. */
export function safeUrl(u){
  if (!u) return '';
  const s = String(u).trim();
  if (/^(https?:|tel:|mailto:|line:)/i.test(s)) return s;
  if (/^\/\//.test(s)) return 'https:' + s;
  return '';
}
export function safePhoneTel(phone){
  const digits = String(phone||'').replace(/[^\d+]/g,'');
  return digits ? 'tel:' + digits : '';
}

/* ── Toast: pill สีดำ (ไม่ใช้ alert ของเบราว์เซอร์) ── */
const TOAST_ICON = { success:'check', error:'alert', warn:'alert', info:'info' };
export function toast(msg, type='info', timeout=2800){
  let wrap = byId('toastWrap');
  if (!wrap){
    if (!document.body){ console.log('[toast]', msg); return; }
    wrap = create('div', { id:'toastWrap', class:'toast-wrap', role:'status', 'aria-live':'polite' });
    document.body.appendChild(wrap);
  }
  const t = create('div', { class:'toast ' + type }, [ icon(TOAST_ICON[type] || 'info', 'ic-sm'), create('span', { text: String(msg||'') }) ]);
  wrap.appendChild(t);
  setTimeout(()=> t.classList.add('out'), timeout-250);
  setTimeout(()=> t.remove(), timeout);
}
export function confirmDialog(msg){ return window.confirm(msg); }

/* คัดลอกข้อความ — มี fallback สำหรับ browser/HTTP ที่ไม่มี navigator.clipboard (เช่น LINE in-app browser บางรุ่น) */
export function copyText(text, okMsg='คัดลอกลิงก์แล้ว'){
  const ok = () => toast(okMsg,'success');
  const fallback = () => {
    try{
      const ta = create('textarea', { style:{ position:'fixed', opacity:'0', top:'0' } });
      ta.value = text; document.body.appendChild(ta); ta.select();
      const done = document.execCommand('copy'); ta.remove();
      done ? ok() : window.prompt('คัดลอกลิงก์นี้:', text);
    }catch{ window.prompt('คัดลอกลิงก์นี้:', text); }
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
  else fallback();
}

export function debounce(fn, ms){
  let t; return function(...args){ clearTimeout(t); t = setTimeout(()=> fn.apply(this,args), ms); };
}

export const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* View Transitions API แบบ progressive enhancement */
export function withTransition(fn){
  if (document.startViewTransition && !reducedMotion()){
    try { return document.startViewTransition(fn); } catch {}
  }
  fn();
}

/* ============================================================================
   router.js — hash router (#/ · #/explore · #/listing/{id} · #/favorites · #/calculator · #/contact)
   ลิงก์เดิม index.html#/listing/{id} ยังใช้ได้เหมือนเดิม
============================================================================ */
const ROUTES = [
  [/^#?\/?$/,               'home'],
  [/^#\/explore\/?$/,       'explore'],
  [/^#\/listing\/(.+)$/,    'listing'],
  [/^#\/favorites\/?$/,     'favorites'],
  [/^#\/calculator\/?$/,    'calculator'],
  [/^#\/contact\/?$/,       'contact'],
];
export function parseRoute(hash = location.hash){
  const h = hash || '';
  for (const [re, name] of ROUTES){
    const m = h.match(re);
    if (m){
      let id = null;
      if (m[1] != null){ try { id = decodeURIComponent(m[1]); } catch { id = m[1]; } }
      return { name, id };
    }
  }
  return { name:'notfound', id:null };
}
export function navigateTo(hash){
  if (location.hash !== hash) location.hash = hash;
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
}
/** ย้อนกลับถ้ามาจากในเว็บ ไม่งั้นกลับหน้าแรก */
export function goBack(fallback='#/'){
  if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back();
  else if (window.__kInternalNav) history.back();
  else navigateTo(fallback);
}

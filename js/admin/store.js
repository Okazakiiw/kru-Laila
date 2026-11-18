/* admin/store.js — สถานะกลางของหน้าแอดมิน */
export const admin = {
  user: null,
  items: [],        // ทุกประกาศ (รวมฉบับร่าง) — orderBy createdAt desc
  ready: false,
  leads: [],
  leadsError: null,
  types: [],
  settings: {},
  listFilter: { q:'', status:'', sort:'new', month:null, view:'table' }
};
const subs = new Set();
/** kind: 'items' | 'leads' | 'settings' | 'types' */
export function onChange(fn){ subs.add(fn); return () => subs.delete(fn); }
export function emit(kind){ subs.forEach(fn => { try { fn(kind); } catch(e){ console.error(e); } }); }

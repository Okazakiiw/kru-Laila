/* ============================================================================
   store.js — สถานะกลางของหน้า public (ข้อมูล real-time + ตัวกรองที่ทุกหน้าใช้ร่วมกัน)
============================================================================ */
import { EMPTY_FILTERS, isPublic } from './data/listings.js';

export const store = {
  items: [],          // ทุกประกาศ (รวมฉบับร่าง — กรองด้วย isPublic ก่อนแสดง)
  ready: false,       // ได้ snapshot แรกแล้ว
  error: null,
  types: [],
  settings: {},
  filters: { ...EMPTY_FILTERS }
};

const subs = new Set();
/** kind: 'data' | 'filters' | 'settings' | 'favs' */
export function onChange(fn){ subs.add(fn); return () => subs.delete(fn); }
export function emit(kind){ subs.forEach(fn => { try { fn(kind); } catch(e){ console.error(e); } }); }

export const publicItems = () => store.items.filter(isPublic);
export function setFilters(patch){ Object.assign(store.filters, patch); emit('filters'); }
export function resetFilters(keep={}){ store.filters = { ...EMPTY_FILTERS, ...keep }; emit('filters'); }
export function activeFilterCount(f = store.filters){
  return ['type','mode','status','min','max','beds'].filter(k => f[k]).length + (f.favOnly ? 1 : 0) + (f.q ? 1 : 0);
}

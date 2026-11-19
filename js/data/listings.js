/* ============================================================================
   data/listings.js — favourites, view count, pinning, real-time listings,
   filter/sort, similar listings, leads (ย้ายมาจาก app.js เดิม ส่วน 9 + initIndex)
   * logic ข้อมูลคัดลอกตรงจากของเดิม — ต่างแค่รับค่า filter เป็น object แทนการอ่านจาก <select>
============================================================================ */
import { db, siteSettings } from './firebase.js';

/* ── รายการโปรด (localStorage) ── */
const FAV_KEY = 'krulaila:favs';
export function getFavs(){ try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
export function isFav(id){ return getFavs().includes(id); }
export function toggleFav(id){
  const favs = getFavs(); const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i,1); else favs.push(id);
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch {}
  return i < 0;   // true = เพิ่งกดถูกใจ
}

/* ── ยอดดู: เพิ่มทีละ 1 (นับครั้งเดียวต่อเครื่อง) ── */
export function bumpView(it){
  if (!it || !it.id || !db) return false;
  try {
    const KEY = 'krulaila:viewed';
    const seen = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (seen.includes(it.id)) return false;           // เครื่องนี้นับไปแล้ว
    seen.push(it.id); localStorage.setItem(KEY, JSON.stringify(seen));
    db.collection('listings').doc(it.id)
      .update({ views: firebase.firestore.FieldValue.increment(1) }).catch(()=>{});
    return true;
  } catch { return false; }
}

/* ── ปักหมุด: คำนวณว่าหมดเวลาแล้วหรือยัง ──
   - it.pinned = true และไม่มี pinnedUntil → ปักตลอด
   - มี pinnedUntil → ปักจนกว่าจะถึงเวลานั้น */
export function pinnedUntilMs_(it){
  const t = it && it.pinnedUntil;
  if (!t) return null;
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (typeof t === 'number') return t;
  return null;
}
export function effectivePinned(it){
  if (!it || !it.pinned) return false;
  const until = pinnedUntilMs_(it);
  return (until == null) || Date.now() < until;
}
/* สร้าง field สำหรับ save: ใส่ pinnedUntil ใหม่เฉพาะตอนปักครั้งแรก (fresh pin)
   - was=true, now=true  → ไม่แตะ pinnedUntil เดิม (ไม่ reset เวลา)
   - was=false, now=true → fresh pin → ตั้ง pinnedUntil = now + default
   - now=false           → ล้าง pinnedUntil */
export function pinPayload_(checkedNow, wasPinned){
  if (!checkedNow) return wasPinned ? { pinned:false, pinnedUntil:null } : { pinned:false };
  if (wasPinned) return { pinned:true };   // ไม่แตะ pinnedUntil เดิม
  const days = +(siteSettings && siteSettings.pinDefaultDays);
  if (days > 0){
    return { pinned:true, pinnedUntil: firebase.firestore.Timestamp.fromMillis(Date.now() + days*86400000) };
  }
  return { pinned:true, pinnedUntil:null };
}

/* ── Real-time listings (query เดิม: orderBy createdAt desc) ── */
export function subscribeListings(onData, onError){
  return db.collection('listings').orderBy('createdAt','desc')
    .onSnapshot(snap => onData(snap.docs.map(d => ({ id:d.id, ...d.data() }))), onError);
}

/* ── Filters ── */
// ข้อความสำหรับค้นหา (เดิม it.title ว่าง → ได้คำว่า "undefined" ปนเข้าไป)
export function haystack(it){
  return `${it.title||''} ${it.desc||''} ${it.type||''}`.toLowerCase();
}
export const EMPTY_FILTERS = Object.freeze({ q:'', type:'', mode:'', status:'', min:'', max:'', beds:'', sort:'new', favOnly:false });
/** f = { q, type, mode, status, min, max, beds, favOnly } — เงื่อนไขเดียวกับ passFilter() เดิม */
export function passFilter(it, f){
  if ((it.status||'available') === 'draft') return false;   // ฉบับร่าง = ไม่โชว์บนเว็บ public
  if (f.favOnly && !isFav(it.id)) return false;
  if (f.type && it.type !== f.type) return false;
  if (f.mode && (it.listingMode || 'sale') !== f.mode) return false;
  if (f.status && (it.status || 'available') !== f.status) return false;
  if (f.min && +it.price < +f.min) return false;
  if (f.max && +it.price > +f.max) return false;
  if (f.beds && (+it.bedrooms || 0) < +f.beds) return false;
  if (f.q){
    const q = String(f.q).trim().toLowerCase();
    if (q && !haystack(it).includes(q)) return false;
  }
  return true;
}
export function sortItems(items, sortKey){
  const s = sortKey || 'new';
  const arr = items.slice();
  if (s === 'priceAsc')  arr.sort((a,b)=> (+a.price||0) - (+b.price||0));
  else if (s === 'priceDesc') arr.sort((a,b)=> (+b.price||0) - (+a.price||0));
  // 'new' = ลำดับ createdAt desc จาก query อยู่แล้ว
  // ปักหมุดที่ "ยังไม่หมดเวลา" ขึ้นบนสุด (sort เสถียร → คงลำดับเดิมในแต่ละกลุ่ม)
  arr.sort((a,b)=> (effectivePinned(b)?1:0) - (effectivePinned(a)?1:0));
  return arr;
}
export const isPublic = (it) => (it.status || 'available') !== 'draft';

/* ประกาศใกล้เคียง: ประเภทเดียวกัน + โหมดเดียวกัน ไม่รวมฉบับร่าง/ขายแล้ว เรียงตามราคาที่ใกล้ที่สุด */
export function similarPool(it, allItems){
  const mode = it.listingMode || 'sale';
  const p = +it.price || 0;
  const pool = allItems.filter(x => x.id !== it.id
    && x.type === it.type
    && (x.listingMode || 'sale') === mode
    && !['draft','sold'].includes(x.status || 'available'));
  pool.sort((a,b) => Math.abs((+a.price||0) - p) - Math.abs((+b.price||0) - p));
  return pool;
}

/* ── ฟอร์มสอบถาม/นัดดูทรัพย์ → /leads (ต้องใช้ Firestore Rules เวอร์ชันใหม่ใน firestore.rules) ──
   คืนค่า: { ok:true } | { ok:false, warn:'ข้อความ' } | throw (เขียนไม่สำเร็จ) */
export async function submitLead(it, { name, phone, message, honeypot, consent }){
  if (honeypot) return { ok:false, bot:true };   // บอท — เงียบ ๆ
  const n = String(name||'').trim(), ph = String(phone||'').trim();
  if (!n || !ph) return { ok:false, warn:'กรอกชื่อและเบอร์/LINE ก่อน' };
  if (!consent) return { ok:false, warn:'กรุณาติ๊กยินยอมก่อนส่ง' };
  const LKEY = 'krulaila:lastLead';
  let last = 0; try { last = +localStorage.getItem(LKEY) || 0; } catch {}
  if (Date.now() - last < 60000) return { ok:false, warn:'ส่งแล้ว กรุณารอสักครู่ก่อนส่งอีกครั้ง' };
  await db.collection('leads').add({
    listingId: String(it.id),
    listingTitle: String(it.title || '').slice(0, 200),
    name: n.slice(0, 100),
    contact: ph.slice(0, 30),
    message: String(message||'').trim().slice(0, 1000),
    handled: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  try { localStorage.setItem(LKEY, String(Date.now())); } catch {}
  return { ok:true };
}

/** ที่ดินที่ขายแล้ว → ซ่อนจากลูกค้าทั้งเว็บสาธารณะ (หน้าแรก/แผนที่/รายการโปรด/ลิงก์ตรง) · แอดมินยังเห็นตามปกติ */
export const isHiddenSoldLand = (it) => (it.status === 'sold') && /ที่ดิน/.test(it.type || '');

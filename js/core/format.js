/* ============================================================================
   core/format.js — Format + label helpers (ย้ายมาจาก app.js เดิม ส่วน 2, 9)
============================================================================ */
export const baht = (n) => (n!=='' && n!=null && !isNaN(+n)) ? Number(n).toLocaleString('th-TH') + ' บาท' : '-';
export const num  = (v) => (v===''||v==null||isNaN(+v)) ? '' : Number(v);

/* ราคาต่อพื้นที่: ที่ดิน → บาท/ตร.วา, บ้าน/คอนโด → บาท/ตร.ม. (เฉพาะราคาขายแบบราคารวม) */
export function pricePerArea(it){
  const p = +it.price;
  if (!p || it.listingMode === 'rent') return '';
  const unit = String(it.priceUnit || '');
  if (/ต่อ(ตารางวา|ไร่|ห้อง|เดือน)/.test(unit)) return '';   // ราคาที่เป็นต่อหน่วยอยู่แล้ว
  const fmt = (v) => Math.round(v).toLocaleString('th-TH');
  if (+it.landSize > 0 && (!+it.usableArea || /ที่ดิน/.test(it.type || ''))) return `≈ ${fmt(p / +it.landSize)} บาท/ตร.วา`;
  if (+it.usableArea > 0) return `≈ ${fmt(p / +it.usableArea)} บาท/ตร.ม.`;
  return '';
}

export const STATUS_LABEL = { available:'เปิดขาย', reserved:'จองแล้ว', sold:'ขายแล้ว', draft:'ฉบับร่าง' };
export const MODE_LABEL   = { sale:'ขาย', rent:'เช่า' };

/* ── ป้าย ใหม่/ฮิต ── */
export const NEW_DAYS = 7;     // โพสต์ภายในกี่วันถือว่า "ใหม่"
export const HOT_VIEWS = 50;   // ยอดดูเท่าไรถือว่า "ฮิต"
export function createdMs_(it){
  const ts = it && it.createdAt;
  if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return null;
}
export function isNewListing(it){ const ms = createdMs_(it); return ms != null && (Date.now() - ms) <= NEW_DAYS*86400000; }
export function isHotListing(it){ return (+it.views || 0) >= HOT_VIEWS; }
export function fmtPostDate(it){
  const ms = createdMs_(it);
  if (ms == null) return '';
  try {
    return new Date(ms).toLocaleString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return ''; }
}

/* ---------------------------------------------------------------------------
   v3: ราคาอ่านง่าย — "3.2 ล้าน" · "7 แสน" · "฿8,500/ด."
   (ฟังก์ชันแสดงผลใหม่ — ไม่แตะข้อมูล)
--------------------------------------------------------------------------- */
const trim0 = (x) => String(+(+x).toFixed(2));
const UNIT_SUFFIX = [
  [/ต่อเดือน/, '/ด.'], [/ต่อไร่/, '/ไร่'], [/ต่อตารางวา/, '/ตร.ว.'], [/ต่อห้อง/, '/ห้อง']
];
export function unitSuffix(it){
  if (it.listingMode === 'rent') return '/ด.';
  const u = String(it.priceUnit || '');
  for (const [re, s] of UNIT_SUFFIX) if (re.test(u)) return s;
  return '';
}
/** { n:'3.2', u:'ล้าน' } — ใช้แสดงตัวเลขใหญ่ + หน่วยสีเทา */
export function priceParts(it){
  const p = +it.price || 0;
  if (!p) return { n:'สอบถาม', u:'' };
  const sfx = unitSuffix(it);
  if (it.listingMode === 'rent' || sfx === '/ด.') return { n:'฿' + p.toLocaleString('th-TH'), u:sfx };
  if (p >= 1e6) return { n:trim0(p/1e6), u:'ล้าน' + sfx };
  if (p >= 1e5) return { n:trim0(p/1e5), u:'แสน' + sfx };
  return { n:'฿' + p.toLocaleString('th-TH'), u:sfx };
}
export const priceText = (it) => { const q = priceParts(it); return q.u ? `${q.n} ${q.u}` : q.n; };
/** ราคาสั้นบนหมุดแผนที่: 2.2M · 385K */
export function shortPrice(it){
  const p = +it.price || 0;
  if (!p) return '—';
  if (p >= 1e6) return trim0(p/1e6) + 'M';
  if (p >= 1e3) return trim0(p/1e3) + 'K';
  return String(p);
}
export function updatedMs_(it){
  const ts = it && (it.updatedAt || it.createdAt);
  if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return null;
}
export function fmtDay(ms, opts={ day:'numeric', month:'short' }){
  if (ms == null) return '';
  try { return new Date(ms).toLocaleDateString('th-TH', opts); } catch { return ''; }
}
export const fmtInt = (n) => (+n || 0).toLocaleString('th-TH');

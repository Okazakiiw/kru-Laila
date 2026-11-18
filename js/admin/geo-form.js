/* ============================================================================
   admin/geo-form.js — ตำแหน่งแบบไม่ชัด + ตรวจพิกัดในฟอร์ม (ย้ายมาจาก initAdmin() เดิม — logic เดิม)
   ── ตำแหน่งแบบไม่ชัด: ปุ่มสุ่ม "จุดแสดงผล" แยกต่างหาก — ไม่แตะ lat/lng เดิม ──
   จุดสุ่มเก็บใน dataset ของ checkbox (dispLat/dispLng) แล้วบันทึกเป็น field แยกตอนเซฟ
   พิกัดจริงในช่อง lat/lng คงไว้เหมือนเดิมเสมอ
============================================================================ */
import { toast } from '../core/dom.js';
import { num } from '../core/format.js';
import { jitterLatLng } from '../data/geo.js';

export function clearDisp_(chkEl, outEl){
  if (chkEl){ delete chkEl.dataset.dispLat; delete chkEl.dataset.dispLng; }
  if (outEl) outEl.textContent = '';
}
export function applyJitter_(latEl, lngEl, radiusEl, chkEl, outEl){
  const lat = +latEl.value, lng = +lngEl.value;
  if (isNaN(lat) || isNaN(lng) || (!lat && !lng)){
    toast('ใส่พิกัดจริง (ละติจูด/ลองจิจูด) ก่อน แล้วค่อยกดสุ่ม','warn'); return;
  }
  const r = +radiusEl.value || 300;
  const j = jitterLatLng(lat, lng, r);          // สุ่มจากพิกัดจริง แต่ไม่เขียนทับช่อง
  if (chkEl){ chkEl.checked = true; chkEl.dataset.dispLat = j.lat; chkEl.dataset.dispLng = j.lng; }
  if (outEl) outEl.textContent = `จุดแสดงผล (สุ่มในรัศมี ${r} ม.): ${j.lat}, ${j.lng}`;
  toast(`สุ่มจุดแสดงผลแล้ว (รัศมี ${r} ม.) — พิกัดจริงไม่ถูกแก้`, 'success', 4000);
}
/* ตรวจพิกัด: ต้องใส่คู่กัน และอยู่ในช่วงที่ถูกต้อง (กันพิมพ์สลับ lat/lng แล้วหมุดไปโผล่กลางทะเล) */
export function validCoords_(latEl, lngEl){
  const la = num(latEl?.value), ln = num(lngEl?.value);
  if (la === '' && ln === '') return true;
  if (la === '' || ln === ''){ toast('ใส่ละติจูดและลองจิจูดให้ครบทั้งคู่ (หรือเว้นว่างทั้งคู่)','warn',4000); return false; }
  // ไทย: lat ≈ 5–21, lng ≈ 97–106 → ถ้าใส่สลับกัน lat จะเกิน 90 และติดเงื่อนไขนี้
  if (Math.abs(la) > 90 || Math.abs(ln) > 180){ toast('พิกัดไม่ถูกต้อง — อาจใส่ละติจูด/ลองจิจูดสลับกัน (ไทย: ละติจูด ~5–21, ลองจิจูด ~97–106)','warn',5000); return false; }
  return true;
}
/* สร้าง field ตอนบันทึก: เก็บพิกัดจริงไว้ตามเดิม (ทำแยกในpayload) + จุดสุ่ม dispLat/dispLng
   ถ้าติ๊ก approx แต่ลืมกดสุ่ม → สุ่มให้อัตโนมัติจากพิกัดจริง กันไม่ให้จุดแสดง = จุดจริง */
export function approxFields_(latEl, lngEl, radiusEl, chkEl){
  const on = !!chkEl?.checked;
  const out = { approxLocation: on, approxRadius: on ? (+radiusEl?.value || 300) : 0, dispLat: null, dispLng: null };
  if (!on) return out;
  let dLat = +chkEl.dataset.dispLat, dLng = +chkEl.dataset.dispLng;
  if (isNaN(dLat) || isNaN(dLng)){
    const tLat = num(latEl?.value), tLng = num(lngEl?.value);
    if (tLat !== '' && tLng !== ''){ const j = jitterLatLng(tLat, tLng, out.approxRadius); dLat = j.lat; dLng = j.lng; }
  }
  if (!isNaN(dLat) && !isNaN(dLng)){ out.dispLat = dLat; out.dispLng = dLng; }
  return out;
}

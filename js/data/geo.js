/* ============================================================================
   data/geo.js — Google Maps link parsing, approx-location jitter, public coords
   (ย้ายมาจาก app.js เดิม ส่วน 2, 2b — logic เดิมทุกบรรทัด)
============================================================================ */
import { gasCall } from './images.js';

export const mapLink = (lat,lng)=> `https://www.google.com/maps?q=${encodeURIComponent(lat+','+lng)}`;
export const parseGmapLink = (url)=>{
  try{
    const s = decodeURIComponent((url||'').trim());
    const at = s.match(/@(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/);
    if(at) return {lat:+at[1], lng:+at[3]};
    const d34 = s.match(/!3d(-?\d+(\.\d+)?)!4d(-?\d+(\.\d+)?)/);   // data=...!3dLAT!4dLNG
    if(d34) return {lat:+d34[1], lng:+d34[3]};
    const q = s.match(/[?&]q=([-0-9.,\s]+)/);
    if(q){ const p = q[1].split(',').map(x=>+x.trim()); if(p.length>=2 && !isNaN(p[0]) && !isNaN(p[1])) return {lat:p[0], lng:p[1]}; }
    const simple = s.match(/(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/);
    if(simple) return {lat:+simple[1], lng:+simple[3]};
  }catch{}
  return null;
};
// ลิงก์ย่อ Google Maps (maps.app.goo.gl ฯลฯ) ไม่มีพิกัดในตัว — ต้องให้ server ตาม redirect ก่อน
export async function resolveGmapToCoords(url){
  const raw = (url||'').trim();
  if (!raw) return null;
  const direct = parseGmapLink(raw);            // URL เต็มที่มีพิกัดอยู่แล้ว
  if (direct) return direct;
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.)/i.test(raw)){
    try{
      const r = await gasCall({ action:'resolveGmap', url: raw });
      if (r && r.ok){
        if (r.lat!=null && r.lng!=null) return { lat:r.lat, lng:r.lng };
        if (r.url) return parseGmapLink(r.url);
      }
    }catch(e){ console.warn('resolveGmap:', e); }
  }
  return null;
}

/* สุ่มเลื่อนพิกัดออกจากจุดจริงภายในรัศมี radiusM เมตร (กระจายสม่ำเสมอทั่ววง)
   ใช้ซ่อนตำแหน่งจริงของทรัพย์ — จุดจริงจะอยู่ในวงรัศมีเดียวกันเสมอแต่ไม่ใช่จุดกึ่งกลาง */
export function jitterLatLng(lat, lng, radiusM){
  const R = Math.max(0, +radiusM || 0);
  if (!R || isNaN(+lat) || isNaN(+lng)) return { lat:+lat, lng:+lng };
  const ang  = Math.random() * 2 * Math.PI;
  const dist = R * Math.sqrt(Math.random());          // sqrt = กระจายทั่วพื้นที่วง (ไม่กระจุกกลาง)
  const dLat = (dist * Math.cos(ang)) / 111320;
  const dLng = (dist * Math.sin(ang)) / (111320 * Math.cos(+lat * Math.PI / 180));
  return { lat:+(+lat + dLat).toFixed(6), lng:+(+lng + dLng).toFixed(6) };
}

/* พิกัดที่ "แสดงต่อสาธารณะ" ได้: ถ้าเป็นตำแหน่งไม่ชัด ใช้จุดสุ่ม (dispLat/dispLng) เสมอ
   ห้ามใช้ it.lat/it.lng ตรง ๆ ในหน้า public — เดิมการคลิกการ์ด/ค้นหาจะ flyTo ไปจุดจริง (หลุดตำแหน่ง) */
export function publicCoords(it){
  if (!it || !it.lat || !it.lng) return null;
  if (it.approxLocation){
    if (it.dispLat != null && it.dispLng != null) return { lat:+it.dispLat, lng:+it.dispLng, approx:true };
    return null;   // approx แต่ยังไม่มีจุดสุ่ม → ไม่โชว์บนแผนที่ดีกว่าโชว์จุดจริง
  }
  return { lat:+it.lat, lng:+it.lng, approx:false };
}

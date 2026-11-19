/* ============================================================================
   seo.js — อัปเดต title / description / og:* / canonical ตามหน้า (hash route)
============================================================================ */
export const SITE_NAME = 'ครูไลลาขายบ้านและที่ดิน';
export const DEFAULT_TITLE = 'ครูไลลาขายบ้านและที่ดิน — รวมประกาศบ้าน ที่ดิน คอนโด';
export const DEFAULT_DESC = 'รวมประกาศขายบ้าน ที่ดิน คอนโด อาคารพาณิชย์ พร้อมแผนที่และรูปภาพจริง โดยครูไลลา ติดต่อโดยตรง ไม่ผ่านนายหน้าซ้ำซ้อน';

function setMetaAttr(sel, attr, val){
  const el = document.querySelector(sel);
  if (el) el.setAttribute(attr, val);
}
export function baseUrl(){ return location.origin + location.pathname; }

export function setMeta({ title, desc, image, hash } = {}){
  const t = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  document.title = t;
  const d = (desc || DEFAULT_DESC).replace(/\s+/g,' ').slice(0, 200);
  setMetaAttr('meta[name="description"]', 'content', d);
  setMetaAttr('meta[property="og:title"]', 'content', title || SITE_NAME);
  setMetaAttr('meta[property="og:description"]', 'content', d);
  setMetaAttr('meta[name="twitter:title"]', 'content', title || SITE_NAME);
  setMetaAttr('meta[name="twitter:description"]', 'content', d);
  if (image) setMetaAttr('#ogImage', 'content', image);
  const url = baseUrl() + (hash || '');
  setMetaAttr('#canonicalLink', 'href', url);
  setMetaAttr('meta[property="og:url"]', 'content', url);
}

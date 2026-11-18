/* ============================================================================
   ui/components.js — ชิ้นส่วน UI ที่ใช้ซ้ำ (สร้างด้วย DOM เท่านั้น — ไม่มี innerHTML กับข้อมูลผู้ใช้)
============================================================================ */
import { create, reducedMotion } from '../core/dom.js';
import { STATUS_LABEL, MODE_LABEL, priceParts, isNewListing, isHotListing, fmtInt } from '../core/format.js';
import { getImageURLs, sizedURL } from '../data/images.js';
import { isFav, toggleFav, effectivePinned } from '../data/listings.js';
import { icon } from './icons.js';

export const listingHref = (id) => '#/listing/' + encodeURIComponent(id);

export function statusEl(s){
  s = STATUS_LABEL[s] ? s : 'available';
  return create('span', { class:'status' }, [ create('span', { class:'dot ' + s }), STATUS_LABEL[s] ]);
}
export function chip(content, cls=''){
  return create('span', { class:('chip ' + cls).trim() }, content);
}
export function priceEl(it, cls='price'){
  const q = priceParts(it);
  const el = create('div', { class:cls });
  el.appendChild(document.createTextNode(q.n));
  if (q.u) el.appendChild(create('span', { class:'u', text:q.u }));
  return el;
}
export function specsEl(it){
  const wrap = create('div', { class:'specs' });
  const add = (ic, txt, label) => wrap.appendChild(create('span', { title:label }, [ icon(ic), txt ]));
  if (it.bedrooms)   add('bed', String(it.bedrooms), 'ห้องนอน');
  if (it.bathrooms)  add('bath', String(it.bathrooms), 'ห้องน้ำ');
  if (it.usableArea) add('maximize', `${it.usableArea} ตร.ม.`, 'พื้นที่ใช้สอย');
  if (it.landSize)   add('land-plot', `${it.landSize} ตร.วา`, 'ขนาดที่ดิน');
  return wrap;
}

/** รูปที่โหลดไม่ได้ (เช่นไฟล์ Drive ที่ไม่ได้แชร์) → เปลี่ยนเป็น placeholder */
export function imgEl(src, { alt='', size=640, eager=false, cls='' } = {}){
  if (!src) return placeholderEl(cls);
  const im = create('img', { src: sizedURL(src, size), alt, loading: eager ? 'eager' : 'lazy', decoding:'async', class:cls || null });
  if (eager) im.setAttribute('fetchpriority', 'high');
  im.addEventListener('error', () => { if (im.isConnected) im.replaceWith(placeholderEl(cls)); }, { once:true });
  return im;
}
export function placeholderEl(cls=''){
  return create('div', { class:('ph-empty ' + cls).trim(), 'aria-hidden':'true' }, icon('house', 'ic-lg'));
}

/** ปุ่มหัวใจ — ส่ง event 'favs-changed' ให้ badge/หน้าโปรดอัปเดต */
export function favButton(it, cls='icon-btn'){
  const b = create('button', { type:'button', class:cls, dataset:{ favId: it.id } });
  b.appendChild(icon('heart'));
  syncFav_(b);
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = toggleFav(it.id);
    if (on && !reducedMotion()) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    document.dispatchEvent(new CustomEvent('favs-changed', { detail:{ id:it.id, on } }));
  });
  return b;
}
function syncFav_(b){
  const on = isFav(b.dataset.favId);
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'เอาออกจากรายการโปรด' : 'บันทึกรายการโปรด');
}
// ปุ่มหัวใจทุกปุ่มของประกาศเดียวกัน (การ์ด / หน้าประกาศ / แถบล่าง) อัปเดตพร้อมกัน — listener เดียวทั้งหน้า
document.addEventListener('favs-changed', () => {
  document.querySelectorAll('[data-fav-id]').forEach(syncFav_);
});

/** การ์ดประกาศ (grid) */
export function listingCard(it, { i=0, anim=true, size=640 } = {}){
  const st = it.status || 'available';
  const card = create('article', { class:'lcard' + (anim ? ' reveal' : '') + (st === 'sold' ? ' is-sold' : ''), dataset:{ id: it.id } });
  if (anim) card.style.setProperty('--i', String(Math.min(i, 11)));
  const ph = create('div', { class:'ph' });
  ph.appendChild(imgEl(getImageURLs(it)[0], { size }));
  const tags = create('div', { class:'tags' });
  tags.appendChild(chip(statusEl(st), 'on-img'));
  if (effectivePinned(it)) tags.appendChild(chip([icon('pin','ic-sm'), 'แนะนำ'], 'dark'));
  else if (isNewListing(it)) tags.appendChild(chip('ใหม่', 'dark'));
  if (isHotListing(it)) tags.appendChild(chip([icon('flame','ic-sm'), 'ฮิต'], 'on-img'));
  ph.appendChild(tags);
  card.appendChild(ph);
  card.appendChild(favButton(it, 'icon-btn fav'));

  const body = create('div', { class:'body' });
  const mode = it.listingMode === 'rent' ? 'rent' : 'sale';
  body.appendChild(create('div', { class:'meta' }, [
    create('span', { text: `${it.type || 'ประกาศ'} · ${MODE_LABEL[mode]}` }),
    create('span', { class:'views', title:'ยอดเข้าชม' }, [ icon('eye','ic-sm'), fmtInt(it.views) ])
  ]));
  body.appendChild(priceEl(it));
  body.appendChild(create('a', { class:'t stretch', href: listingHref(it.id), text: it.title || '-' }));
  const sp = specsEl(it);
  if (sp.childNodes.length) body.appendChild(sp);
  card.appendChild(body);
  return card;
}

export function skeletonCards(n=8){
  const g = create('div', { class:'grid-cards', 'aria-hidden':'true' });
  for (let i=0;i<n;i++){
    g.appendChild(create('div', { class:'lcard sk' }, [
      create('div', { class:'skel', style:{ aspectRatio:'4/3' } }),
      create('div', { class:'skel line', style:{ width:'40%', marginTop:'16px' } }),
      create('div', { class:'skel line lg', style:{ width:'60%' } }),
      create('div', { class:'skel line', style:{ width:'85%' } })
    ]));
  }
  return g;
}

/** กราฟเส้นบาง: การกระจายราคา (เรียงจากต่ำไปสูง) — ตัวเลขล้วน ปลอดภัยสำหรับ innerHTML */
export function sparkSVG(prices){
  const w=280, h=44, pad=4;
  const s = prices.map(Number).filter(v => v > 0).sort((a,b)=>a-b);
  const box = create('div', { class:'spark-wrap', 'aria-hidden':'true' });
  if (!s.length) return box;
  if (s.length === 1) s.unshift(s[0]);
  const min=s[0], max=s[s.length-1], span=(max-min)||1;
  const pts = s.map((v,i)=>[pad + i*(w-2*pad)/(s.length-1), (max===min) ? h/2 : h-pad-((v-min)/span)*(h-2*pad)]);
  const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  box.innerHTML = `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`
    + `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
    + pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#fff" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('')
    + `</svg>`;
  return box;
}

/** ตัวเลขนับขึ้น (KPI) — เคารพ prefers-reduced-motion */
export function countUp(root=document){
  const reduce = reducedMotion();
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec||0);
    const fmt = (v) => v.toLocaleString('th-TH', { minimumFractionDigits:dec, maximumFractionDigits:dec });
    if (reduce || !to){ el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const tick = (t) => { const k = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-k,3); el.textContent = fmt(to*e); if (k<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
/** <span data-count> สำหรับ countUp — แสดงค่าจริงทันทีเมื่อไม่ต้อง animate */
export function countSpan(v, anim, dec=0){
  const s = create('span', { class:'num' });
  if (anim){ s.dataset.count = String(v); s.dataset.dec = String(dec); s.textContent = '0'; }
  else s.textContent = (+v||0).toLocaleString('th-TH', { minimumFractionDigits:dec, maximumFractionDigits:dec });
  return s;
}

/** Empty state พร้อมภาพ SVG ลายเส้น */
const ART = {
  heart: '<svg viewBox="0 0 160 120" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="22" width="120" height="84" rx="20" fill="#fff" stroke="none"/><path d="M80 90 58 69c-6-6-6-15 0-21 6-6 15-6 21 0l1 1 1-1c6-6 15-6 21 0 6 6 6 15 0 21Z"/><path d="M118 34v10M113 39h10M38 82v8M34 86h8" opacity=".5"/></svg>',
  search:'<svg viewBox="0 0 160 120" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="22" width="120" height="84" rx="20" fill="#fff" stroke="none"/><circle cx="74" cy="60" r="20"/><path d="m89 75 14 14"/><path d="M66 60h16" opacity=".5"/></svg>',
  map:   '<svg viewBox="0 0 160 120" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="22" width="120" height="84" rx="20" fill="#fff" stroke="none"/><path d="M50 40 70 34l20 6 20-6v46l-20 6-20-6-20 6Z"/><path d="M70 34v46M90 40v46" opacity=".5"/></svg>',
  house: '<svg viewBox="0 0 160 120" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="22" width="120" height="84" rx="20" fill="#fff" stroke="none"/><path d="M56 86V58l24-18 24 18v28Z"/><path d="M73 86V70h14v16"/></svg>'
};
export function emptyState({ art='search', title, text, actions=[] }){
  const art_ = create('div', { class:'empty-art', 'aria-hidden':'true' });
  art_.innerHTML = ART[art] || ART.search;   // SVG คงที่ของเราเอง
  return create('div', { class:'empty card' }, [
    art_,
    create('h2', { text:title }),
    text ? create('p', { class:'label', text }) : null,
    actions.length ? create('div', { class:'empty-actions' }, actions) : null
  ]);
}

export function sectionHead(id, title, sub, right){
  const left = create('div', {}, [ create('h2', { id, text:title }), sub ? create('div', { class:'label', text:sub }) : null ]);
  return create('div', { class:'sec-head' }, [ left, right || null ]);
}

/* ============================================================================
   ui/lightbox.js — ดูรูปเต็มจอ: ปัด (swipe) · ลูกศรซ้าย/ขวา · Esc · focus trap
============================================================================ */
import { create } from '../core/dom.js';
import { icon } from './icons.js';
import { openLayer } from './overlay.js';

let lb = null, img, counter, layer = null;
const state = { urls:[], idx:0 };

function build(){
  img = create('img', { class:'lb-img', alt:'' });
  counter = create('div', { class:'lb-counter chip on-img', 'aria-live':'polite' });
  const prev = create('button', { type:'button', class:'icon-btn lb-prev', 'aria-label':'รูปก่อนหน้า', onclick: (e) => { e.stopPropagation(); step(-1); } }, icon('chevron-left'));
  const next = create('button', { type:'button', class:'icon-btn lb-next', 'aria-label':'รูปถัดไป', onclick: (e) => { e.stopPropagation(); step(+1); } }, icon('chevron-right'));
  const close = create('button', { type:'button', class:'icon-btn lb-close', 'aria-label':'ปิด', onclick: () => layer && layer.close() }, icon('x'));
  const stage = create('div', { class:'lb-stage' }, img);
  lb = create('div', { class:'lightbox', role:'dialog', 'aria-modal':'true', 'aria-label':'ภาพขยาย', hidden:'' }, [ close, counter, stage, prev, next ]);
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target === stage) layer && layer.close(); });
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); step(+1); }
  });
  // swipe
  let x0 = null, y0 = null;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? +1 : -1);
  });
  stage.addEventListener('pointercancel', () => { x0 = null; });
  document.body.appendChild(lb);
}
function show(){
  img.src = state.urls[state.idx] || '';
  img.alt = `รูปที่ ${state.idx + 1} จาก ${state.urls.length}`;
  counter.textContent = state.urls.length > 1 ? `${state.idx + 1} / ${state.urls.length}` : '';
  counter.hidden = state.urls.length < 2;
  lb.querySelector('.lb-prev').hidden = lb.querySelector('.lb-next').hidden = state.urls.length < 2;
  // preload ถัดไป
  if (state.urls.length > 1){ const n = new Image(); n.src = state.urls[(state.idx + 1) % state.urls.length]; }
}
function step(d){
  if (!state.urls.length) return;
  state.idx = (state.idx + d + state.urls.length) % state.urls.length;
  show();
}
export function openLightbox(urls, startIdx = 0){
  if (!lb) build();
  state.urls = Array.isArray(urls) ? urls : [urls];
  state.idx = Math.max(0, Math.min(startIdx, state.urls.length - 1));
  show();
  lb.hidden = false;
  if (layer) return;
  layer = openLayer(lb, {
    lockScroll: true,
    initialFocus: lb.querySelector('.lb-close'),
    onClose: () => { lb.hidden = true; layer = null; }
  });
}

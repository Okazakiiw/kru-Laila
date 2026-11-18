/* ============================================================================
   ui/overlay.js — popover / drawer / lightbox / sheet: Esc ปิด + focus trap + คืนโฟกัส
   ใช้ stack: Esc ปิดเฉพาะชั้นบนสุด
============================================================================ */
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];

export function focusables(root){
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
}
export const topLayer = () => stack[stack.length - 1] || null;
export const hasOpenLayer = () => stack.length > 0;

/**
 * openLayer(el, { onClose, initialFocus, returnFocus, outsideClose, anchor, lockScroll })
 * คืนค่า { close() }
 */
export function openLayer(el, opts = {}){
  const layer = {
    el,
    returnFocus: opts.returnFocus !== undefined ? opts.returnFocus : document.activeElement,
    close
  };
  stack.push(layer);
  if (opts.lockScroll) document.documentElement.classList.add('no-scroll');

  const onDown = (e) => {
    if (!opts.outsideClose) return;
    if (el.contains(e.target)) return;
    if (opts.anchor && opts.anchor.contains(e.target)) return;
    if (topLayer() !== layer) return;
    close();
  };
  document.addEventListener('pointerdown', onDown, true);

  requestAnimationFrame(() => {
    const f = opts.initialFocus || focusables(el)[0] || el;
    if (f === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { f.focus({ preventScroll: true }); } catch {}
  });

  function close(){
    const i = stack.indexOf(layer);
    if (i < 0) return;
    stack.splice(i, 1);
    document.removeEventListener('pointerdown', onDown, true);
    if (opts.lockScroll && !stack.some(l => l.lock)) document.documentElement.classList.remove('no-scroll');
    try { opts.onClose && opts.onClose(); } catch (e) { console.error(e); }
    const rf = layer.returnFocus;
    if (rf && rf.isConnected) { try { rf.focus({ preventScroll: true }); } catch {} }
  }
  layer.lock = !!opts.lockScroll;
  return layer;
}

document.addEventListener('keydown', (e) => {
  const top = topLayer();
  if (!top) return;
  if (e.key === 'Escape'){
    e.preventDefault(); e.stopPropagation();
    top.close();
  } else if (e.key === 'Tab'){
    const f = focusables(top.el);
    if (!f.length){ e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!top.el.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
}, true);

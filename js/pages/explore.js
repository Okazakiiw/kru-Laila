/* ============================================================================
   pages/explore.js — #/explore  แผนที่เต็มจอ + ชิปตัวกรอง (popover) + รายการ
   desktop: แผงขวา · mobile: bottom sheet ลากได้ · hover การ์ด ↔ หมุด
   ตำแหน่งโดยประมาณ = วงกลมเทาโปร่ง (ใช้ publicCoords — ไม่เปิดพิกัดจริง)
============================================================================ */
import { create } from '../core/dom.js';
import { STATUS_LABEL, MODE_LABEL } from '../core/format.js';
import { getImageURLs } from '../data/images.js';
import { publicCoords } from '../data/geo.js';
import { passFilter, sortItems } from '../data/listings.js';
import { store, setFilters, resetFilters, activeFilterCount } from '../store.js';
import { icon } from '../ui/icons.js';
import { statusEl, priceEl, imgEl, listingHref, emptyState } from '../ui/components.js';
import { openLayer } from '../ui/overlay.js';
import { ensureLeaflet, monoTiles, newMap, thumbPinIcon, mapLegend, clusterGroup, approxCircle, approxStyle, TH_CENTER } from '../ui/map.js';

const SORTS = { new:'ใหม่สุด', priceAsc:'ราคาต่ำ → สูง', priceDesc:'ราคาสูง → ต่ำ' };
const PRICE_PRESETS = [ ['', '1000000', 'ไม่เกิน 1 ล้าน'], ['1000000', '3000000', '1–3 ล้าน'], ['3000000', '', '3 ล้านขึ้นไป'], ['', '10000', 'เช่า ≤ ฿10,000'] ];

export function mount(root){
  const wrap = create('section', { class:'explore', 'aria-label':'สำรวจประกาศบนแผนที่' });
  const mapEl = create('div', { class:'map', role:'region', 'aria-label':'แผนที่ประกาศ' });
  const fbar = create('div', { class:'fbar', role:'toolbar', 'aria-label':'ตัวกรอง' });
  const listEl = create('div', { class:'results-list', role:'list' });
  const countEl = create('b', { 'aria-live':'polite' });
  const handle = create('button', { type:'button', class:'sheet-handle', 'aria-label':'ขยาย/ย่อรายการ' });
  const results = create('aside', { class:'results', 'aria-label':'ผลการค้นหา' }, [
    handle,
    create('div', { class:'results-head' }, [ countEl, create('a', { class:'btn btn-soft btn-sm', href:'#/' }, [ icon('grid','ic-sm'), 'มุมมองการ์ด' ]) ]),
    listEl
  ]);
  const h1 = create('h1', { class:'sr-only', text:'สำรวจแผนที่' });
  wrap.append(h1, mapEl, fbar, results);
  root.appendChild(wrap);

  /* ── Map ── */
  let map = null, cluster = null, circles = null;
  const markers = new Map();   // id → { layer, kind:'pin'|'circle', it }
  let selectedId = null, firstFit = true, fitNext = true;
  let destroyed = false;
  ensureLeaflet().then(() => {
    if (destroyed) return;
    map = newMap(mapEl, { layers:[ monoTiles() ] }).setView(TH_CENTER, 6);
    cluster = clusterGroup(); map.addLayer(cluster);
    circles = L.layerGroup().addTo(map);
    mapEl.appendChild(mapLegend());
    requestAnimationFrame(() => map.invalidateSize());
    render();
  }).catch(() => {
    mapEl.appendChild(create('div', { class:'empty', style:{ height:'100%' } }, [ create('p', { class:'label', text:'โหลดแผนที่ไม่สำเร็จ — ลองรีเฟรชหน้า' }) ]));
  });

  /* ── Filter chips + popovers ── */
  let openPop = null;
  function closePop(){ if (openPop) openPop.layer.close(); }
  function popover(chipBtn, title, build){
    if (openPop && openPop.chip === chipBtn){ closePop(); return; }
    closePop();
    const pop = create('div', { class:'popover', role:'dialog', 'aria-label':title });
    pop.appendChild(create('h3', { text:title }));
    build(pop);
    wrap.appendChild(pop);
    const r = chipBtn.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left - w.left, w.width - pop.offsetWidth - 12));
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom - w.top + 8) + 'px';
    chipBtn.setAttribute('aria-expanded', 'true');
    const layer = openLayer(pop, { outsideClose:true, anchor:chipBtn, returnFocus:chipBtn,
      onClose: () => { pop.remove(); chipBtn.setAttribute('aria-expanded', 'false'); if (openPop && openPop.pop === pop) openPop = null; } });
    openPop = { chip:chipBtn, pop, layer };
  }
  function optList(options, current, onPick){
    const list = create('div', { class:'opt-list', role:'radiogroup' });
    options.forEach(([v, l]) => list.appendChild(create('button', { type:'button', class:'opt', role:'radio', 'aria-checked': String(String(current) === String(v)), text:l,
      onclick: () => { onPick(v); closePop(); } })));
    return list;
  }
  function chipEl(key, label, activeText, onClick){
    const on = !!activeText;
    const b = create('button', { type:'button', class:'fchip' + (on ? ' on' : ''), 'aria-haspopup':'dialog', 'aria-expanded':'false', dataset:{ key } },
      [ create('span', { text: activeText || label }), icon('chevron-down') ]);
    b.addEventListener('click', () => onClick(b));
    return b;
  }
  function renderChips(){
    const f = store.filters;
    fbar.textContent = '';
    fbar.appendChild(chipEl('mode', 'ขาย / เช่า', f.mode ? MODE_LABEL[f.mode] : '', (b) => popover(b, 'การประกาศ', (p) =>
      p.appendChild(optList([['', 'ทั้งหมด'], ['sale', 'ขาย'], ['rent', 'เช่า']], f.mode, v => setFilters({ mode:v }))))));
    const types = Array.from(new Set((store.types || []).concat(store.items.map(x => x.type).filter(Boolean))));
    fbar.appendChild(chipEl('type', 'ประเภท', f.type, (b) => popover(b, 'ประเภททรัพย์', (p) =>
      p.appendChild(optList([['', 'ทั้งหมด']].concat(types.map(t => [t, t])), f.type, v => setFilters({ type:v }))))));
    const priceTxt = (f.min || f.max) ? [f.min ? short(+f.min) : '0', f.max ? short(+f.max) : 'ขึ้นไป'].join(' – ') : '';
    fbar.appendChild(chipEl('price', 'ราคา', priceTxt, (b) => popover(b, 'ช่วงราคา (บาท)', (p) => {
      const mn = create('input', { class:'input', type:'number', min:'0', inputmode:'numeric', placeholder:'ต่ำสุด', 'aria-label':'ราคาต่ำสุด', value:f.min });
      const mx = create('input', { class:'input', type:'number', min:'0', inputmode:'numeric', placeholder:'สูงสุด', 'aria-label':'ราคาสูงสุด', value:f.max });
      const presets = create('div', { class:'presets' }, PRICE_PRESETS.map(([a, z, l]) => create('button', { type:'button', class:'chip', text:l, onclick: () => { mn.value = a; mx.value = z; } })));
      p.append(create('div', { class:'price-inputs' }, [ mn, mx ]), presets, create('div', { class:'pop-actions' }, [
        create('button', { type:'button', class:'btn btn-soft', text:'ล้าง', onclick: () => { setFilters({ min:'', max:'' }); closePop(); } }),
        create('button', { type:'button', class:'btn', text:'ใช้ราคานี้', onclick: () => { setFilters({ min: mn.value, max: mx.value }); closePop(); } })
      ]));
    })));
    fbar.appendChild(chipEl('beds', 'ห้องนอน', f.beds ? `${f.beds}+ ห้องนอน` : '', (b) => popover(b, 'ห้องนอนอย่างน้อย', (p) =>
      p.appendChild(optList([['', 'ไม่จำกัด'], ['1', '1+ ห้อง'], ['2', '2+ ห้อง'], ['3', '3+ ห้อง'], ['4', '4+ ห้อง']], f.beds, v => setFilters({ beds:v }))))));
    fbar.appendChild(chipEl('status', 'สถานะ', f.status ? STATUS_LABEL[f.status] : '', (b) => popover(b, 'สถานะ', (p) =>
      p.appendChild(optList([['', 'ทั้งหมด'], ['available', 'เปิดขาย'], ['reserved', 'จองแล้ว'], ['sold', 'ขายแล้ว']], f.status, v => setFilters({ status:v }))))));
    fbar.appendChild(chipEl('sort', 'เรียง', f.sort && f.sort !== 'new' ? SORTS[f.sort] : '', (b) => popover(b, 'เรียงตาม', (p) =>
      p.appendChild(optList(Object.entries(SORTS), f.sort || 'new', v => setFilters({ sort:v }))))));
    const fav = create('button', { type:'button', class:'fchip' + (f.favOnly ? ' on' : ''), 'aria-pressed': String(!!f.favOnly),
      onclick: () => setFilters({ favOnly: !store.filters.favOnly }) }, [ icon('heart'), 'รายการโปรด' ]);
    fbar.appendChild(fav);
    if (activeFilterCount()) fbar.appendChild(create('button', { type:'button', class:'fchip', onclick: () => { const q = document.getElementById('q'); if (q) q.value = ''; resetFilters(); } }, [ icon('x'), 'ล้างทั้งหมด' ]));
  }
  const short = (n) => n >= 1e6 ? +(n/1e6).toFixed(2) + ' ล้าน' : n >= 1e3 ? +(n/1e3).toFixed(1) + 'K' : String(n);

  /* ── Results + markers ── */
  function rowCard(it){
    const st = it.status || 'available';
    const c = create('article', { class:'rcard' + (st === 'sold' ? ' is-sold' : ''), role:'listitem', dataset:{ id: it.id } });
    c.appendChild(create('div', { class:'ph' }, imgEl(getImageURLs(it)[0], { size:320 })));
    c.appendChild(create('div', { style:{ minWidth:'0' } }, [
      create('div', { class:'meta' }, [ statusEl(st), create('span', { text: `${it.type || ''} · ${MODE_LABEL[it.listingMode === 'rent' ? 'rent' : 'sale']}` }) ]),
      priceEl(it),
      create('a', { class:'t stretch', href: listingHref(it.id), text: it.title || '-' })
    ]));
    c.addEventListener('mouseenter', () => highlight(it.id, true));
    c.addEventListener('mouseleave', () => highlight(it.id, false));
    c.addEventListener('focusin', () => highlight(it.id, true));
    c.addEventListener('focusout', () => highlight(it.id, false));
    return c;
  }
  function popupContent(it){
    const a = create('a', { class:'map-pop', href: listingHref(it.id) }, [
      create('div', { class:'ph' }, imgEl(getImageURLs(it)[0], { size:520 })),
      create('div', { class:'b' }, [ statusEl(it.status), priceEl(it), create('div', { class:'t', text: it.title || '-' }) ])
    ]);
    return a;
  }
  function highlight(id, on){
    const m = markers.get(id);
    const card = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (card) card.classList.toggle('hl', on);
    if (!m) return;
    const active = on || selectedId === id;
    if (m.kind === 'pin'){
      const el = m.layer.getElement();
      if (el) el.querySelector('.thumb-marker')?.classList.toggle('on', active);
      m.layer.setZIndexOffset(active ? 1000 : 0);
    } else m.layer.setStyle(approxStyle(+m.it.approxRadius || 300, active));
  }
  function select(id){
    const prev = selectedId; selectedId = id;
    if (prev) highlight(prev, false);
    if (id){
      highlight(id, true);
      const card = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card) card.scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
  }

  function render(){
    const f = store.filters;
    const filtered = sortItems(store.items.filter(it => passFilter(it, f)), f.sort);
    listEl.textContent = '';
    if (!store.ready){
      countEl.textContent = 'กำลังโหลด…';
      for (let i=0;i<4;i++) listEl.appendChild(create('div', { class:'skel', style:{ height:'94px', borderRadius:'20px' } }));
      return;
    }
    const onMap = filtered.filter(it => publicCoords(it)).length;
    countEl.textContent = `พบ ${filtered.length.toLocaleString('th-TH')} ประกาศ` + (filtered.length !== onMap ? ` · บนแผนที่ ${onMap}` : '');
    if (!filtered.length){
      listEl.appendChild(emptyState({ art:'map', title:'ไม่พบประกาศในเงื่อนไขนี้', text:'ลองปรับตัวกรองหรือช่วงราคา',
        actions:[ create('button', { type:'button', class:'btn', text:'ล้างตัวกรอง', onclick: () => resetFilters() }) ] }));
    }
    filtered.forEach(it => listEl.appendChild(rowCard(it)));

    if (!map) return;
    cluster.clearLayers(); circles.clearLayers(); markers.clear();
    const bounds = [];
    filtered.forEach(it => {
      const pc = publicCoords(it);
      if (!pc) return;
      if (pc.approx){
        // ตำแหน่งไม่ชัด → วงรัศมีรอบ "จุดแสดงผลที่สุ่มไว้" (dispLat/dispLng) ไม่ใช่พิกัดจริง
        const c = approxCircle(pc, it, it.id === selectedId);
        c.bindPopup(() => popupContent(it), { maxWidth:260, minWidth:260 });
        c.on('mouseover', () => highlight(it.id, true));
        c.on('mouseout', () => highlight(it.id, false));
        c.on('click', () => select(it.id));
        circles.addLayer(c);
        markers.set(it.id, { layer:c, kind:'circle', it });
      } else {
        const mk = L.marker([pc.lat, pc.lng], { icon: thumbPinIcon(it, it.id === selectedId), title: it.title || '', keyboard:true, riseOnHover:true });
        mk.bindPopup(() => popupContent(it), { maxWidth:260, minWidth:260, offset:[0, -10] });
        mk.on('mouseover', () => highlight(it.id, true));
        mk.on('mouseout', () => highlight(it.id, false));
        mk.on('click', () => select(it.id));
        cluster.addLayer(mk);
        markers.set(it.id, { layer:mk, kind:'pin', it });
      }
      bounds.push([pc.lat, pc.lng]);
    });
    if (fitNext && bounds.length){
      try { map.fitBounds(bounds, { padding:[60, 60], maxZoom:15, animate: !firstFit }); } catch {}
      fitNext = false; firstFit = false;
    }
  }

  /* ── Bottom sheet (mobile) ── */
  const mq = window.matchMedia('(min-width:1024px)');
  let sheetSnap = 1;   // 0 peek · 1 half · 2 full
  const snaps = () => { const h = wrap.clientHeight; return [132, Math.round(h * .58), Math.round(h * .88)]; };
  function setSheet(i, px){
    sheetSnap = i;
    wrap.style.setProperty('--sheet-h', (px != null ? px : snaps()[i]) + 'px');
    handle.setAttribute('aria-expanded', String(i > 0));
    if (map) setTimeout(() => map.invalidateSize(), 280);
  }
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (mq.matches) return;
    drag = { y: e.clientY, h: results.getBoundingClientRect().height, moved:false };
    handle.setPointerCapture(e.pointerId); results.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    const s = snaps();
    wrap.style.setProperty('--sheet-h', Math.max(s[0] - 40, Math.min(s[2], drag.h + dy)) + 'px');
  });
  const endDrag = () => {
    if (!drag) return;
    results.classList.remove('dragging');
    const h = results.getBoundingClientRect().height, s = snaps();
    if (!drag.moved) setSheet(sheetSnap === 0 ? 1 : sheetSnap === 1 ? 2 : 0);
    else { let best = 0; s.forEach((v, i) => { if (Math.abs(v - h) < Math.abs(s[best] - h)) best = i; }); setSheet(best); }
    drag = null;
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp'){ e.preventDefault(); setSheet(Math.min(2, sheetSnap + 1)); }
    if (e.key === 'ArrowDown'){ e.preventDefault(); setSheet(Math.max(0, sheetSnap - 1)); }
  });
  if (!mq.matches) requestAnimationFrame(() => setSheet(1));
  const onResize = () => { if (!mq.matches) setSheet(sheetSnap); if (map) map.invalidateSize(); };
  window.addEventListener('resize', onResize);

  renderChips(); render();

  return {
    meta: { title:'สำรวจแผนที่', hash:'#/explore', desc:'ดูประกาศบ้าน ที่ดิน คอนโด บนแผนที่ พร้อมตัวกรองราคา ประเภท และจำนวนห้องนอน' },
    update(kind){
      if (kind === 'filters'){ fitNext = true; renderChips(); render(); }
      else if (kind === 'favs'){ if (store.filters.favOnly) render(); }
      else if (kind === 'data'){ if (firstFit) fitNext = true; render(); renderChips(); }
      else if (kind === 'settings') renderChips();
    },
    destroy(){ destroyed = true; closePop(); window.removeEventListener('resize', onResize); if (map) map.remove(); }
  };
}

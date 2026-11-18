/* ============================================================================
   pages/home.js — #/  hero + KPI + ประกาศแนะนำ + เลือกตามประเภท + ประกาศล่าสุด
============================================================================ */
import { create } from '../core/dom.js';
import { priceParts, updatedMs_, fmtDay, MODE_LABEL } from '../core/format.js';
import { getImageURLs } from '../data/images.js';
import { passFilter, sortItems, effectivePinned } from '../data/listings.js';
import { store, publicItems, setFilters, resetFilters, activeFilterCount } from '../store.js';
import { icon } from '../ui/icons.js';
import {
  statusEl, chip, priceEl, imgEl, listingCard, skeletonCards, sparkSVG, countUp, countSpan,
  emptyState, sectionHead, listingHref
} from '../ui/components.js';

const PAGE = 12;
const TYPE_ICON = { 'บ้าน':'house', 'ที่ดิน':'land-plot', 'คอนโด':'building', 'อาคารพาณิชย์':'building', 'ทาวน์เฮาส์':'house' };

export function mount(root){
  let visible = PAGE;
  let animated = false;   // KPI นับขึ้น/การ์ดค่อย ๆ โผล่ เฉพาะครั้งแรก

  /* Hero */
  const seg = create('div', { class:'seg', role:'group', 'aria-label':'ประเภทการประกาศ' });
  [['', 'ทั้งหมด'], ['sale', 'ขาย'], ['rent', 'เช่า']].forEach(([v, l]) => {
    seg.appendChild(create('button', { type:'button', 'aria-pressed': String(store.filters.mode === v), dataset:{ v }, text:l,
      onclick: () => { visible = PAGE; setFilters({ mode: v }); } }));
  });
  const heroP = create('p', { class:'hero-p' });
  const hero = create('section', { class:'hero' }, [
    create('div', {}, [
      create('h1', {}, [ 'บ้าน ที่ดิน', create('br'), create('span', { text:'คอนโด' }) ]),
      heroP
    ]),
    seg
  ]);

  const kpis = create('section', { class:'kpis', 'aria-label':'สรุปประกาศ' });

  /* Featured */
  const track = create('div', { class:'track', id:'featTrack' });
  const nav = create('div', { class:'track-nav' }, [
    create('button', { type:'button', class:'icon-btn', 'aria-label':'เลื่อนซ้าย', onclick: () => scrollTrack(-1) }, icon('chevron-left')),
    create('button', { type:'button', class:'icon-btn', 'aria-label':'เลื่อนขวา', onclick: () => scrollTrack(1) }, icon('chevron-right'))
  ]);
  const featHead = sectionHead('featH', 'ประกาศแนะนำ', '', nav);
  const featSec = create('section', { class:'sec', 'aria-labelledby':'featH' }, [ featHead, track ]);
  function scrollTrack(d){
    const card = track.firstElementChild; if (!card) return;
    track.scrollBy({ left: d * (card.getBoundingClientRect().width + 20), behavior:'smooth' });
  }

  /* Types */
  const types = create('div', { class:'types', role:'group', 'aria-label':'กรองตามประเภท' });
  const typeSec = create('section', { class:'sec', 'aria-labelledby':'typeH' }, [
    sectionHead('typeH', 'เลือกตามประเภท', 'แตะการ์ดเพื่อกรองรายการด้านล่าง'), types
  ]);

  /* Latest */
  const sortSel = create('select', { class:'select-pill', 'aria-label':'เรียงตาม' }, [
    create('option', { value:'new', text:'ใหม่สุด' }),
    create('option', { value:'priceAsc', text:'ราคาต่ำ → สูง' }),
    create('option', { value:'priceDesc', text:'ราคาสูง → ต่ำ' })
  ]);
  sortSel.value = store.filters.sort || 'new';
  sortSel.addEventListener('change', () => { visible = PAGE; setFilters({ sort: sortSel.value }); });
  const latestSub = create('div', { class:'label', 'aria-live':'polite' });
  const latestHead = create('div', { class:'sec-head' }, [
    create('div', {}, [ create('h2', { id:'latestH', text:'ประกาศล่าสุด' }), latestSub ]),
    create('div', { class:'head-tools' }, [
      sortSel,
      create('a', { class:'btn btn-white', href:'#/explore' }, [ icon('map'), create('span', { class:'hide-sm', text:'ดูบนแผนที่' }) ])
    ])
  ]);
  const grid = create('div', { class:'grid-cards' });
  const more = create('div', { class:'more-wrap' });
  const latestSec = create('section', { class:'sec', 'aria-labelledby':'latestH' }, [ latestHead, grid, more ]);

  root.append(hero, kpis, featSec, typeSec, latestSec);

  /* ── renderers ── */
  function renderHero(){
    heroP.textContent = (store.settings.aboutText || '').trim()
      || 'รวมประกาศบ้าน ที่ดิน คอนโด พร้อมรูปจริงและตำแหน่งบนแผนที่ ติดต่อครูไลลาได้โดยตรง ไม่ผ่านนายหน้าซ้ำซ้อน';
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === store.filters.mode)));
  }

  function pool(){ return publicItems().filter(it => !store.filters.mode || (it.listingMode || 'sale') === store.filters.mode); }

  function kpi(i, label, valueNode, sub, anim){
    const k = create('div', { class:'kpi' + (anim ? ' reveal' : '') }, [
      create('span', { class:'label', text:label }), valueNode, create('div', { class:'sub' }, sub)
    ]);
    if (anim) k.style.setProperty('--i', String(i));
    return k;
  }
  function renderKpis(anim){
    kpis.textContent = '';
    if (!store.ready){
      for (let i=0;i<4;i++) kpis.appendChild(create('div', { class:'kpi' }, [ create('div', { class:'skel line', style:{ width:'50%' } }), create('div', { class:'skel line lg', style:{ width:'40%', height:'40px' } }) ]));
      return;
    }
    const items = pool();
    const n = (s) => items.filter(x => (x.status || 'available') === s).length;
    // 1) ทั้งหมด
    const v1 = create('span', { class:'v' }, countSpan(items.length, anim));
    kpis.appendChild(kpi(0, 'ประกาศทั้งหมด', v1, [
      withCount(statusEl('available'), n('available')), withCount(statusEl('reserved'), n('reserved')), withCount(statusEl('sold'), n('sold'))
    ], anim));
    // 2) ราคาเริ่มต้น (ประกาศที่ยังไม่ขาย)
    const live = items.filter(x => (x.status || 'available') !== 'sold' && +x.price > 0);
    const sale = live.filter(x => (x.listingMode || 'sale') === 'sale');
    const rent = live.filter(x => x.listingMode === 'rent');
    const base = sale.length ? sale : rent;
    let v2, sub2 = [];
    if (base.length){
      const min = base.reduce((a, b) => (+b.price < +a.price ? b : a));
      const q = priceParts(min);
      const isNum = /^[\d.]+$/.test(q.n);
      v2 = create('span', { class:'v' }, [ isNum ? countSpan(+q.n, anim, (q.n.split('.')[1] || '').length) : q.n, q.u ? create('small', { text:q.u }) : null ]);
      if (sale.length && rent.length){
        const r = rent.reduce((a, b) => (+b.price < +a.price ? b : a));
        sub2 = [ `เช่าเริ่ม ฿${(+r.price).toLocaleString('th-TH')}/ด.` ];
      } else sub2 = [ base === rent ? 'ค่าเช่าต่อเดือน' : 'ราคาขายต่ำสุดตอนนี้' ];
    } else { v2 = create('span', { class:'v', text:'—' }); sub2 = [ 'ยังไม่มีราคา' ]; }
    kpis.appendChild(kpi(1, 'ราคาเริ่มต้น', v2, sub2, anim));
    // 3) ประเภทที่มีมากสุด
    const by = {}; items.forEach(x => { const t = x.type || 'อื่น ๆ'; by[t] = (by[t] || 0) + 1; });
    const top = Object.entries(by).sort((a,b) => b[1] - a[1])[0];
    kpis.appendChild(kpi(2, 'ประเภทที่มีมากสุด', create('span', { class:'v', text: top ? top[0] : '—' }),
      [ top ? `${top[1]} จาก ${items.length} ประกาศ` : 'ยังไม่มีประกาศ' ], anim));
    // 4) อัปเดตล่าสุด
    let latest = null, lms = -1;
    items.forEach(x => { const ms = updatedMs_(x); if (ms != null && ms > lms){ lms = ms; latest = x; } });
    const v4 = create('span', { class:'v' });
    if (latest){
      const d = new Date(lms);
      v4.append(String(d.getDate()), create('small', { text: fmtDay(lms, { month:'short' }) }));
    } else v4.textContent = '—';
    const sub4 = latest ? [ create('a', { class:'kpi-link', href: listingHref(latest.id), text: latest.title || 'ดูประกาศ' }) ] : [ '—' ];
    kpis.appendChild(kpi(3, 'อัปเดตล่าสุด', v4, sub4, anim));
  }
  function withCount(stEl, n){ stEl.appendChild(create('b', { class:'num', text:' ' + n })); return stEl; }

  function renderFeatured(anim){
    track.textContent = '';
    if (!store.ready){
      for (let i=0;i<3;i++) track.appendChild(create('div', { class:'feat skel' }));
      return;
    }
    const items = pool().filter(x => (x.status || 'available') !== 'sold');
    let list = items.filter(effectivePinned);
    const pinned = list.length > 0;
    if (!pinned) list = items.slice().sort((a,b) => (+b.views||0) - (+a.views||0)).slice(0, 6);
    featHead.querySelector('.label')?.remove();
    featHead.firstElementChild.appendChild(create('div', { class:'label', text: pinned ? 'ปักหมุดโดยครูไลลา' : 'ยอดเข้าชมสูงสุดตอนนี้' }));
    featSec.hidden = !list.length;
    nav.hidden = list.length < 3;
    list.forEach((it, i) => {
      const a = create('a', { class:'feat' + (anim ? ' reveal' : ''), href: listingHref(it.id), 'aria-label': `${it.title || 'ประกาศ'} — ${priceParts(it).n} ${priceParts(it).u}` });
      if (anim) a.style.setProperty('--i', String(i));
      a.appendChild(imgEl(getImageURLs(it)[0], { size: 1000, eager: i < 2 }));
      a.appendChild(create('div', { class:'top' }, [
        chip(statusEl(it.status), 'on-img'),
        pinned ? chip([icon('pin','ic-sm'), 'แนะนำ'], 'dark') : chip([icon('eye','ic-sm'), String(+it.views || 0)], 'dark')
      ]));
      a.appendChild(create('div', { class:'info' }, [
        create('div', { class:'info-l' }, [ create('div', { class:'t', text: it.title || '-' }), priceEl(it) ]),
        create('span', { class:'icon-btn dark', 'aria-hidden':'true' }, icon('arrow-up-right'))
      ]));
      track.appendChild(a);
    });
  }

  function renderTypes(anim){
    types.textContent = '';
    if (!store.ready){ for (let i=0;i<3;i++) types.appendChild(create('div', { class:'tcard skel', style:{ minHeight:'260px' } })); return; }
    const items = pool();
    const by = {};
    items.forEach(x => { const t = x.type || 'อื่น ๆ'; (by[t] = by[t] || []).push(x); });
    const order = (store.types || []).filter(t => by[t]).concat(Object.keys(by).filter(t => !(store.types || []).includes(t)));
    typeSec.hidden = !order.length;
    order.forEach((t, i) => {
      const arr = by[t];
      const sel = store.filters.type === t;
      const sale = arr.filter(x => (x.listingMode || 'sale') === 'sale' && +x.price > 0);
      const base = sale.length ? sale : arr.filter(x => +x.price > 0);
      const c = (s) => arr.filter(x => (x.status || 'available') === s).length;
      const range = create('div', { class:'range' });
      if (base.length){
        const lo = base.reduce((a,b) => (+b.price < +a.price ? b : a)), hi = base.reduce((a,b) => (+b.price > +a.price ? b : a));
        const pl = priceParts(lo), phh = priceParts(hi);
        range.append(pl.n, create('span', { class:'u', text:' ' + pl.u }));
        if (+lo.price !== +hi.price) range.append(' – ' + phh.n, create('span', { class:'u', text:' ' + phh.u }));
      } else range.textContent = 'สอบถาม';
      const card = create('button', { type:'button', class:'tcard' + (anim ? ' reveal' : ''), 'aria-pressed': String(sel),
        'aria-label': `${t} ${arr.length} ประกาศ${sel ? ' (กำลังกรอง)' : ''}`,
        onclick: () => { visible = PAGE; setFilters({ type: sel ? '' : t }); if (!sel) document.getElementById('latestH')?.scrollIntoView({ behavior:'smooth', block:'start' }); } }, [
        create('div', { class:'head' }, [ create('span', { class:'name' }, [ icon(TYPE_ICON[t] || 'grid'), t ]), create('span', { class:'count-badge', text:String(arr.length) }) ]),
        create('div', {}, [ create('div', { class:'label', text: sale.length ? 'ช่วงราคาขาย' : 'ช่วงราคา' }), range ]),
        sparkSVG(base.map(x => x.price)),
        create('div', { class:'inner' }, [
          row(statusEl('available'), c('available')), row(statusEl('reserved'), c('reserved')), row(statusEl('sold'), c('sold'))
        ])
      ]);
      if (anim) card.style.setProperty('--i', String(i));
      types.appendChild(card);
    });
  }
  const row = (l, n) => create('div', { class:'row' }, [ l, create('b', { text:String(n) }) ]);

  function renderLatest(anim){
    grid.textContent = ''; more.textContent = '';
    if (!store.ready){ grid.append(...skeletonCards(8).children); return; }
    const f = store.filters;
    const filtered = sortItems(store.items.filter(it => passFilter(it, f)), f.sort);
    const parts = [];
    if (f.type) parts.push('ประเภท: ' + f.type);
    if (f.mode) parts.push(MODE_LABEL[f.mode]);
    if (f.q) parts.push(`“${f.q}”`);
    latestSub.textContent = (parts.length ? parts.join(' · ') + ' · ' : '') + `พบ ${filtered.length.toLocaleString('th-TH')} ประกาศ`;
    if (store.error && !store.items.length){
      grid.appendChild(emptyState({ art:'house', title:'โหลดข้อมูลไม่สำเร็จ', text:'ลองรีเฟรชหน้านี้อีกครั้ง หรือติดต่อครูไลลาโดยตรง',
        actions:[ create('button', { type:'button', class:'btn', text:'รีเฟรช', onclick: () => location.reload() }) ] }));
      return;
    }
    if (!filtered.length){
      grid.appendChild(emptyState({ art:'search', title:'ไม่พบประกาศที่ตรงเงื่อนไข', text:'ลองล้างตัวกรองหรือค้นหาด้วยคำอื่น',
        actions:[ create('button', { type:'button', class:'btn', text:'ล้างตัวกรอง', onclick: () => { document.getElementById('q').value=''; resetFilters({ sort: f.sort }); } }) ] }));
      return;
    }
    filtered.slice(0, visible).forEach((it, i) => grid.appendChild(listingCard(it, { i, anim })));
    if (filtered.length > visible){
      more.appendChild(create('button', { type:'button', class:'btn btn-white btn-lg',
        onclick: () => { const from = visible; visible += PAGE; renderLatest(false); grid.children[from]?.querySelector('a')?.focus({ preventScroll:true }); } },
        [ `โหลดเพิ่ม (${(filtered.length - visible).toLocaleString('th-TH')})`, icon('chevron-down') ]));
    }
    if (activeFilterCount() && !f.type && !f.mode && !f.q){
      more.appendChild(create('button', { type:'button', class:'btn btn-soft', text:'ล้างตัวกรองจากหน้าแผนที่', onclick: () => resetFilters() }));
    }
  }

  function renderAll(){
    const anim = store.ready && !animated;
    renderHero(); renderKpis(anim); renderFeatured(anim); renderTypes(anim); renderLatest(anim);
    if (anim){ animated = true; countUp(root); }
  }
  renderAll();

  return {
    meta: {},
    update(kind){
      if (kind === 'favs') return;   // ปุ่มหัวใจอัปเดตตัวเองแล้ว
      if (kind === 'filters'){ renderHero(); renderKpis(false); renderFeatured(false); renderTypes(false); renderLatest(false); return; }
      renderAll();
    }
  };
}

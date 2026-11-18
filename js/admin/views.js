/* ============================================================================
   admin/views.js — หน้าในแอดมิน: ภาพรวม · ประกาศ · ลูกค้าที่สนใจ · ประเภท · ตั้งค่า
   (UI เขียนใหม่ทั้งหมด — คำสั่งเขียนข้อมูลอยู่ใน ops.js ซึ่งคัดลอกจากของเดิม)
============================================================================ */
import { create, safePhoneTel, copyText, debounce } from '../core/dom.js';
import { STATUS_LABEL, MODE_LABEL, createdMs_, fmtPostDate, fmtInt, priceText } from '../core/format.js';
import { getImageURLs } from '../data/images.js';
import { effectivePinned, pinnedUntilMs_ } from '../data/listings.js';
import { loadTypes } from '../data/firebase.js';
import { icon } from '../ui/icons.js';
import { statusEl, chip, imgEl, countUp, countSpan, emptyState } from '../ui/components.js';
import { hasLeaflet, monoTiles, newMap, pricePinIcon, TH_CENTER } from '../ui/map.js';
import { admin, emit } from './store.js';
import { openEditor } from './editor.js';
import {
  quickStatus, duplicateListing, togglePin, exportListings, importListingsFile,
  addType, removeType, saveSiteSettings, setLeadHandled, deleteLead
} from './ops.js';

const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const monthLabel = (y, m) => `${TH_MONTH[m]} ${y + 543}`;
const st_ = (it) => it.status || 'available';

function head(title, sub, right){
  return create('header', { class:'dash-head' }, [
    create('div', {}, [ create('h1', { text:title }), sub ? create('div', { class:'label', style:{ marginTop:'6px' }, text:sub }) : null ]),
    create('div', { class:'head-tools wrap' }, right || [])
  ]);
}
function who(){
  const email = (admin.user && admin.user.email) || '';
  const av = (email.replace(/[^a-z]/gi, '').slice(0, 2) || 'AD').toUpperCase();
  return create('span', { class:'who', title: email }, [ create('span', { class:'av', 'aria-hidden':'true', text:av }), create('span', { class:'who-mail', text: email }) ]);
}
const newBtn = () => create('button', { type:'button', class:'btn', onclick: () => openEditor(null) }, [ icon('plus'), 'เพิ่มประกาศ' ]);
function leadContact(l){
  const c = String(l.contact || '');
  const tel = /^[\d\s+\-()]{6,}$/.test(c) ? safePhoneTel(c) : '';
  return tel ? create('a', { class:'btn btn-white btn-sm', href: tel }, [ icon('phone','ic-sm'), c ])
             : create('button', { type:'button', class:'btn btn-white btn-sm', title:'คัดลอก', onclick: () => copyText(c, 'คัดลอกแล้ว') }, [ icon('message-circle','ic-sm'), c ]);
}
const fmtLeadTime = (ts) => {
  const ms = ts && typeof ts.toDate === 'function' ? ts.toDate().getTime() : null;
  return ms ? new Date(ms).toLocaleString('th-TH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
};
function leadCard(l, compact){
  const card = create('div', { class:'lead' + (l.handled ? ' handled' : '') }, [
    create('div', { class:'h' }, [ create('b', { text: l.name || '-' }), create('span', { class:'label', text: fmtLeadTime(l.createdAt) }) ]),
    l.listingId ? create('a', { class:'label lead-l', href:'index.html#/listing/' + encodeURIComponent(l.listingId), target:'_blank', rel:'noopener' }, [ icon('house','ic-sm'), l.listingTitle || 'ดูประกาศ' ]) : null,
    l.message ? create('div', { class:'lead-msg', text: l.message }) : null
  ]);
  const act = create('div', { class:'btn-row', style:{ marginTop:'8px' } }, [
    leadContact(l),
    create('button', { type:'button', class:'btn btn-white btn-sm', onclick: () => setLeadHandled(l) },
      l.handled ? [ icon('undo','ic-sm'), 'ยังไม่ติดต่อ' ] : [ icon('check','ic-sm'), 'ติดต่อแล้ว' ]),
    compact ? null : create('button', { type:'button', class:'btn btn-danger btn-sm', onclick: () => deleteLead(l) }, [ icon('trash','ic-sm'), 'ลบ' ])
  ]);
  card.appendChild(act);
  return card;
}

/* =========================================================================
   ภาพรวม
========================================================================= */
export function overview(root){
  let months = 6, animated = false, selMonth = null;
  const kpis = create('section', { class:'kpis six', 'aria-label':'ตัวเลขสรุป' });
  const seg = create('div', { class:'seg', role:'group', 'aria-label':'ช่วงเวลา' }, [6, 12].map(n =>
    create('button', { type:'button', 'aria-pressed': String(n === months), text:`${n} เดือน`, onclick: () => { months = n; seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent.startsWith(String(n))))); renderMonths(false); } })));
  const monthsEl = create('div', { class:'months' });
  const rank = create('div', { class:'rank' });
  const leadsBox = create('div', { style:{ display:'grid', gap:'10px' } });
  const leadsCount = create('span', { class:'count-badge dark' });
  const today = new Date().toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'short', year:'numeric' });
  root.append(
    head('ภาพรวม', `อัปเดตแบบเรียลไทม์ · ${today}`, [ who(), newBtn() ]),
    kpis,
    create('section', { class:'sec', 'aria-labelledby':'mH' }, [
      create('div', { class:'sec-head' }, [ create('div', {}, [ create('h2', { id:'mH', text:'รายเดือน' }), create('div', { class:'label', text:'ประกาศใหม่ และยอดเข้าชมสะสมของประกาศที่ลงในเดือนนั้น · แตะเพื่อดูรายการ' }) ]), seg ]),
      monthsEl
    ]),
    create('section', { class:'sec dash-cols' }, [
      create('div', { class:'card' }, [
        create('div', { class:'sec-head', style:{ marginBottom:'8px' } }, [ create('div', {}, [ create('h2', { class:'card-title', text:'ยอดเข้าชมสูงสุด 5 อันดับ' }), create('div', { class:'label', text:'คลิกเพื่อแก้ไขประกาศ' }) ]), icon('trending-up','ic-lg') ]),
        rank
      ]),
      create('div', { class:'card' }, [
        create('div', { class:'sec-head', style:{ marginBottom:'12px' } }, [
          create('div', {}, [ create('h2', { class:'card-title' }, [ 'ลูกค้าที่สนใจ ', leadsCount ]), create('div', { class:'label', text:'ฝากข้อมูลจากหน้าประกาศ' }) ]),
          create('a', { class:'btn btn-soft btn-sm', href:'#/leads', text:'ดูทั้งหมด' })
        ]),
        leadsBox
      ])
    ]),
    create('div', { style:{ height:'40px' } })
  );

  function renderKpis(anim){
    kpis.textContent = '';
    const all = admin.items;
    const c = (s) => all.filter(x => st_(x) === s).length;
    const views = all.reduce((a, x) => a + (+x.views || 0), 0);
    const pct = all.length ? Math.round(c('available') / all.length * 100) : 0;
    const K = [
      ['ประกาศทั้งหมด', all.length, [ `เผยแพร่ ${all.length - c('draft')} · ร่าง ${c('draft')}` ]],
      ['เปิดขาย', c('available'), [ `${pct}% ของทั้งหมด` ]],
      ['จองแล้ว', c('reserved'), [ statusEl('reserved') ]],
      ['ขายแล้ว', c('sold'), [ statusEl('sold') ]],
      ['ฉบับร่าง', c('draft'), [ 'ซ่อนจากหน้าเว็บ' ]],
      ['ยอดเข้าชมรวม', views, [ `เฉลี่ย ${all.length ? Math.round(views / all.length) : 0} / ประกาศ` ]]
    ];
    K.forEach(([l, v, sub], i) => {
      const k = create('div', { class:'kpi' + (anim ? ' reveal' : '') }, [ create('span', { class:'label', text:l }), create('span', { class:'v' }, admin.ready ? countSpan(v, anim) : create('span', { class:'skel line lg', style:{ display:'block', width:'60%' } })), create('div', { class:'sub' }, sub) ]);
      if (anim) k.style.setProperty('--i', String(i));
      kpis.appendChild(k);
    });
  }
  function renderMonths(anim){
    monthsEl.textContent = '';
    const now = new Date();
    for (let i = 0; i < months; i++){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const arr = admin.items.filter(x => { const ms = createdMs_(x); if (ms == null) return false; const t = new Date(ms); return t.getFullYear() === y && t.getMonth() === m; });
      const v = arr.reduce((a, x) => a + (+x.views || 0), 0);
      const k = (f) => arr.filter(f).length;
      const key = `${y}-${m}`;
      const card = create('button', { type:'button', class:'tcard mcard' + (anim ? ' reveal' : ''), 'aria-pressed': String(selMonth === key),
        'aria-label': `${monthLabel(y, m)}: ประกาศใหม่ ${arr.length}, เข้าชม ${v} ครั้ง`,
        onclick: () => { selMonth = key; admin.listFilter.month = { y, m }; location.hash = '#/listings'; } }, [
        create('div', { class:'head' }, [ create('span', { class:'name', text: monthLabel(y, m) }), create('span', { class:'count-badge', title:'ประกาศใหม่', text: String(arr.length) }) ]),
        create('div', {}, [ create('div', { class:'label', text:'ยอดเข้าชม' }), create('div', { class:'v' }, [ countSpan(v, anim), create('small', { text:'ครั้ง' }) ]) ]),
        create('div', { class:'inner' }, [
          row('available', 'ขาย', k(x => (x.listingMode || 'sale') === 'sale' && st_(x) !== 'sold')),
          row('', 'เช่า', k(x => x.listingMode === 'rent')),
          row('sold', 'ขายแล้ว', k(x => st_(x) === 'sold'))
        ])
      ]);
      if (anim) card.style.setProperty('--i', String(i));
      monthsEl.appendChild(card);
    }
  }
  const row = (dot, l, n) => create('div', { class:'row' }, [ create('span', { class:'status' }, [ create('span', { class:'dot ' + dot }), l ]), create('b', { text:String(n) }) ]);
  function renderRank(){
    rank.textContent = '';
    const top = admin.items.filter(i => +i.views).sort((a, b) => (+b.views || 0) - (+a.views || 0)).slice(0, 5);
    if (!top.length){ rank.appendChild(create('p', { class:'label', text: admin.ready ? 'ยังไม่มียอดเข้าชม' : 'กำลังโหลด…' })); return; }
    const max = +top[0].views || 1;
    top.forEach((it, i) => rank.appendChild(create('button', { type:'button', class:'rank-row', onclick: () => openEditor(it) }, [
      create('span', { class:'n', text:String(i + 1) }),
      create('span', { class:'th' }, imgEl(getImageURLs(it)[0], { size:160 })),
      create('span', { style:{ minWidth:'0' } }, [ create('span', { class:'t', text: it.title || '-' }), create('span', { class:'bar' }, create('i', { style:{ width: ((+it.views || 0) / max * 100) + '%' } })) ]),
      create('span', { class:'vv' }, [ icon('eye','ic-sm'), fmtInt(it.views) ])
    ])));
  }
  function renderLeads(){
    leadsBox.textContent = '';
    const pending = admin.leads.filter(l => !l.handled);
    leadsCount.textContent = String(pending.length);
    leadsCount.hidden = !pending.length;
    if (admin.leadsError){ leadsBox.appendChild(create('p', { class:'label', text: admin.leadsError })); return; }
    if (!pending.length){ leadsBox.appendChild(create('p', { class:'label', text:'ไม่มีข้อความใหม่' })); return; }
    pending.slice(0, 3).forEach(l => leadsBox.appendChild(leadCard(l, true)));
  }
  function all(){
    const anim = admin.ready && !animated;
    renderKpis(anim); renderMonths(anim); renderRank(); renderLeads();
    if (anim){ animated = true; countUp(root); }
  }
  all();
  return { title:'ภาพรวม', update(kind){ if (kind === 'leads') renderLeads(); else all(); } };
}

/* =========================================================================
   ประกาศ (ตาราง + แผนที่)
========================================================================= */
export function listings(root){
  const f = admin.listFilter;
  const countEl = create('span');
  const importFile = create('input', { type:'file', accept:'application/json', hidden:'' });
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    importFile.value = '';   // reset — เดิมเลือกไฟล์เดิมซ้ำแล้ว change ไม่ทำงาน
    importListingsFile(file, admin.items);
  });
  root.append(head('ประกาศ', null, [
    create('button', { type:'button', class:'btn btn-white', onclick: exportListings }, [ icon('download'), create('span', { class:'hide-sm', text:'ส่งออก JSON' }) ]),
    create('button', { type:'button', class:'btn btn-white', onclick: () => importFile.click() }, [ icon('upload'), create('span', { class:'hide-sm', text:'นำเข้า JSON' }) ]),
    importFile, newBtn()
  ]));
  root.querySelector('.dash-head > div').appendChild(create('div', { class:'label', style:{ marginTop:'6px' } }, countEl));

  const search = create('input', { type:'search', class:'input', placeholder:'ค้นหาหัวข้อ/ประเภท/รายละเอียด…', 'aria-label':'ค้นหาประกาศ', value: f.q });
  search.addEventListener('input', debounce(() => { f.q = search.value; render(); }, 150));
  const stSeg = create('div', { class:'seg', role:'group', 'aria-label':'กรองสถานะ' }, [['', 'ทั้งหมด'], ['available', 'เปิดขาย'], ['reserved', 'จองแล้ว'], ['sold', 'ขายแล้ว'], ['draft', 'ร่าง']].map(([v, l]) =>
    create('button', { type:'button', 'aria-pressed': String(f.status === v), dataset:{ v }, text:l, onclick: () => { f.status = v; stSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); render(); } })));
  const sort = create('select', { class:'select-pill', 'aria-label':'เรียงตาม' }, [
    ['new', 'ใหม่สุด'], ['viewsDesc', 'ยอดดู มาก→น้อย'], ['priceDesc', 'ราคา สูง→ต่ำ'], ['priceAsc', 'ราคา ต่ำ→สูง']
  ].map(([v, l]) => create('option', { value:v, text:l })));
  sort.value = f.sort;
  sort.addEventListener('change', () => { f.sort = sort.value; render(); });
  const viewSeg = create('div', { class:'seg', role:'group', 'aria-label':'มุมมอง' }, [['table', 'list', 'ตาราง'], ['map', 'map', 'แผนที่']].map(([v, ic, l]) =>
    create('button', { type:'button', 'aria-pressed': String(f.view === v), dataset:{ v }, 'aria-label':l, onclick: () => { f.view = v; viewSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); render(); } }, [ icon(ic,'ic-sm'), create('span', { class:'hide-sm', text:' ' + l }) ])));
  const monthChip = create('div');
  const toolbar = create('div', { class:'toolbar' }, [ create('div', { class:'tb-search' }, search), stSeg, sort, viewSeg, monthChip ]);
  const body = create('div', { class:'card table-card' });
  root.append(toolbar, body, create('div', { style:{ height:'40px' } }));

  let map = null, mapLayer = null;

  /* ตัวกรอง/เรียง (เดิม: adminFilterSort) + สถานะ + เดือน */
  function filtered(){
    const q = (f.q || '').trim().toLowerCase();
    let items = admin.items.filter(it => !q ||
      (`${it.title||''} ${it.type||''} ${it.desc||''}`).toLowerCase().includes(q));
    if (f.status) items = items.filter(it => st_(it) === f.status);
    if (f.month) items = items.filter(it => { const ms = createdMs_(it); if (ms == null) return false; const d = new Date(ms); return d.getFullYear() === f.month.y && d.getMonth() === f.month.m; });
    items = items.slice();
    if (f.sort === 'viewsDesc') items.sort((a,b)=>(+b.views||0)-(+a.views||0));
    else if (f.sort === 'priceDesc') items.sort((a,b)=>(+b.price||0)-(+a.price||0));
    else if (f.sort === 'priceAsc') items.sort((a,b)=>(+a.price||0)-(+b.price||0));
    // 'new' = ตามลำดับ createdAt desc จาก query อยู่แล้ว
    items.sort((a,b)=> (effectivePinned(b)?1:0) - (effectivePinned(a)?1:0));   // ปักหมุดที่ยังไม่หมดเวลา ขึ้นบนสุด
    return items;
  }

  function render(){
    monthChip.textContent = '';
    if (f.month) monthChip.appendChild(create('button', { type:'button', class:'chip dark', 'aria-label':'ล้างตัวกรองเดือน', onclick: () => { f.month = null; render(); } }, [ icon('calendar','ic-sm'), monthLabel(f.month.y, f.month.m), icon('x','ic-sm') ]));
    const items = filtered();
    countEl.textContent = admin.ready ? `${items.length.toLocaleString('th-TH')} จาก ${admin.items.length.toLocaleString('th-TH')} ประกาศ` : 'กำลังโหลด…';
    if (f.view === 'map') return renderMap(items);
    if (map){ map.remove(); map = null; }
    body.textContent = '';
    if (!admin.ready){ for (let i=0;i<5;i++) body.appendChild(create('div', { class:'skel', style:{ height:'64px', margin:'8px 0', borderRadius:'16px' } })); return; }
    if (!items.length){ body.appendChild(emptyState({ art:'search', title:'ไม่พบรายการ', text:'ลองเปลี่ยนคำค้นหรือตัวกรอง' })); return; }
    const tbl = create('table', { class:'atable' });
    tbl.appendChild(create('thead', {}, create('tr', {}, [
      create('th', { scope:'col', text:'ประกาศ' }), create('th', { scope:'col', text:'สถานะ' }), create('th', { scope:'col', text:'ราคา' }),
      create('th', { scope:'col', class:'r', text:'เข้าชม' }), create('th', { scope:'col', text:'โพสต์เมื่อ' }), create('th', { scope:'col' }, create('span', { class:'sr-only', text:'จัดการ' }))
    ])));
    const tb = create('tbody');
    items.forEach(it => tb.appendChild(rowEl(it)));
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }
  function rowEl(it){
    const tr = create('tr', { tabindex:'0', 'aria-label': `แก้ไข ${it.title || 'ประกาศ'}` });
    const pinned = effectivePinned(it);
    const until = pinnedUntilMs_(it);
    const tCell = create('td', { class:'t-cell' }, [
      create('span', { class:'th' }, imgEl(getImageURLs(it)[0], { size:160 })),
      create('span', { class:'tt' }, [
        create('b', { text: it.title || '-' }),
        create('span', { class:'label' }, [ `${it.type || '-'} · ${MODE_LABEL[it.listingMode === 'rent' ? 'rent' : 'sale']}`,
          pinned ? create('span', { class:'pin-tag' }, [ icon('pin','ic-sm'), until ? `ถึง ${new Date(until).toLocaleDateString('th-TH', { day:'numeric', month:'short' })}` : 'ปักหมุด' ]) : null ])
      ])
    ]);
    // เปลี่ยนสถานะเร็วจากในตาราง
    const sel = create('select', { class:'status-sel s-' + st_(it), 'aria-label':'สถานะของ ' + (it.title || 'ประกาศ') },
      ['available','reserved','sold','draft'].map(s => create('option', { value:s, text: STATUS_LABEL[s] })));
    sel.value = st_(it);
    sel.addEventListener('change', () => quickStatus(it, sel.value));
    const acts = create('td', { class:'acts' }, [
      create('button', { type:'button', class:'icon-btn sm soft' + (it.pinned ? ' on' : ''), 'aria-pressed': String(!!it.pinned), title: it.pinned ? 'เลิกปักหมุด' : 'ปักหมุด (แสดงบนสุด)', 'aria-label': it.pinned ? 'เลิกปักหมุด' : 'ปักหมุด', onclick: () => togglePin(it) }, icon('pin','ic-sm')),
      create('button', { type:'button', class:'icon-btn sm soft', title:'ก๊อปปี้เป็นฉบับร่าง', 'aria-label':'ก๊อปปี้', onclick: () => duplicateListing(it) }, icon('copy','ic-sm')),
      create('button', { type:'button', class:'icon-btn sm dark', title:'แก้ไข', 'aria-label':'แก้ไข', onclick: () => openEditor(it) }, icon('pencil','ic-sm'))
    ]);
    tr.append(tCell, create('td', { 'data-l':'สถานะ' }, sel), create('td', { class:'num', 'data-l':'ราคา', text: priceText(it) }),
      create('td', { class:'num r', 'data-l':'เข้าชม', text: fmtInt(it.views) }), create('td', { class:'label', 'data-l':'โพสต์', text: fmtPostDate(it) || '-' }), acts);
    tr.addEventListener('click', (e) => { if (e.target.closest('select, button, a')) return; openEditor(it); });
    tr.addEventListener('keydown', (e) => { if (e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openEditor(it); } });
    return tr;
  }
  function renderMap(items){
    if (!hasLeaflet()){ body.textContent = 'โหลดแผนที่ไม่สำเร็จ'; return; }
    if (!map){
      body.textContent = '';
      const el = create('div', { class:'admin-map' });
      body.appendChild(el);
      map = newMap(el, { layers:[ monoTiles() ] }).setView(TH_CENTER, 6);
      mapLayer = L.layerGroup().addTo(map);
      requestAnimationFrame(() => map.invalidateSize());
    }
    mapLayer.clearLayers();
    const bounds = [];
    items.forEach(it => {
      if (it.lat && it.lng){   // แอดมินเห็นพิกัดจริง (เหมือนแผนที่ในแอดมินเดิม)
        const mk = L.marker([it.lat, it.lng], { icon: pricePinIcon(it), title: it.title || '' });
        mk.on('click', () => openEditor(it));
        mapLayer.addLayer(mk);
        bounds.push([it.lat, it.lng]);
      }
    });
    if (bounds.length){ try { map.fitBounds(bounds, { padding:[40,40], maxZoom:15 }); } catch{} }
  }
  render();
  return { title:'ประกาศ', update(kind){ if (kind === 'items') render(); }, destroy(){ if (map) map.remove(); } };
}

/* =========================================================================
   ลูกค้าที่สนใจ (/leads) — เดิม: initLeads()
========================================================================= */
export function leads(root){
  const showHandled = create('input', { type:'checkbox', id:'leadsShowHandled' });
  const list = create('div', { class:'leads-grid', 'aria-live':'polite' });
  const sub = create('span');
  root.append(
    head('ลูกค้าที่สนใจ', null, [ create('label', { class:'switch', for:'leadsShowHandled' }, [ showHandled, create('span', { class:'track-sw', 'aria-hidden':'true' }), 'แสดงที่ติดต่อแล้ว' ]) ]),
    list, create('div', { style:{ height:'40px' } })
  );
  root.querySelector('.dash-head > div').appendChild(create('div', { class:'label', style:{ marginTop:'6px' } }, sub));
  function render(){
    const pending = admin.leads.filter(l => !l.handled).length;
    sub.textContent = `${pending} รายการใหม่ · ทั้งหมด ${admin.leads.length}`;
    list.textContent = '';
    if (admin.leadsError){ list.appendChild(emptyState({ art:'search', title:'อ่านข้อความไม่ได้', text: admin.leadsError })); return; }
    const rows = admin.leads.filter(l => showHandled.checked || !l.handled);
    if (!rows.length){ list.appendChild(emptyState({ art:'heart', title:'ยังไม่มีข้อความใหม่', text:'เมื่อลูกค้ากรอกฟอร์ม "สนใจประกาศนี้" ข้อความจะเข้ามาที่นี่' })); return; }
    rows.forEach(l => list.appendChild(leadCard(l, false)));
  }
  showHandled.addEventListener('change', render);
  render();
  return { title:'ลูกค้าที่สนใจ', update(kind){ if (kind === 'leads') render(); } };
}

/* =========================================================================
   ประเภท (meta/types)
========================================================================= */
export function types(root){
  const input = create('input', { id:'typeInput', class:'input', placeholder:'เช่น คอนโด / อาคารพาณิชย์', 'aria-label':'ชื่อประเภทใหม่' });
  const addBtn = create('button', { type:'submit', class:'btn btn-lg' }, [ icon('plus'), 'เพิ่ม' ]);
  const form = create('form', { class:'type-add' }, [ input, addBtn ]);
  const chips = create('div', { class:'type-list' });
  root.append(head('ประเภท', 'ใช้ในฟอร์มประกาศและตัวกรองหน้าเว็บ'),
    create('section', { class:'card', style:{ display:'grid', gap:'18px', maxWidth:'760px' } }, [ form, chips ]));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    addBtn.disabled = true;
    if (await addType(input.value)){ input.value = ''; await refresh(); }
    addBtn.disabled = false;
  });
  async function refresh(){ admin.types = await loadTypes(); emit('types'); }
  function render(){
    chips.textContent = '';
    admin.types.forEach(t => {
      const n = admin.items.filter(x => x.type === t).length;
      chips.appendChild(create('div', { class:'type-row' }, [
        create('span', { class:'icon-btn soft', 'aria-hidden':'true' }, icon('tag')),
        create('b', { text:t }), create('span', { class:'label', text:`${n} ประกาศ` }),
        create('button', { type:'button', class:'icon-btn sm soft', 'aria-label':`ลบประเภท ${t}`, onclick: async () => { if (await removeType(t)) await refresh(); } }, icon('trash','ic-sm'))
      ]));
    });
    if (!admin.types.length) chips.appendChild(create('p', { class:'label', text:'ยังไม่มีประเภท' }));
  }
  render();
  return { title:'ประเภท', update(kind){ if (kind === 'types' || kind === 'settings' || kind === 'items') render(); } };
}

/* =========================================================================
   ตั้งค่า (meta/site) — ปุ่มบันทึก sticky
========================================================================= */
export function settings(root){
  const s = admin.settings || {};
  const F = {};
  const field = (key, label, attrs = {}, help) => {
    const id = 's_' + key;
    const el = attrs.textarea ? create('textarea', { id, class:'input', rows:'3' }) : create('input', { id, class:'input', ...attrs });
    fillOne(key, el, s);
    el.addEventListener('input', () => setDirty(true));
    F[key] = el;
    return create('div', { class:'field' + (attrs.full ? ' full' : '') }, [ create('label', { for:id, text:label }), el, help ? create('small', { text:help }) : null ]);
  };
  function fillOne(key, el, src){ el.value = key === 'pinDefaultDays' ? ((src.pinDefaultDays != null) ? src.pinDefaultDays : 14) : (src[key] || ''); }
  const saveBtn = create('button', { type:'button', class:'btn btn-lg' }, [ icon('save'), 'บันทึกการตั้งค่า' ]);
  const state = create('span', { class:'label', text:'ยังไม่มีการเปลี่ยนแปลง' });
  let dirty = false;
  function setDirty(v){ dirty = v; state.textContent = v ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก' : 'บันทึกแล้ว'; saveBtn.classList.toggle('pulse', v); }
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const ok = await saveSiteSettings({
      phone: F.phone.value, lineId: F.lineId.value, lineUrl: F.lineUrl.value, facebookPage: F.facebookPage.value,
      messengerUrl: F.messengerUrl.value, aboutText: F.aboutText.value, pinDefaultDays: F.pinDefaultDays.value
    });
    saveBtn.disabled = false;
    if (ok){ admin.settings = { ...admin.settings, ...{ phone:F.phone.value.trim(), lineId:F.lineId.value.trim(), lineUrl:F.lineUrl.value.trim(), facebookPage:F.facebookPage.value.trim(), messengerUrl:F.messengerUrl.value.trim(), aboutText:F.aboutText.value.trim(), pinDefaultDays: Math.max(0, parseInt(F.pinDefaultDays.value||'14', 10) || 0) } }; setDirty(false); }
  });
  const user = admin.user || {};
  root.append(
    head('ตั้งค่า', 'ข้อมูลติดต่อและค่าทั่วไปของเว็บ'),
    create('div', { class:'settings-grid' }, [
      create('section', { class:'card', 'aria-labelledby':'s1' }, [ create('h2', { id:'s1', class:'card-title', text:'ช่องทางติดต่อ' }),
        create('div', { class:'fgrid two', style:{ marginTop:'16px' } }, [
          field('phone', 'เบอร์โทร', { placeholder:'0812345678', inputmode:'tel', autocomplete:'off' }),
          field('lineId', 'LINE ID', { placeholder:'@krulaila' }),
          field('lineUrl', 'LINE Add Link', { placeholder:'https://line.me/ti/p/~...', type:'url', full:true }),
          field('facebookPage', 'Facebook Page หลัก', { placeholder:'https://www.facebook.com/your-page', type:'url', full:true }),
          field('messengerUrl', 'Messenger Link', { placeholder:'https://m.me/your-page', type:'url', full:true })
        ]) ]),
      create('section', { class:'card', 'aria-labelledby':'s2' }, [ create('h2', { id:'s2', class:'card-title', text:'หน้าเว็บ' }),
        create('div', { class:'fgrid', style:{ marginTop:'16px' } }, [
          field('aboutText', 'ข้อความ "เกี่ยวกับเรา" (สั้น ๆ — แสดงใต้หัวข้อหน้าแรกและหน้าติดต่อ)', { textarea:true }),
          field('pinDefaultDays', 'ปักหมุดอัตโนมัติ (วัน)', { type:'number', min:'0', placeholder:'14', inputmode:'numeric' }, 'เมื่อปักหมุดประกาศ จะหมดเวลาเองหลังกี่วัน · ใส่ 0 = ไม่จำกัด')
        ]) ]),
      create('section', { class:'card', 'aria-labelledby':'s3' }, [ create('h2', { id:'s3', class:'card-title', text:'บัญชีแอดมิน' }),
        create('div', { class:'inner', style:{ marginTop:'16px', display:'grid', gap:'6px' } }, [
          create('div', {}, [ create('span', { class:'label', text:'อีเมล ' }), create('b', { text: user.email || '-' }) ]),
          create('div', { class:'uid' }, [ create('span', { class:'label', text:'UID ' }), create('code', { text: user.uid || '-' }) ]),
          create('button', { type:'button', class:'btn btn-white btn-sm', style:{ justifySelf:'start', marginTop:'6px' }, onclick: () => copyText(user.uid || '', 'คัดลอก UID แล้ว') }, [ icon('copy','ic-sm'), 'คัดลอก UID' ])
        ]),
        create('p', { class:'label fine', style:{ marginTop:'10px' } }, 'ใช้ UID นี้สร้างเอกสาร admins/{UID} ใน Firestore เพื่อให้สิทธิ์แก้ไข (ดู README หัวข้อ "ความปลอดภัย: จำกัดสิทธิ์แอดมิน")') ]),
      create('section', { class:'card', 'aria-labelledby':'s4' }, [ create('h2', { id:'s4', class:'card-title', text:'ข้อมูลสำรอง & นำเข้ารูปจาก Facebook' }),
        create('div', { class:'btn-row', style:{ marginTop:'16px' } }, [
          create('button', { type:'button', class:'btn btn-soft', onclick: exportListings }, [ icon('download'), 'ส่งออก JSON' ]),
          create('a', { class:'btn btn-soft', href:'#/listings' }, [ icon('upload'), 'นำเข้า JSON' ])
        ]),
        create('p', { class:'label fine', style:{ marginTop:'14px' } },
          'นำเข้ารูปจาก Facebook: ในฟอร์มประกาศ ขั้น "รูปภาพ" แท็บ "นำเข้า" วาง URL โพสต์สาธารณะ (facebook.com/share/p/…, /posts/…, /photo/?fbid=…) ระบบดึงรูปและ caption จาก meta tag แล้วเซฟลง Google Drive ทันที — ไม่ต้องใช้ Token · ใช้ได้เฉพาะโพสต์สาธารณะ')
      ])
    ]),
    create('div', { class:'savebar', role:'region', 'aria-label':'บันทึกการตั้งค่า' }, [ state, saveBtn ])
  );
  const onBefore = (e) => { if (dirty){ e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onBefore);
  return { title:'ตั้งค่า', update(kind){ if (kind === 'settings' && !dirty) Object.entries(F).forEach(([k, el]) => fillOne(k, el, admin.settings || {})); }, destroy(){ window.removeEventListener('beforeunload', onBefore); } };
}

/* ============================================================================
   admin/editor.js — drawer ด้านขวา: เพิ่ม/แก้ไขประกาศ แบ่งขั้น
   ข้อมูล → รายละเอียด → ตำแหน่ง → รูปภาพ  (+ ตัวอย่างการ์ดสด)
   logic บันทึก/อัปโหลด/นำเข้ารูป/ลบ คัดลอกจาก initAdmin() เดิม:
   - เพิ่มใหม่: อัปโหลดรูปจากเครื่อง "ก่อน" สร้างประกาศ · imageObjs ≤ 30 · pinPayload_ fresh pin
   - แก้ไข: update → ถ้ามีไฟล์ใหม่ อัปโหลดแล้ว merge กับ imageObjs ล่าสุด
   - รูปเดิม: เรียง/ตั้งปก/ลบ บันทึกทันที (freshImgs_/persistImgs_) · นำเข้า URL/FB ผูก Firestore ทันที
   v3.1 อัปโหลดรูป: ทีละไฟล์ + progress + ลองใหม่เฉพาะที่พลาด · ถ่ายรูป/วางรูป/ลายน้ำ · ตัวนับ n/30
        · ปิดโดยไม่บันทึก = ลบไฟล์ที่ค้างใน Drive · อัปโหลดก่อนบันทึกข้อความ (พลาดแล้วไม่เกิดข้อมูลครึ่งทาง)
============================================================================ */
import { create, toast, confirmDialog, safeUrl, debounce } from '../core/dom.js';
import { num } from '../core/format.js';
import { db, rulesHint, loadTypes } from '../data/firebase.js';
import { normalizeDriveImageURL, uploadFiles, deleteDriveFiles, importViaUrls, importViaPostUrl, driveIdFromURL, MAX_IMAGES, getWatermarkPref, setWatermarkPref } from '../data/images.js';
import { resolveGmapToCoords } from '../data/geo.js';
import { pinPayload_ } from '../data/listings.js';
import { icon } from '../ui/icons.js';
import { listingCard } from '../ui/components.js';
import { openLayer } from '../ui/overlay.js';
import { hasLeaflet, buildMapLayers, newMap, approxCircle } from '../ui/map.js';
import { admin, emit } from './store.js';
import { clearDisp_, applyJitter_, validCoords_, approxFields_ } from './geo-form.js';
import { currentImgArr_, freshImgs_, moveImg_, reorderImg_, delImg_, releaseDriveFiles_ } from './ops.js';

const STEPS = [ ['info', 'ข้อมูล'], ['details', 'รายละเอียด'], ['location', 'ตำแหน่ง'], ['images', 'รูปภาพ'] ];
const UNITS = ['', 'ราคาต่อห้อง', 'ราคาต่อหลัง', 'ราคาต่อแปลง', 'ราคาต่อไร่', 'ราคาต่อตารางวา', 'ราคายกแปลง', 'ราคาต่อเดือน'];
let openState = null;

export function openEditor(it){
  if (openState){ openState.layer.close(); if (openState) return; }
  const isEdit = !!it;
  const E = {};     // form elements
  let step = 0, dirty = false, busy = false;
  let saved = false;                      // บันทึกสำเร็จแล้ว → ไฟล์ที่อัปโหลดไว้ถูกใช้จริง (ห้ามลบตอนปิด)
  const importedPosts = new Set(), importedUrls = new Set();   // กันนำเข้าซ้ำในรอบเดียว
  let map = null, mapMarker = null, mapCircle = null;
  // เพิ่มใหม่: รายการรูปที่รออัปโหลด/นำเข้าแล้ว เรียงได้ — { kind:'file', file, url } | { kind:'imp', obj }
  let pending = [];
  // แก้ไข: ไฟล์ใหม่ที่จะอัปโหลดตอนกดอัปเดต
  let editNewFiles = [];
  let editImgs = isEdit ? currentImgArr_(it) : [];

  /* ── helpers สร้างช่อง ── */
  let uid = 0;
  const fid = (k) => 'd_' + k + '_' + (++uid);
  function input(key, label, attrs = {}, help){
    const id = fid(key);
    const el = attrs.tag === 'select'
      ? create('select', { id, class:'input' }, (attrs.options || []).map(([v, l]) => create('option', { value:v, text:l })))
      : attrs.tag === 'textarea' ? create('textarea', { id, class:'input', rows: attrs.rows || '6', maxlength: attrs.maxlength || null })
      : create('input', { id, class:'input', type: attrs.type || 'text', min: attrs.min || null, step: attrs.step || null, maxlength: attrs.maxlength || null,
          placeholder: attrs.placeholder || null, inputmode: attrs.inputmode || null, required: attrs.required ? '' : null, autocomplete:'off' });
    E[key] = el;
    return create('div', { class:'field' + (attrs.full ? ' full' : '') }, [ create('label', { for:id, text:label }), el, help ? create('small', { text:help }) : null ]);
  }
  function segField(key, label, options){
    const hidden = create('input', { type:'hidden' });
    E[key] = hidden;
    const seg = create('div', { class:'seg soft wide', role:'radiogroup', 'aria-label':label }, options.map(([v, l]) =>
      create('button', { type:'button', role:'radio', dataset:{ v }, text:l, onclick: () => { setSeg(v); markDirty(); } })));
    function setSeg(v){ hidden.value = v; seg.querySelectorAll('button').forEach(b => { b.setAttribute('aria-checked', String(b.dataset.v === v)); b.setAttribute('aria-pressed', String(b.dataset.v === v)); }); }
    hidden._set = setSeg;
    return create('div', { class:'field' }, [ create('span', { class:'flabel', text:label }), seg, hidden ]);
  }
  function switchField(key, label){
    const id = fid(key);
    const el = create('input', { id, type:'checkbox' });
    E[key] = el;
    return create('label', { class:'switch', for:id }, [ el, create('span', { class:'track-sw', 'aria-hidden':'true' }), create('span', { text:label }) ]);
  }

  /* ── panels ── */
  const pInfo = create('div', { class:'fgrid two' }, [
    input('title', 'หัวข้อ *', { maxlength:'120', required:true, full:true, placeholder:'เช่น บ้านเดี่ยว 2 ชั้น ใกล้ตัวเมือง' }),
    input('type', 'ประเภท', { tag:'select', options:[] }),
    segField('listingMode', 'การประกาศ', [['sale', 'ขาย'], ['rent', 'เช่า']]),
    input('status', 'สถานะ', { tag:'select', options:[['available','เปิดขาย'],['reserved','จองแล้ว'],['sold','ขายแล้ว'],['draft','ฉบับร่าง (ซ่อนจากเว็บ)']] }),
    create('div', { class:'field' }, [ create('span', { class:'flabel', text:'ปักหมุด' }), switchField('pinned', 'แสดงบนสุด / ประกาศแนะนำ') ]),
    input('price', 'ราคา (บาท)', { type:'number', min:'0', inputmode:'numeric' }),
    input('priceUnit', 'หน่วยราคา', { tag:'select', options: UNITS.map(u => [u, u || '— ไม่ระบุ —']) })
  ]);
  const pDetails = create('div', { class:'fgrid two' }, [
    input('bedrooms', 'ห้องนอน', { type:'number', min:'0', inputmode:'numeric' }),
    input('bathrooms', 'ห้องน้ำ', { type:'number', min:'0', inputmode:'numeric' }),
    input('usableArea', 'พื้นที่ใช้สอย (ตร.ม.)', { type:'number', min:'0', step:'0.01', inputmode:'decimal' }),
    input('landSize', 'ขนาดที่ดิน (ตร.วา)', { type:'number', min:'0', step:'0.01', inputmode:'decimal' }),
    input('parking', 'ที่จอดรถ', { type:'number', min:'0', inputmode:'numeric' }),
    input('desc', 'คำอธิบาย', { tag:'textarea', maxlength:'4000', full:true, rows:'8' }),
    input('fbUrl', 'ลิงก์โพสต์ Facebook', { type:'url', full:true, placeholder:'https://www.facebook.com/...' })
  ]);
  const approxOut = create('div', { class:'approx-out', 'aria-live':'polite' });
  const radiusSel = create('select', { class:'input', 'aria-label':'รัศมี' }, [['200','รัศมี 200 ม.'],['300','รัศมี 300 ม.'],['500','รัศมี 500 ม.'],['1000','รัศมี 1 กม.']].map(([v,l]) => create('option', { value:v, text:l })));
  radiusSel.value = '300';
  E.approxRadius = radiusSel;
  const approxBtn = create('button', { type:'button', class:'btn btn-soft' }, [ icon('shuffle'), 'สุ่มจุดในรัศมี' ]);
  const mapBox = create('div', { class:'pick-map', 'aria-label':'แผนที่ — คลิกเพื่อตั้งพิกัด' });
  const pLocation = create('div', { class:'fgrid two' }, [
    input('gmap', 'ลิงก์ Google Maps', { full:true, placeholder:'https://maps.google.com/... หรือ maps.app.goo.gl/...' }, 'วางลิงก์ → ระบบดึงพิกัดอัตโนมัติ (รองรับลิงก์ย่อ)'),
    input('lat', 'ละติจูด', { type:'number', step:'0.000001', inputmode:'decimal' }),
    input('lng', 'ลองจิจูด', { type:'number', step:'0.000001', inputmode:'decimal' }),
    create('div', { class:'full' }, [ mapBox, create('small', { class:'help', text:'คลิกบนแผนที่เพื่อวางหมุดพิกัดจริง' }) ]),
    create('div', { class:'inner full', style:{ display:'grid', gap:'10px' } }, [
      switchField('approxLoc', 'ระบุตำแหน่งแบบไม่ชัด (แสดงเป็นรัศมีบนแผนที่)'),
      create('div', { class:'approx-row' }, [ radiusSel, approxBtn ]),
      approxOut,
      create('small', { class:'help', text:'พิกัดจริง (ละติจูด/ลองจิจูด) จะถูกเก็บไว้ไม่เปลี่ยน — ปุ่มนี้สร้าง "จุดแสดงผล" สุ่มในรัศมี ให้หน้าเว็บโชว์เป็นวงกลมแทนหมุดจริง' })
    ])
  ]);

  /* images panel */
  const imgGrid = create('div', { class:'img-grid', role:'list', 'aria-label':'รูปภาพ (ลากเพื่อเรียง รูปแรกคือปก)' });
  const fileInput = create('input', { type:'file', accept:'image/*', multiple:'', class:'sr-only', id: fid('files') });
  const camInput = create('input', { type:'file', accept:'image/*', capture:'environment', class:'sr-only', id: fid('cam'), tabindex:'-1' });
  const dropZone = create('label', { class:'dropzone', for: fileInput.id }, [ icon('upload','ic-lg'), create('b', { text:'เลือกรูปจากเครื่อง' }), create('span', { class:'label', text:'คลิกเพื่อเลือกหลายรูป · ลากไฟล์มาวาง · หรือวางรูปจากคลิปบอร์ด (Ctrl+V) · ย่อขนาดอัตโนมัติ' }) ]);
  const camBtn = create('button', { type:'button', class:'btn btn-soft', hidden: window.matchMedia('(pointer:coarse)').matches ? null : '' }, [ icon('camera','ic-sm'), 'ถ่ายรูปด้วยกล้อง' ]);
  const wmPref = getWatermarkPref();
  const wmOn = create('input', { type:'checkbox', id: fid('wm') });
  const wmText = create('input', { class:'input', maxlength:'40', placeholder:'ข้อความลายน้ำ เช่น ครูไลลา 08x-xxx-xxxx', 'aria-label':'ข้อความลายน้ำ', autocomplete:'off' });
  wmOn.checked = wmPref.on; wmText.value = wmPref.text;
  const saveWm = () => setWatermarkPref({ on: wmOn.checked, text: wmText.value });
  wmOn.addEventListener('change', saveWm); wmText.addEventListener('input', saveWm);
  const wmRow = create('div', { class:'inner wm-row' }, [
    create('label', { class:'switch', for: wmOn.id }, [ wmOn, create('span', { class:'track-sw', 'aria-hidden':'true' }), create('span', { text:'ใส่ลายน้ำบนรูปที่อัปโหลดจากเครื่อง' }) ]),
    wmText,
    create('small', { class:'help', text:'จำค่านี้ไว้ในเครื่องนี้ · ใช้กับรูปที่เลือก/ถ่าย/วางเท่านั้น (รูปนำเข้าจาก URL/FB ไม่ใส่) · รูปที่อัปโหลดไปแล้วเปลี่ยนไม่ได้' })
  ]);
  const imgCount = create('span', { class:'label img-count', 'aria-live':'polite' });
  const upBar = create('span');
  const upText = create('span', { class:'label' });
  const upProg = create('div', { class:'up-prog', hidden:'', role:'status' }, [ create('div', { class:'up-bar' }, upBar), upText ]);
  const importUrls = create('textarea', { class:'input', rows:'3', placeholder:'วาง URL รูป 1 บรรทัด/อัน (รองรับ Facebook CDN, Instagram, อื่น ๆ)', 'aria-label':'URL รูป' });
  const importUrlsBtn = create('button', { type:'button', class:'btn btn-soft' }, [ icon('download'), 'นำเข้าจาก URL' ]);
  const importPost = create('input', { class:'input', placeholder:'URL โพสต์ Facebook เช่น https://www.facebook.com/share/p/XXX/', 'aria-label':'URL โพสต์ Facebook' });
  const importPostBtn = create('button', { type:'button', class:'btn btn-soft' }, [ icon('facebook'), 'ดึงจากโพสต์ FB' ]);
  const tabUpload = create('div', { class:'tabpanel', role:'tabpanel' }, [ dropZone, fileInput, camInput, camBtn, wmRow ]);
  const tabImport = create('div', { class:'tabpanel', role:'tabpanel', hidden:'' }, [
    create('div', { class:'field' }, [ importUrls, importUrlsBtn ]),
    create('div', { class:'field' }, [ importPost, importPostBtn ]),
    create('small', { class:'help', text:'รูปที่นำเข้าจะถูก re-host ใน Google Drive ของคุณทันที (ไม่ผูกกับ Facebook CDN ที่อาจหมดอายุ) · รองรับเฉพาะโพสต์สาธารณะ' + (isEdit ? ' · รูปจะถูกเพิ่มเข้าประกาศนี้ทันทีเมื่อกด' : '') })
  ]);
  const tabs = create('div', { class:'seg soft', role:'tablist', 'aria-label':'วิธีเพิ่มรูป' }, [['up','อัปโหลด', tabUpload], ['imp','นำเข้า URL / FB', tabImport]].map(([k, l, panel], i) =>
    create('button', { type:'button', role:'tab', 'aria-selected': String(i === 0), 'aria-pressed': String(i === 0), text:l, onclick: (e) => {
      tabs.querySelectorAll('button').forEach(b => { b.setAttribute('aria-selected', 'false'); b.setAttribute('aria-pressed', 'false'); });
      e.currentTarget.setAttribute('aria-selected', 'true'); e.currentTarget.setAttribute('aria-pressed', 'true');
      tabUpload.hidden = k !== 'up'; tabImport.hidden = k !== 'imp';
    } })));
  const pImages = create('div', { class:'fgrid' }, [
    create('div', { class:'field' }, [ create('div', { class:'flabel-row' }, [ create('span', { class:'flabel', text:'รูปในประกาศ — ลากเพื่อเรียง · รูปแรกคือรูปปก' }), imgCount ]), imgGrid, upProg ]),
    tabs, tabUpload, tabImport
  ]);
  const panels = [pInfo, pDetails, pLocation, pImages];

  /* ── drawer shell ── */
  const titleId = fid('title');
  const stepNav = create('div', { class:'steps', role:'tablist', 'aria-label':'ขั้นตอน' }, STEPS.map(([k, l], i) =>
    create('button', { type:'button', role:'tab', class:'step', dataset:{ i:String(i) }, onclick: () => go(i) }, [ create('span', { class:'n', text:String(i + 1) }), create('span', { text:l }) ])));
  const preview = create('div', { class:'preview', inert:'', 'aria-hidden':'true' });
  const previewWrap = create('details', { class:'preview-wrap', open: window.matchMedia('(min-width:1280px)').matches ? '' : null }, [ create('summary', {}, [ icon('eye','ic-sm'), 'ตัวอย่างการ์ด' ]), preview ]);
  const body = create('div', { class:'dr-body' }, [ create('div', { class:'dr-form' }, panels.map((p, i) => create('section', { class:'dr-panel', dataset:{ i:String(i) }, 'aria-label': STEPS[i][1] }, p))), previewWrap ]);
  const backBtn = create('button', { type:'button', class:'btn btn-soft', onclick: () => go(step - 1) }, [ icon('chevron-left'), 'ย้อนกลับ' ]);
  const nextBtn = create('button', { type:'button', class:'btn btn-soft', onclick: () => go(step + 1) }, [ 'ถัดไป', icon('chevron-right') ]);
  const saveBtn = create('button', { type:'button', class:'btn' }, [ icon(isEdit ? 'check' : 'plus'), isEdit ? 'อัปเดต' : 'บันทึก (เพิ่มใหม่)' ]);
  const delBtn = isEdit ? create('button', { type:'button', class:'btn btn-danger' }, [ icon('trash'), create('span', { class:'hide-sm', text:'ลบประกาศ' }) ]) : null;
  const foot = create('div', { class:'dr-foot' }, [ delBtn, create('div', { class:'grow' }), backBtn, nextBtn, saveBtn ]);
  const closeBtn = create('button', { type:'button', class:'icon-btn soft', 'aria-label':'ปิด' }, icon('x'));
  const drawer = create('aside', { class:'drawer', role:'dialog', 'aria-modal':'true', 'aria-labelledby':titleId }, [
    create('div', { class:'dr-head' }, [
      create('div', { style:{ minWidth:'0' } }, [ create('div', { class:'label', text: isEdit ? 'แก้ไขประกาศ' : 'ประกาศใหม่' }), create('h2', { id:titleId, class:'dr-title', text: isEdit ? (it.title || 'ประกาศ') : 'เพิ่มประกาศ' }) ]),
      closeBtn
    ]),
    stepNav, body, foot
  ]);
  const scrim = create('div', { class:'scrim' });
  document.body.append(scrim, drawer);
  requestAnimationFrame(() => { scrim.classList.add('in'); drawer.classList.add('in'); });

  const layer = openLayer(drawer, {
    lockScroll: true,
    initialFocus: E.title,
    beforeClose: () => !(dirty && !busy) || confirmDialog('ปิดโดยไม่บันทึกการเปลี่ยนแปลง?'),
    onClose: () => {
      drawer.classList.remove('in'); scrim.classList.remove('in');
      setTimeout(() => { drawer.remove(); scrim.remove(); }, 260);
      if (map) map.remove();
      document.removeEventListener('paste', onPaste);
      // ปิดโดยไม่บันทึก → ไฟล์ที่อัปโหลด/นำเข้าไว้ใน Drive แล้วแต่ไม่มีประกาศใช้ จะกลายเป็นไฟล์กำพร้า → ลงถังขยะ
      if (!saved){
        const orphan = [];
        pending.forEach(p => { if (p.kind === 'imp' && p.obj && p.obj.id) orphan.push(p.obj.id); else if (p.uploaded) orphan.push(p.uploaded.id); });
        editNewFiles.forEach(p => { if (p.uploaded) orphan.push(p.uploaded.id); });
        if (orphan.length) deleteDriveFiles(orphan).catch(e => console.warn('cleanup orphan:', e));
      }
      pending.forEach(p => p.kind === 'file' && URL.revokeObjectURL(p.url));
      editNewFiles.forEach(p => URL.revokeObjectURL(p.url));
      openState = null;
    }
  });
  openState = { layer };
  closeBtn.addEventListener('click', () => layer.close());
  scrim.addEventListener('click', () => layer.close());

  /* ── step navigation ── */
  function go(i){
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    stepNav.querySelectorAll('.step').forEach((b, j) => { b.setAttribute('aria-selected', String(j === step)); b.classList.toggle('done', j < step); });
    body.querySelectorAll('.dr-panel').forEach((p, j) => { p.hidden = j !== step; });
    backBtn.hidden = step === 0;
    nextBtn.hidden = step === STEPS.length - 1;
    if (step === 2) setTimeout(initMap, 30);
    stepNav.querySelectorAll('.step')[step].scrollIntoView({ block:'nearest', inline:'nearest' });
    body.scrollTop = 0;
  }

  /* ── fill form ── */
  loadTypes().then(types => {
    admin.types = types;
    E.type.textContent = '';
    types.forEach(t => E.type.appendChild(create('option', { value:t, text:t })));
    E.type.value = isEdit ? (types.includes(it.type) ? it.type : (types[0] || 'บ้าน')) : (types[0] || 'บ้าน');
    updatePreview();
  });
  if (isEdit){
    E.title.value = it.title || '';
    E.listingMode._set(it.listingMode || 'sale');
    E.status.value = it.status || 'available';
    E.pinned.checked = !!it.pinned;
    E.pinned.dataset.initial = it.pinned ? '1' : '0';   // ไว้เช็คตอนเซฟ ว่าควรตั้ง pinnedUntil ใหม่ไหม
    E.price.value = (it.price==''||it.price==null)?'':it.price;
    E.priceUnit.value = it.priceUnit || '';
    E.bedrooms.value = it.bedrooms ?? '';
    E.bathrooms.value = it.bathrooms ?? '';
    E.usableArea.value = it.usableArea ?? '';
    E.landSize.value = it.landSize ?? '';
    E.parking.value = it.parking ?? '';
    E.desc.value = it.desc || '';
    E.fbUrl.value = it.fbUrl || '';
    E.lat.value = (it.lat==''||it.lat==null)?'':it.lat;
    E.lng.value = (it.lng==''||it.lng==null)?'':it.lng;
    // ตำแหน่งไม่ชัด: ช่อง lat/lng = พิกัดจริง — จุดสุ่มเก็บแยกใน dataset
    E.approxLoc.checked = !!it.approxLocation;
    if (it.dispLat != null && it.dispLng != null){ E.approxLoc.dataset.dispLat = it.dispLat; E.approxLoc.dataset.dispLng = it.dispLng; }
    radiusSel.value = String(it.approxRadius || 300);
    approxOut.textContent = (it.approxLocation && it.dispLat != null) ? `จุดแสดงผล: ${it.dispLat}, ${it.dispLng}` : '';
  } else {
    E.listingMode._set('sale');
    E.status.value = 'available';
  }
  if (!UNITS.includes(E.priceUnit.value) && isEdit && it.priceUnit){ E.priceUnit.appendChild(create('option', { value:it.priceUnit, text:it.priceUnit })); E.priceUnit.value = it.priceUnit; }

  function markDirty(){ dirty = true; updatePreviewD(); }
  drawer.addEventListener('input', (e) => { if (e.target.closest('.dr-form')) markDirty(); });
  drawer.addEventListener('change', (e) => { if (e.target.closest('.dr-form')) markDirty(); });

  /* ── live preview ── */
  function formItem(){
    const firstImg = isEdit ? (editImgs[0] ? normalizeDriveImageURL(editImgs[0].url) : (editNewFiles[0] && editNewFiles[0].url))
      : (pending[0] ? (pending[0].kind === 'file' ? pending[0].url : pending[0].obj.url) : '');
    return {
      id: isEdit ? it.id : '__preview', title: E.title.value.trim() || 'หัวข้อประกาศ', type: E.type.value, listingMode: E.listingMode.value || 'sale',
      status: E.status.value, pinned: E.pinned.checked, price: num(E.price.value), priceUnit: E.priceUnit.value,
      bedrooms: num(E.bedrooms.value), bathrooms: num(E.bathrooms.value), usableArea: num(E.usableArea.value), landSize: num(E.landSize.value),
      views: isEdit ? it.views : 0, createdAt: isEdit ? it.createdAt : Date.now(),
      imageURLs: firstImg ? [firstImg] : []
    };
  }
  function updatePreview(){
    preview.textContent = '';
    const card = listingCard(formItem(), { anim:false, size:640 });
    card.querySelector('.fav')?.remove();
    preview.appendChild(card);
  }
  const updatePreviewD = debounce(updatePreview, 150);

  /* ── location: gmap / jitter / map picker ── */
  E.gmap.addEventListener('change', async () => {
    const v=(E.gmap.value||'').trim(); if(!v) return;
    const g=await resolveGmapToCoords(v);
    if(g){ E.lat.value=g.lat; E.lng.value=g.lng; clearDisp_(E.approxLoc,approxOut); syncMap(true); toast('ดึงพิกัดสำเร็จ','success'); }
    else toast('ดึงพิกัดไม่สำเร็จ — ลองวางพิกัดเอง','warn');
  });
  approxBtn.addEventListener('click', () => { applyJitter_(E.lat, E.lng, radiusSel, E.approxLoc, approxOut); markDirty(); syncMap(); });
  // เปลี่ยนพิกัดจริง หรือ ปิด approx → จุดสุ่มเดิมใช้ไม่ได้แล้ว ล้างทิ้ง
  E.lat.addEventListener('input', () => { clearDisp_(E.approxLoc,approxOut); syncMap(); });
  E.lng.addEventListener('input', () => { clearDisp_(E.approxLoc,approxOut); syncMap(); });
  E.approxLoc.addEventListener('change', () => { if(!E.approxLoc.checked) clearDisp_(E.approxLoc,approxOut); syncMap(); });
  radiusSel.addEventListener('change', () => syncMap());

  function initMap(){
    if (map || !hasLeaflet() || !mapBox.isConnected) { if (map) map.invalidateSize(); return; }
    const layers = buildMapLayers();
    map = newMap(mapBox, { layers:[ layers.default ], zoomPosition:'topright' }).setView([13.736717, 100.523186], 6);
    L.control.layers(layers.base, null, { collapsed:true, position:'topleft' }).addTo(map);
    map.on('click', (e) => {
      E.lat.value = e.latlng.lat.toFixed(6); E.lng.value = e.latlng.lng.toFixed(6);
      clearDisp_(E.approxLoc, approxOut); markDirty(); syncMap();
    });
    syncMap(true);
  }
  function syncMap(fly){
    if (!map) return;
    const la = num(E.lat.value), ln = num(E.lng.value);
    if (mapMarker){ mapMarker.remove(); mapMarker = null; }
    if (mapCircle){ mapCircle.remove(); mapCircle = null; }
    if (la === '' || ln === '' || Math.abs(la) > 90 || Math.abs(ln) > 180) return;
    mapMarker = L.marker([la, ln], { icon: L.divIcon({ className:'pm', html:'<span class="pin-dot"></span>', iconSize:[0,0] }), title:'พิกัดจริง' }).addTo(map);
    if (E.approxLoc.checked){
      const dLat = +E.approxLoc.dataset.dispLat, dLng = +E.approxLoc.dataset.dispLng;
      if (!isNaN(dLat) && !isNaN(dLng)) mapCircle = approxCircle({ lat:dLat, lng:dLng }, { approxRadius: +radiusSel.value }, true).addTo(map);
    }
    if (fly) map.setView([la, ln], 16); else if (!map.getBounds().contains([la, ln])) map.panTo([la, ln]);
  }

  /* ── images ── */
  function imgTile(src, idx, total, { badge, tone, onCover, onLeft, onRight, onDelete, onDrop, label }){
    const tile = create('div', { class:'img-tile' + (tone === 'err' ? ' is-err' : ''), role:'listitem', draggable:'true', dataset:{ idx:String(idx) }, 'aria-label': label || `รูปที่ ${idx + 1}` }, [
      create('img', { src, alt:'', loading:'lazy' }),
      idx === 0 ? create('span', { class:'chip dark cover' }, [ icon('star','ic-sm'), 'ปก' ]) : null,
      badge ? create('span', { class:'chip on-img badge2', text:badge }) : null,
      create('span', { class:'grip', 'aria-hidden':'true' }, icon('grip','ic-sm')),
      create('div', { class:'img-ctrls' }, [
        idx > 0 && onCover ? create('button', { type:'button', class:'icon-btn sm', title:'ตั้งเป็นปก', 'aria-label':'ตั้งเป็นรูปปก', onclick:onCover }, icon('star','ic-sm')) : null,
        idx > 0 && onLeft ? create('button', { type:'button', class:'icon-btn sm', title:'เลื่อนซ้าย', 'aria-label':'เลื่อนไปก่อนหน้า', onclick:onLeft }, icon('chevron-left','ic-sm')) : null,
        idx < total - 1 && onRight ? create('button', { type:'button', class:'icon-btn sm', title:'เลื่อนขวา', 'aria-label':'เลื่อนไปถัดไป', onclick:onRight }, icon('chevron-right','ic-sm')) : null,
        create('button', { type:'button', class:'icon-btn sm del', title:'ลบรูป', 'aria-label':'ลบรูป', onclick:onDelete }, icon('trash','ic-sm'))
      ])
    ]);
    tile.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-idx', String(idx)); e.dataTransfer.effectAllowed = 'move'; tile.classList.add('dragging'); });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
    tile.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-idx')){ e.preventDefault(); tile.classList.add('over'); } });
    tile.addEventListener('dragleave', () => tile.classList.remove('over'));
    tile.addEventListener('drop', (e) => {
      tile.classList.remove('over');
      const from = +e.dataTransfer.getData('text/x-idx');
      if (!isNaN(from) && from !== idx){ e.preventDefault(); onDrop(from, idx); }
    });
    return tile;
  }
  const totalCount = () => isEdit ? editImgs.length + editNewFiles.length : pending.length;
  const STATE_BADGE = { busy:'กำลังอัปโหลด…', done:'อัปโหลดแล้ว', fail:'ล้มเหลว' };
  const fileBadge = (p) => STATE_BADGE[p.state] || 'รออัปโหลด';
  let rafId = 0;
  const scheduleRender = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; renderImages(); }); };
  /** รูปที่อัปโหลดขึ้น Drive แล้วแต่ยังไม่บันทึกประกาศ — ถ้าผู้ใช้ลบรูปนั้นออก ต้องลบไฟล์ใน Drive ด้วย */
  function dropEntryFile(p){
    if (p.uploaded && p.uploaded.id) deleteDriveFiles([p.uploaded.id]).catch(e => console.warn('drive delete:', e));
    URL.revokeObjectURL(p.url);
  }
  function renderImages(){
    imgGrid.textContent = '';
    if (isEdit){
      const total = editImgs.length;
      const redraw = (arr) => { editImgs = arr; renderImages(); updatePreview(); };
      editImgs.forEach((o, idx) => imgGrid.appendChild(imgTile(normalizeDriveImageURL(o.url), idx, total + editNewFiles.length, {
        onCover: () => moveImg_({ id: it.id }, o, 'cover', redraw),
        onLeft:  () => moveImg_({ id: it.id }, o, 'left', redraw),
        onRight: idx < total - 1 ? () => moveImg_({ id: it.id }, o, 'right', redraw) : null,
        onDelete:() => delImg_({ id: it.id }, o, redraw),
        onDrop: (from, to) => { if (from < total && to < total) reorderImg_({ id: it.id }, editImgs[from], to, redraw); }
      })));
      editNewFiles.forEach((p, j) => imgGrid.appendChild(imgTile(p.url, total + j, total + editNewFiles.length, {
        badge: fileBadge(p), tone: p.state === 'fail' ? 'err' : '', label: p.error ? ('อัปโหลดไม่สำเร็จ: ' + p.error) : 'รูปใหม่ รออัปโหลดเมื่อกดอัปเดต',
        onDelete: () => { dropEntryFile(p); editNewFiles.splice(editNewFiles.indexOf(p), 1); renderImages(); },
        onDrop: () => {}
      })));
    } else {
      const move = (from, to) => { const [x] = pending.splice(from, 1); pending.splice(to, 0, x); renderImages(); markDirty(); };
      pending.forEach((p, idx) => imgGrid.appendChild(imgTile(p.kind === 'file' ? p.url : p.obj.url, idx, pending.length, {
        badge: p.kind === 'imp' ? 'นำเข้าแล้ว' : fileBadge(p), tone: p.state === 'fail' ? 'err' : '',
        label: p.error ? ('อัปโหลดไม่สำเร็จ: ' + p.error) : null,
        onCover: () => move(idx, 0),
        onLeft:  () => move(idx, idx - 1),
        onRight: () => move(idx, idx + 1),
        onDelete: async () => {
          if (p.kind === 'imp'){ try{ if (p.obj.id) await deleteDriveFiles([p.obj.id]); }catch(e){ console.warn(e); } }
          else dropEntryFile(p);
          pending.splice(pending.indexOf(p), 1); renderImages(); markDirty();
        },
        onDrop: move
      })));
    }
    if (!imgGrid.childNodes.length) imgGrid.appendChild(create('div', { class:'img-empty label' }, [ icon('images','ic-lg'), 'ยังไม่มีรูป — เพิ่มจากด้านล่าง' ]));
    const nImg = totalCount();
    stepNav.querySelector('[data-i="3"] span:last-child').textContent = nImg ? `รูปภาพ (${nImg})` : 'รูปภาพ';
    imgCount.textContent = `${nImg}/${MAX_IMAGES} รูป`;
    imgCount.classList.toggle('full', nImg >= MAX_IMAGES);
    const full = nImg >= MAX_IMAGES;
    fileInput.disabled = camInput.disabled = full;
    dropZone.classList.toggle('disabled', full);
  }
  const fileKey = (f) => [f.name, f.size, f.lastModified].join('|');
  const looksImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name || '');
  function addFiles(files){
    const all = Array.from(files || []).filter(looksImage);
    if (!all.length) return toast('ไม่พบไฟล์รูปภาพ','warn');
    const have = new Set((isEdit ? editNewFiles : pending.filter(p => p.kind === 'file')).map(p => fileKey(p.file)));
    const list = all.filter(f => { const k = fileKey(f); if (have.has(k)) return false; have.add(k); return true; });
    if (list.length < all.length) toast(`ข้าม ${all.length - list.length} รูปที่เลือกไว้แล้ว`,'warn');
    const room = Math.max(0, MAX_IMAGES - totalCount());
    if (!room) return toast(`ครบ ${MAX_IMAGES} รูปแล้ว — ลบรูปเก่าก่อนเพิ่ม`,'warn');
    if (list.length > room) toast(`เพิ่มได้อีก ${room} รูป (สูงสุด ${MAX_IMAGES}) — ตัดส่วนที่เกินออก`,'warn');
    list.slice(0, room).forEach(file => {
      const entry = { kind:'file', file, url: URL.createObjectURL(file), state:'', error:'', uploaded:null };
      (isEdit ? editNewFiles : pending).push(entry);
    });
    renderImages(); markDirty();
  }
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  camInput.addEventListener('change', () => { addFiles(camInput.files); camInput.value = ''; });
  camBtn.addEventListener('click', () => camInput.click());
  dropZone.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')){ e.preventDefault(); dropZone.classList.add('over'); } });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('over'); addFiles(e.dataTransfer.files); });
  /* วางรูปจากคลิปบอร์ด (Ctrl+V) — ใช้ได้ทุกขั้น: พาไปขั้นรูปภาพให้เอง */
  function onPaste(e){
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => /^image\//.test(f.type));
    if (!files.length) return;   // วางข้อความตามปกติ
    e.preventDefault();
    if (step !== 3) go(3);
    addFiles(files);
  }
  document.addEventListener('paste', onPaste);

  /* ── progress + อัปโหลดทีละไฟล์ ── */
  function showProg(done, total, msg){
    upProg.hidden = false;
    upBar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    upText.textContent = msg || `กำลังอัปโหลด ${done}/${total} รูป…`;
  }
  /**
   * อัปโหลด entries ที่ยังไม่เคยสำเร็จ (ที่สำเร็จแล้วถูกข้าม → "ลองใหม่เฉพาะที่ล้มเหลว")
   * คืน items ตามลำดับ entries · ถ้ามีรูปพลาด: ไม่บันทึกอะไร + พาไปดูรูปที่พลาด
   */
  async function uploadEntries(entries){
    const wm = (wmOn.checked ? wmText.value : '').trim();
    const todo = entries.filter(e => !e.uploaded).length;
    showProg(entries.length - todo, entries.length);
    const r = await uploadFiles(entries, {
      watermark: wm, concurrency: 2,
      onState: (e, st) => { e.state = st; scheduleRender(); },
      onProgress: (d, t) => showProg(d, t)
    });
    r.warnings.forEach(w => toast(w, 'warn', 8000));
    if (r.failed.length){
      showProg(entries.length - r.failed.length, entries.length, `อัปโหลดไม่สำเร็จ ${r.failed.length} รูป — กดบันทึกอีกครั้งเพื่อลองใหม่เฉพาะรูปที่พลาด`);
      go(3);
      const err = new Error(`อัปโหลดไม่สำเร็จ ${r.failed.length} จาก ${entries.length} รูป: ${r.failed[0].error}`);
      err.long = true; throw err;
    }
    upProg.hidden = true;
    return r.items;
  }

  /* นำเข้าเกินเพดาน 30 รูป → เก็บเท่าที่ใส่ได้ ส่วนเกินลบจาก Drive ทันที (กันไฟล์ค้าง) */
  async function fitItems(items, existing){
    const room = Math.max(0, MAX_IMAGES - existing);
    if (items.length <= room) return items;
    const extra = items.slice(room).map(o => o.id).filter(Boolean);
    if (extra.length){ try{ await deleteDriveFiles(extra); }catch(e){ console.warn(e); } }
    toast(`ใส่ได้อีก ${room} รูป (สูงสุด ${MAX_IMAGES}) — ส่วนที่เกินลบจาก Drive แล้ว`,'warn',6000);
    return items.slice(0, room);
  }

  /* Import images in EDIT form: ผูก Firestore ทันที (เดิม: pushImportedToEdit) */
  async function pushImportedToEdit(items, opts){
    opts = opts || {};
    const id = it.id;
    if (!id || !items || !items.length) return;
    const ref = db.collection('listings').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('ไม่พบประกาศนี้');
    const before = snap.data() || {};
    const cur = currentImgArr_(before);     // รองรับประกาศเก่าที่เก็บเป็น imageURLs (กันรูปเดิมหายเมื่อเพิ่มรูปแรกเป็น imageObjs)
    items = await fitItems(items, cur.length);
    if (!items.length) return;
    const patch = { imageObjs: cur.concat(items), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (opts.caption && !((E.desc?.value||'').trim())){
      patch.desc = opts.caption;
      E.desc.value = opts.caption;
    }
    if (opts.fbUrl && !((E.fbUrl?.value||'').trim())){
      patch.fbUrl = safeUrl(opts.fbUrl);
      E.fbUrl.value = opts.fbUrl;
    }
    await ref.update(patch);
    editImgs = await freshImgs_({ id });   // วาดรายการรูปใหม่ทั้งหมด
    renderImages(); updatePreview();
  }

  importUrlsBtn.addEventListener('click', async () => {
    const text = (importUrls.value||'').trim();
    if (!text) return toast('วาง URL ก่อน','warn');
    let urls = Array.from(new Set(text.split(/\s+/).filter(u => /^https?:\/\//i.test(u))));
    if (!urls.length) return toast('ไม่พบ URL ที่ถูกต้อง','warn');
    const fresh = urls.filter(u => !importedUrls.has(u));
    if (fresh.length < urls.length) toast(`ข้าม ${urls.length - fresh.length} URL ที่นำเข้าไปแล้ว`,'warn');
    urls = fresh;
    if (!urls.length) return;
    const room = MAX_IMAGES - totalCount();
    if (room <= 0) return toast(`ครบ ${MAX_IMAGES} รูปแล้ว — ลบรูปเก่าก่อนเพิ่ม`,'warn');
    importUrlsBtn.disabled = true; busy = true;
    try{
      toast('กำลังดึงรูปและเซฟลง Drive…');
      const r = await importViaUrls(urls);
      urls.forEach(u => importedUrls.add(u));
      (r.warnings || []).forEach(w => toast(w, 'warn', 8000));
      if (isEdit) await pushImportedToEdit(r.items||[]);
      else {
        const items = await fitItems(r.items||[], pending.length);
        items.forEach(obj => pending.push({ kind:'imp', obj })); renderImages(); markDirty();
      }
      importUrls.value = '';
      const okN = (r.items||[]).length;
      const errN = (r.errors||[]).length;
      if (errN){
        console.warn('Import errors:', r.errors);
        // เอา error แรกมาแสดงใน toast เพื่อให้รู้สาเหตุ
        const firstErr = r.errors[0].error || 'unknown';
        toast(`สำเร็จ ${okN} · ล้มเหลว ${errN} — ${firstErr}`,'warn',6000);
      } else {
        toast(`นำเข้า ${okN} รูปแล้ว`,'success');
      }
    }catch(err){
      toast('นำเข้าล้มเหลว: '+err.message,'error',5000);
    }finally{ importUrlsBtn.disabled = false; busy = false; }
  });

  importPostBtn.addEventListener('click', async () => {
    const postUrl = (importPost.value||'').trim();
    if (!postUrl) return toast('วาง URL โพสต์ก่อน','warn');
    if (MAX_IMAGES - totalCount() <= 0) return toast(`ครบ ${MAX_IMAGES} รูปแล้ว — ลบรูปเก่าก่อนเพิ่ม`,'warn');
    const sameAsListing = isEdit && editImgs.length && (E.fbUrl?.value || '').trim() === postUrl;
    if ((importedPosts.has(postUrl) || sameAsListing) && !confirmDialog('นำเข้ารูปจากโพสต์นี้ไปแล้ว — นำเข้าซ้ำจะได้รูปซ้ำ ต้องการนำเข้าอีกครั้งหรือไม่?')) return;
    importPostBtn.disabled = true; busy = true;
    try{
      toast('กำลังดึงรูปจากโพสต์…');
      const r = await importViaPostUrl(postUrl);
      importedPosts.add(postUrl);
      (r.warnings || []).forEach(w => toast(w, 'warn', 8000));
      if (isEdit) await pushImportedToEdit(r.items||[], { caption: r.message || '', fbUrl: postUrl });
      else {
        const items = await fitItems(r.items||[], pending.length);
        items.forEach(obj => pending.push({ kind:'imp', obj }));
        renderImages();
        // เติม caption + ลิงก์โพสต์ FB ถ้าช่องยังว่าง
        if (r.message && !((E.desc?.value||'').trim())) E.desc.value = r.message;
        if (postUrl && !((E.fbUrl?.value||'').trim())) E.fbUrl.value = postUrl;
        markDirty();
      }
      importPost.value = '';
      toast(`นำเข้า ${r.items.length} รูปจากโพสต์`,'success');
    }catch(err){
      toast('ดึงโพสต์ล้มเหลว: '+err.message,'error',5000);
    }finally{ importPostBtn.disabled = false; busy = false; }
  });

  /* ── save ── */
  function guard(){
    if (!(E.title.value||'').trim()){ go(0); E.title.focus(); toast(isEdit ? 'หัวข้อห้ามว่าง' : 'กรอกหัวข้อก่อน','warn'); return false; }
    if (!validCoords_(E.lat, E.lng)){ go(2); E.lat.focus(); return false; }
    return true;
  }
  async function saveNew(){
    const title = (E.title?.value||'').trim();
    // อัปโหลดรูปจากเครื่อง "ก่อน" สร้างประกาศ — ถ้าอัปโหลดพัง จะไม่มีประกาศไม่มีรูปค้างบนเว็บ
    // (รูปที่ขึ้น Drive สำเร็จแล้วถูกจำไว้ → กดบันทึกใหม่จะอัปโหลดเฉพาะรูปที่พลาด)
    const files = pending.filter(p => p.kind === 'file');
    if (files.length){
      toast('กำลังอัปโหลดรูปจากเครื่อง…');
      await uploadEntries(files);
    }
    // เรียงตามลำดับที่จัดไว้ (รูปนำเข้า + รูปอัปโหลด ตามที่ลากเรียงในหน้ารูปภาพ)
    const ordered = pending.map(p => p.kind === 'imp' ? p.obj : p.uploaded).filter(Boolean);
    const meta = {
      title,
      type: E.type?.value || 'บ้าน',
      listingMode: E.listingMode?.value || 'sale',
      status: E.status?.value || 'available',
      ...pinPayload_(!!E.pinned?.checked, false),   // ฟอร์มเพิ่ม: ยังไม่เคยปัก = fresh pin
      price: num(E.price?.value),
      priceUnit: (E.priceUnit?.value||'').trim(),
      bedrooms: num(E.bedrooms?.value),
      bathrooms: num(E.bathrooms?.value),
      usableArea: num(E.usableArea?.value),
      landSize: num(E.landSize?.value),
      parking: num(E.parking?.value),
      desc: (E.desc?.value||'').trim(),
      fbUrl: safeUrl(E.fbUrl?.value),
      lat: num(E.lat?.value),
      lng: num(E.lng?.value),
      ...approxFields_(E.lat, E.lng, radiusSel, E.approxLoc),
      imageObjs: ordered.slice(0, MAX_IMAGES),   // rules จำกัด 30 รูป
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('listings').add(meta);
    saved = true;
    toast('เพิ่มประกาศแล้ว','success');
  }
  async function saveEdit(){
    const ref = db.collection('listings').doc(it.id);
    // อัปโหลดรูปใหม่ "ก่อน" บันทึกข้อความ — ถ้ารูปพลาดจะยังไม่บันทึกอะไร (ไม่เกิดสถานะครึ่ง ๆ กลาง ๆ)
    let items = [];
    if (editNewFiles.length){
      toast('กำลังอัปโหลดรูปเพิ่ม…');
      items = await uploadEntries(editNewFiles);
    }
    const payload = {
      title: (E.title.value||'').trim(),
      type: E.type.value || 'บ้าน',
      listingMode: E.listingMode.value || 'sale',
      status: E.status.value || 'available',
      ...pinPayload_(!!E.pinned?.checked, E.pinned?.dataset.initial === '1'),
      price: num(E.price.value),
      priceUnit: (E.priceUnit.value||'').trim(),
      bedrooms: num(E.bedrooms.value),
      bathrooms: num(E.bathrooms.value),
      usableArea: num(E.usableArea.value),
      landSize: num(E.landSize.value),
      parking: num(E.parking.value),
      desc: (E.desc.value||'').trim(),
      fbUrl: safeUrl(E.fbUrl.value),
      lat: num(E.lat.value),
      lng: num(E.lng.value),
      ...approxFields_(E.lat, E.lng, radiusSel, E.approxLoc),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (items.length){
      const snap = await ref.get();
      const cur = currentImgArr_(snap.data() || {});   // อ่านล่าสุด (รวมรูปที่เรียง/นำเข้าไปแล้วระหว่างแก้) + รองรับ imageURLs เก่า
      const merged = cur.concat(items);
      if (merged.length > MAX_IMAGES){
        const extra = merged.splice(MAX_IMAGES).map(o => o.id).filter(Boolean);
        if (extra.length){ try{ await deleteDriveFiles(extra); }catch(e){ console.warn(e); } }
        toast(`ครบ ${MAX_IMAGES} รูป — ตัดรูปส่วนเกินออก`,'warn',6000);
      }
      payload.imageObjs = merged;
    }
    await ref.update(payload);   // ข้อความ + รูปใหม่ ในการเขียนครั้งเดียว
    saved = true;
    toast('อัปเดตแล้ว','success');
  }
  saveBtn.addEventListener('click', async () => {
    if (!guard()) return;
    saveBtn.disabled = true; busy = true;
    try{
      if (isEdit) await saveEdit(); else await saveNew();
      dirty = false;
      layer.close(true);
    }catch(err){
      console.error(err);
      if (String(err).includes('permission')) rulesHint(isEdit ? 'อัปเดต' : 'บันทึก');
      else toast((err.long ? '' : (isEdit ? 'อัปเดตล้มเหลว: ' : 'เกิดข้อผิดพลาด: ')) + (err.message||''),'error', err.long ? 9000 : 5000);
    }finally{ saveBtn.disabled = false; busy = false; }
  });

  delBtn?.addEventListener('click', async () => {
    if (!confirmDialog('ยืนยันลบประกาศนี้?')) return;
    try{
      // Also try to remove associated drive files
      const snap = await db.collection('listings').doc(it.id).get();
      const data = snap.exists ? snap.data() : null;
      const ids = data ? currentImgArr_(data).map(o => o.id || driveIdFromURL(o.url)).filter(Boolean) : [];
      await db.collection('listings').doc(it.id).delete();           // ลบประกาศก่อน — ถ้าพลาดจะไม่เสียรูป
      await releaseDriveFiles_(ids, it.id, []);                       // แล้วค่อยลบไฟล์ Drive เฉพาะที่ไม่มีประกาศอื่นใช้ร่วม
      toast('ลบประกาศแล้ว','success');
      dirty = false;
      layer.close(true);
    }catch(err){
      console.error(err);
      if (String(err).includes('permission')) return rulesHint('ลบประกาศ');
      toast('ลบล้มเหลว','error');
    }
  });

  // ⌘/Ctrl + S = บันทึก
  drawer.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); saveBtn.click(); } });

  renderImages();
  updatePreview();
  go(0);
  emit('editor');
}

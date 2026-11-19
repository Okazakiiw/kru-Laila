/* ============================================================================
   admin/ops.js — คำสั่งเขียนข้อมูลของแอดมิน (ย้ายมาจาก initAdmin() ใน app.js เดิม)
   quickStatus / duplicateListing / togglePin / images (reorder, cover, delete)
   / export / import / types / site settings / leads — logic เดิมทุกบรรทัด
============================================================================ */
import { toast, confirmDialog } from '../core/dom.js';
import { STATUS_LABEL } from '../core/format.js';
import { db, rulesHint, siteSettings, setSiteSettings, loadTypes } from '../data/firebase.js';
import { normalizeDriveImageURL, deleteDriveFiles } from '../data/images.js';
import { pinPayload_ } from '../data/listings.js';

export async function quickStatus(it, value){
  try {
    const patch = { status: value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    // ขายแล้ว → เลิกปักหมุดอัตโนมัติ (กันลืม)
    if (value === 'sold' && it.pinned){ patch.pinned = false; patch.pinnedUntil = null; }
    await db.collection('listings').doc(it.id).update(patch);
    toast('เปลี่ยนสถานะเป็น "' + (STATUS_LABEL[value]||value) + '"' + (patch.pinned===false?' (เลิกปักหมุดอัตโนมัติ)':''), 'success');
  } catch(e){
    console.error(e);
    if (String(e).includes('permission')) return rulesHint('เปลี่ยนสถานะ');
    toast('เปลี่ยนสถานะไม่สำเร็จ','error');
  }
}

export async function duplicateListing(it){
  try {
    const { id:_i, createdAt:_c, updatedAt:_u, views:_v, ...fields } = it;
    fields.title = (it.title||'ประกาศ') + ' (สำเนา)';
    fields.status = 'draft';   // สำเนาเริ่มเป็นฉบับร่าง ไม่โชว์จนกว่าจะพร้อม
    fields.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    fields.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('listings').add(fields);
    toast('ก๊อปปี้ประกาศแล้ว (เป็นฉบับร่าง) — แก้ไขแล้วเปลี่ยนสถานะเพื่อเผยแพร่','success',5000);
  } catch(e){
    console.error(e);
    if (String(e).includes('permission')) return rulesHint('ก๊อปปี้ประกาศ');
    toast('ก๊อปปี้ไม่สำเร็จ','error');
  }
}

export async function togglePin(it){
  try {
    const payload = {
      ...pinPayload_(!it.pinned, !!it.pinned),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('listings').doc(it.id).update(payload);
    if (it.pinned) toast('เลิกปักหมุดแล้ว','success');
    else {
      const days = +(siteSettings.pinDefaultDays);
      toast('ปักหมุดแล้ว' + (days>0 ? ` — หมดเวลาใน ${days} วัน` : ' — ไม่จำกัดเวลา'),'success',4000);
    }
  } catch(e){
    console.error(e);
    if (String(e).includes('permission')) return rulesHint('ปักหมุด');
    toast('ปักหมุดไม่สำเร็จ','error');
  }
}

/* ─────── จัดการรูปในหน้าแก้ไข: เรียงลำดับ / ตั้งปก / ลบ ─────── */
export function currentImgArr_(data){
  if (Array.isArray(data.imageObjs)) return data.imageObjs.slice();
  if (Array.isArray(data.imageURLs)) return data.imageURLs.map(u => ({ id:null, url: normalizeDriveImageURL(u) }));
  return [];
}
export async function freshImgs_(it){
  const snap = await db.collection('listings').doc(it.id).get();
  return snap.exists ? currentImgArr_(snap.data()) : [];
}
export function matchIdx_(arr, o){
  const u = normalizeDriveImageURL(o.url);
  return arr.findIndex(x => (o.id ? (x.id||'') === o.id : true) && normalizeDriveImageURL(x.url) === u);
}
/** onDone(arr) — เดิมเรียก renderEditImages(it, arr) ตรงนี้ */
export async function persistImgs_(it, arr, deleteIds, onDone){
  try {
    if (deleteIds && deleteIds.length) await deleteDriveFiles(deleteIds);
    await db.collection('listings').doc(it.id).update({
      imageObjs: arr, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    onDone && onDone(arr);   // วาดใหม่จาก array ล่าสุด
    return true;
  } catch(e){
    console.error(e);
    if (String(e).includes('permission')) { rulesHint('จัดการรูป'); return false; }
    toast('จัดการรูปไม่สำเร็จ: ' + (e.message||''),'error',4000);
    return false;
  }
}
export async function moveImg_(it, o, dir, onDone){
  const arr = await freshImgs_(it);
  const i = matchIdx_(arr, o); if (i < 0) return;
  if (dir === 'cover'){ const [x] = arr.splice(i,1); arr.unshift(x); }
  else if (dir === 'left' && i > 0){ const t = arr[i-1]; arr[i-1] = arr[i]; arr[i] = t; }
  else if (dir === 'right' && i < arr.length-1){ const t = arr[i+1]; arr[i+1] = arr[i]; arr[i] = t; }
  else return;
  if (await persistImgs_(it, arr, null, onDone)) toast(dir === 'cover' ? 'ตั้งเป็นรูปปกแล้ว' : 'สลับลำดับรูปแล้ว','success');
}
/** v3: ลากวางเพื่อเรียงลำดับ — ใช้ freshImgs_/matchIdx_/persistImgs_ ชุดเดิม แค่ย้ายไป index ที่วาง */
export async function reorderImg_(it, o, toIdx, onDone){
  const arr = await freshImgs_(it);
  const i = matchIdx_(arr, o); if (i < 0 || i === toIdx) return;
  const [x] = arr.splice(i,1);
  arr.splice(Math.max(0, Math.min(toIdx, arr.length)), 0, x);
  if (await persistImgs_(it, arr, null, onDone)) toast(toIdx === 0 ? 'ตั้งเป็นรูปปกแล้ว' : 'จัดลำดับรูปแล้ว','success');
}
export async function delImg_(it, o, onDone){
  if (!confirmDialog('ลบรูปนี้ออก' + (o.id ? ' (รวมจาก Google Drive)' : '') + ' ?')) return;
  const arr = await freshImgs_(it);
  const i = matchIdx_(arr, o); if (i < 0) return;
  const [removed] = arr.splice(i,1);
  if (await persistImgs_(it, arr, (removed && removed.id) ? [removed.id] : [], onDone)) toast('ลบรูปแล้ว','success');
}

/* ─────── Export / Import JSON ─────── */
export async function exportListings(){
  try{
    const snap = await db.collection('listings').get();
    const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    const payload = { exportedAt:new Date().toISOString(), items };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'listings-export.json';
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
  }catch(err){
    console.error(err); toast('ส่งออกล้มเหลว','error');
  }
}
export function importListingsFile(f, adminItems){
  if (!f) return;
  const r = new FileReader();
  r.onload = async (e) => {
    let arr;
    try{
      const raw = JSON.parse(e.target.result || '{}');
      arr = (Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [])
              .filter(x => x && typeof x.title === 'string' && x.title.trim());
    }catch(err){ console.error(err); return toast('ไฟล์ JSON ไม่ถูกต้อง','error'); }
    if (!arr.length) return toast('ไม่พบประกาศในไฟล์ (ต้องมี items[] และแต่ละรายการมี title)','warn',4000);
    if (!confirmDialog(`จะเพิ่มประกาศใหม่ ${arr.length} รายการ (ไม่ลบของเดิม; รายการที่ id ซ้ำกับที่มีอยู่จะข้าม) — ดำเนินการต่อ?`)) return;
    const existing = new Set(adminItems.map(x => x.id));
    let ok = 0, skip = 0, fail = 0;
    for (const item of arr){
      if (item.id && existing.has(item.id)){ skip++; continue; }   // กันนำเข้าไฟล์ backup ซ้ำแล้วประกาศเบิ้ล
      const { id:_drop, createdAt:_c, updatedAt:_u, views:_v, pinnedUntil:_p, ...fields } = item;
      try{
        await db.collection('listings').add({
          ...fields,
          title: String(fields.title).slice(0, 200),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        ok++;
      }catch(err){ console.error('import item:', err); fail++; }
    }
    toast(`นำเข้า ${ok} รายการ` + (skip ? ` · ข้าม ${skip} (มีอยู่แล้ว)` : '') + (fail ? ` · ล้มเหลว ${fail}` : ''), fail ? 'warn' : 'success', 5000);
  };
  r.readAsText(f);
}

/* ─────── Types (meta/types.list) ─────── */
export async function removeType(t){
  if (!confirmDialog('ลบประเภท "'+t+'" ?')) return false;
  try{
    const cur = await loadTypes();
    const next = cur.filter(x => x !== t);
    await db.collection('meta').doc('types').set({ list: next }, { merge:true });
    toast('ลบประเภทแล้ว','success');
    return true;
  }catch(err){
    console.error(err);
    if (String(err).includes('permission')) { rulesHint('ลบประเภท'); return false; }
    toast('ลบไม่สำเร็จ','error');
    return false;
  }
}
export async function addType(v){
  v = (v||'').trim();
  if (!v) return false;
  try{
    const cur = await loadTypes();
    if (cur.includes(v)){ toast('มีประเภทนี้แล้ว','warn'); return false; }
    cur.push(v);
    await db.collection('meta').doc('types').set({ list: cur }, { merge:true });
    toast('เพิ่มแล้ว','success');
    return true;
  }catch(err){
    console.error(err);
    if (String(err).includes('permission')) { rulesHint('เพิ่มประเภท'); return false; }
    toast('เพิ่มไม่สำเร็จ','error');
    return false;
  }
}

/* ─────── Site settings (meta/site) ─────── */
export async function saveSiteSettings(v){
  try{
    const payload = {
      phone: (v.phone||'').trim(),
      lineId: (v.lineId||'').trim(),
      lineUrl: (v.lineUrl||'').trim(),
      facebookPage: (v.facebookPage||'').trim(),
      messengerUrl: (v.messengerUrl||'').trim(),
      aboutText: (v.aboutText||'').trim(),
      pinDefaultDays: Math.max(0, parseInt(v.pinDefaultDays||'14', 10) || 0),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('meta').doc('site').set(payload, { merge:true });
    setSiteSettings(payload);
    toast('บันทึกการตั้งค่าแล้ว','success');
    return true;
  }catch(err){
    console.error(err);
    if (String(err).includes('permission')) { rulesHint('บันทึกการตั้งค่า'); return false; }
    toast('บันทึกไม่สำเร็จ','error');
    return false;
  }
}

/* ─────── Leads (/leads) ─────── */
export function subscribeLeads(onData, onError){
  return db.collection('leads').orderBy('createdAt','desc').limit(200).onSnapshot(snap => {
    onData(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  }, onError);
}
export function setLeadHandled(l){
  return db.collection('leads').doc(l.id).update({ handled: !l.handled })
    .catch(e => { console.error(e); toast('อัปเดตไม่สำเร็จ','error'); });
}
export function deleteLead(l){
  if (confirmDialog('ลบข้อความนี้? (ข้อมูลส่วนบุคคลจะถูกลบถาวร)'))
    db.collection('leads').doc(l.id).delete().catch(e => { console.error(e); toast('ลบไม่สำเร็จ','error'); });
}

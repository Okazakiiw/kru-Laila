
/* ============================================================================
   data/images.js — Google Drive image URLs, compress + upload/delete via Apps Script,
   import from URL / FB post
   (ส่วน 3, 6, 6.5 ย้ายมาจาก app.js เดิม — v3.1: อัปโหลดทีละไฟล์ + progress, ย่อรูปใหม่ (EXIF/โปร่งใส/ลายน้ำ),
    ข้อความ error ภาษาไทย, timeout — รูปแบบข้อมูลที่เก็บ (imageObjs {id,url,name}) ไม่เปลี่ยน)
============================================================================ */
import { auth, GAS_UPLOAD_URL, GAS_SHARED_TOKEN } from './firebase.js';

/* ── 3) Image URL normalisation (Google Drive) ── */
export function normalizeDriveImageURL(u){
  if (!u) return '';
  try{
    if (u.includes('uc?')) {
      const id = new URL(u).searchParams.get('id');
      if (id) return `https://lh3.googleusercontent.com/d/${id}=s1200`;
    }
    if (u.includes('/open?')) {
      const id = new URL(u).searchParams.get('id');
      if (id) return `https://lh3.googleusercontent.com/d/${id}=s1200`;
    }
    const m = u.match(/\/file\/d\/([^/]+)/);
    if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}=s1200`;
  } catch{}
  return u;
}
export function getImageURLs(it){
  if (Array.isArray(it.imageObjs)) return it.imageObjs.map(o => normalizeDriveImageURL(o.url)).filter(Boolean);
  if (Array.isArray(it.imageURLs)) return it.imageURLs.map(u => normalizeDriveImageURL(u)).filter(Boolean);
  return [];
}
/** v3 (แสดงผลเท่านั้น): ขอรูปเล็กลงสำหรับการ์ด/thumbnail — lh3 รองรับ =sNNN */
export function sizedURL(u, s=640){
  return /^https:\/\/lh3\.googleusercontent\.com\/d\/[^=]+=s\d+$/.test(u) ? u.replace(/=s\d+$/, '=s' + s) : u;
}
/** ดึงไอดีไฟล์ Drive จาก URL (lh3 /d/{id}, uc?id=, open?id=, /file/d/{id}) — ใช้เทียบว่ารูปไหนยังถูกใช้อยู่ */
export function driveIdFromURL(u){
  const s = String(u || '');
  let m = s.match(/googleusercontent\.com\/d\/([\w-]+)/); if (m) return m[1];
  m = s.match(/\/file\/d\/([\w-]+)/); if (m) return m[1];
  m = s.match(/[?&]id=([\w-]+)/); if (m) return m[1];
  return '';
}

/* ── 6) Image compress + Drive upload/delete ── */
export const MAX_IMAGES = 30;              // ตรงกับ firestore.rules (imageObjs ≤ 30)
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // เพดานของ gas-upload.gs = 5MB ต่อรูป (เผื่อ base64)
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;  // ไฟล์ต้นฉบับใหญ่เกินนี้ไม่รับ (ป้องกันเบราว์เซอร์ค้าง)

export const WM_KEY = 'krulaila:watermark';   // ค่าลายน้ำจำต่ออุปกรณ์ (localStorage) — ไม่เก็บใน Firestore
export function getWatermarkPref(){
  try { const v = JSON.parse(localStorage.getItem(WM_KEY) || 'null'); if (v && typeof v === 'object') return { on: !!v.on, text: String(v.text || '') }; } catch{}
  return { on:false, text:'' };
}
export function setWatermarkPref(p){ try { localStorage.setItem(WM_KEY, JSON.stringify({ on: !!p.on, text: String(p.text || '').slice(0, 40) })); } catch{} }

function loadBitmap(file){
  // createImageBitmap + from-image = หมุนรูปตาม EXIF ให้ถูก และเร็วกว่า <img> + FileReader
  if (typeof createImageBitmap === 'function'){
    return createImageBitmap(file, { imageOrientation:'from-image' }).catch(() => loadViaImg(file));
  }
  return loadViaImg(file);
}
function loadViaImg(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}
function drawWatermark(ctx, w, h, text){
  const size = Math.max(14, Math.round(Math.min(w, h) * 0.04));
  ctx.save();
  ctx.font = `600 ${size}px "Noto Sans Thai", "Sarabun", system-ui, sans-serif`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  const x = w - size * 0.8, y = h - size * 0.7;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(2, size * 0.14); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
  ctx.restore();
}
function canvasToBlob(cv, quality){
  return new Promise((resolve, reject) => cv.toBlob(b => b ? resolve(b) : reject(new Error('encode')), 'image/jpeg', quality));
}
function blobToDataURL(b){
  return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(new Error('read')); fr.readAsDataURL(b); });
}
/**
 * ย่อ + แปลงเป็น JPEG (พื้นขาวแทนพื้นดำเมื่อรูปโปร่งใส) · ขอบยาวสุด max px · ตัดคุณภาพลงอัตโนมัติถ้าไฟล์ยังใหญ่เกินเพดาน
 * opts.watermark = ข้อความลายน้ำ (ว่าง = ไม่ใส่)
 * ข้อผิดพลาดมีชื่อไฟล์เสมอ → แสดงให้ผู้ใช้รู้ว่ารูปไหนพัง
 */
export async function compressImageToDataURL(file, max = 1600, quality = 0.85, opts = {}){
  const nm = (file && file.name) || 'รูป';
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`"${nm}" ใหญ่เกิน ${Math.round(MAX_SOURCE_BYTES / 1048576)}MB`);
  let src;
  try { src = await loadBitmap(file); }
  catch { throw new Error(`เปิดไฟล์ "${nm}" ไม่ได้ — ใช้ JPG / PNG / WebP (ไฟล์ HEIC จาก iPhone ให้ตั้งกล้องเป็น "Most Compatible" หรือแชร์เป็น JPG)`); }
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw new Error(`ไฟล์ "${nm}" ไม่ใช่รูปภาพที่ถูกต้อง`);
  let side = max, q = quality, blob = null;
  for (let attempt = 0; attempt < 4; attempt++){
    const scale = Math.min(1, side / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    if (opts.watermark) drawWatermark(ctx, w, h, opts.watermark);
    try { blob = await canvasToBlob(cv, q); } catch { throw new Error(`บีบอัด "${nm}" ไม่สำเร็จ`); }
    if (blob.size <= MAX_UPLOAD_BYTES) break;
    q = Math.max(0.6, q - 0.1); side = Math.round(side * 0.85);   // ยังใหญ่ → ลดคุณภาพ/ขนาดแล้วลองใหม่
  }
  if (src.close) src.close();
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`"${nm}" ยังใหญ่เกินหลังย่อ — ลองลดขนาดรูปก่อน`);
  return blobToDataURL(blob);
}
export async function getAuthToken(){
  try{ return auth?.currentUser ? await auth.currentUser.getIdToken() : ''; }
  catch{ return ''; }
}

/* ── เรียก Apps Script: timeout + แปลงข้อความ error เป็นไทย ── */
const GAS_ERR_TH = [
  [/Invalid shared token/i,         'รหัสลับ (SHARED_TOKEN) ในหน้าเว็บไม่ตรงกับ Apps Script — ตรวจ admin.html กับ gas-upload.gs'],
  [/Missing idToken/i,              'ยังไม่ได้ล็อกอิน หรือเซสชันหมดอายุ — ล็อกอินใหม่แล้วลองอีกครั้ง'],
  [/ไม่ใช่แอดมิน/i,                  'บัญชีนี้ไม่มีสิทธิ์อัปโหลดรูป (ไม่อยู่ใน ADMIN_UIDS ของ Apps Script)'],
  [/Auth:/i,                        'ยืนยันตัวตนกับ Apps Script ไม่ผ่าน — ล็อกอินใหม่แล้วลองอีกครั้ง'],
  [/Too many (files|urls)/i,        'ส่งรูปมากเกินต่อครั้ง'],
  [/File too large/i,               'ไฟล์ใหญ่เกินกำหนด (สูงสุด 5MB ต่อรูป)'],
  [/Not an allowed image type|Not an image/i, 'ไฟล์นี้ไม่ใช่รูปที่รองรับ (JPG / PNG / WebP / GIF)'],
  [/Invalid dataURL/i,              'ข้อมูลรูปไม่ถูกต้อง'],
  [/Service invoked too many times|quota/i, 'โควตา Google Apps Script วันนี้เต็ม — รอสักพักหรือลองใหม่พรุ่งนี้'],
  [/^Drive:/i,                      'บันทึกลง Google Drive ไม่สำเร็จ (Drive เต็มหรือไม่มีสิทธิ์ในโฟลเดอร์)']
];
export function thaiGasError(msg){
  const s = String(msg || '');
  for (const [re, th] of GAS_ERR_TH) if (re.test(s)) return th;
  return s;
}
async function gasPost(payload, { timeoutMs = 90000 } = {}){
  if (!GAS_UPLOAD_URL) throw new Error('ยังไม่ได้ตั้งค่า GAS_UPLOAD_URL ใน admin.html');
  const idToken = await getAuthToken();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(GAS_UPLOAD_URL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token: GAS_SHARED_TOKEN, idToken }),
      signal: ctl.signal
    });
  } catch (e){
    throw new Error(e && e.name === 'AbortError' ? 'เซิร์ฟเวอร์ตอบช้าเกินไป (หมดเวลา) — ลองใหม่อีกครั้ง' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  } finally { clearTimeout(timer); }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(/quota|too many times/i.test(text) ? thaiGasError('quota') : `เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status}) — ตรวจว่า deploy Apps Script เป็น "Anyone" แล้ว`); }
  return json;
}
async function gasOk(payload, opts){
  const json = await gasPost(payload, opts);
  if (!json.ok) throw new Error(thaiGasError(json.error) || 'ทำรายการไม่สำเร็จ');
  return json;
}
const pickItem = (o) => ({ id: o.id, url: o.url, name: o.name });   // เก็บเฉพาะฟิลด์เดิมของ imageObjs

/**
 * อัปโหลดทีละไฟล์ (ขนาน `concurrency` ไฟล์) — ไฟล์ไหนพลาดไม่กระทบไฟล์อื่น
 * entries: [{ file, uploaded? }]  — ไฟล์ที่มี uploaded แล้ว (จากรอบก่อน) จะถูกข้าม → ลองใหม่เฉพาะที่ล้มเหลว
 * opts.watermark: ข้อความลายน้ำ · opts.onState(entry, 'wait'|'busy'|'done'|'fail', errMsg) · opts.onProgress(done,total)
 * คืน { items: [item|null ตามลำดับ], failed: [{entry, error}], warnings: [] }
 */
export async function uploadFiles(entries, opts = {}){
  const total = entries.length;
  const items = new Array(total).fill(null);
  const failed = [], warnings = [];
  let done = 0, next = 0;
  const bump = () => { done++; opts.onProgress && opts.onProgress(done, total); };
  async function work(){
    while (next < total){
      const i = next++, e = entries[i];
      if (e.uploaded){ items[i] = e.uploaded; opts.onState && opts.onState(e, 'done'); bump(); continue; }
      opts.onState && opts.onState(e, 'busy');
      try {
        const dataURL = await compressImageToDataURL(e.file, 1600, 0.85, { watermark: opts.watermark || '' });
        const name = e.file.name || `img_${Date.now()}_${i}.jpg`;
        const r = await gasOk({ action:'upload', files:[{ name, dataURL }] });
        const it = (r.items || [])[0];
        if (!it) throw new Error('เซิร์ฟเวอร์ไม่ส่งข้อมูลรูปกลับมา');
        e.uploaded = pickItem(it); items[i] = e.uploaded;
        (r.warnings || []).forEach(w => warnings.push(w));
        e.error = '';
        opts.onState && opts.onState(e, 'done');
      } catch (err){
        e.error = err.message || String(err);
        failed.push({ entry: e, error: e.error });
        opts.onState && opts.onState(e, 'fail', e.error);
      }
      bump();
    }
  }
  const n = Math.max(1, Math.min(opts.concurrency || 2, total));
  await Promise.all(Array.from({ length: n }, work));
  return { items, failed, warnings };
}
/** (เดิม) อัปโหลดแบบรวมชุด — คงไว้เพื่อ API เดิม: พังตัวใดตัวหนึ่ง = throw */
export async function uploadToDrive(files){
  const r = await uploadFiles(Array.from(files).map(file => ({ file })));
  if (r.failed.length) throw new Error(r.failed[0].error);
  return r.items;
}
export async function deleteDriveFiles(ids){
  return gasOk({ action:'delete', ids });   // { ok, removed, skipped } — skipped = ไม่อยู่ในโฟลเดอร์รูป/ไม่พบ
}

/* ── 6.5) Apps Script generic caller + FB import helpers ── */
export async function gasCall(payload){
  return gasPost(payload);
}
export async function importViaUrls(urls){
  const r = await gasPost({ action:'importUrls', urls });
  if (!r.ok) throw new Error(thaiGasError(r.error) || 'Import failed');
  return r;  // { ok, items, errors, warnings }
}
export async function importViaPostUrl(postUrl){
  const r = await gasPost({ action:'importFbShare', postUrl }, { timeoutMs: 150000 });
  if (!r.ok) throw new Error(thaiGasError(r.error) || 'Import failed');
  // diagnostic: ดูว่า server พบกี่รูป (found) และดึง HTML จากแหล่งใดได้บ้าง (sources)
  console.log('[importFbShare] found:', r.found, 'imported:', (r.items||[]).length, 'sources:', r.sources, 'errors:', r.errors);
  return r;  // { ok, items, errors, warnings, message, found, sources }
}
export async function listRecentFbPosts(){
  const r = await gasPost({ action:'listFbPosts' });
  if (!r.ok) throw new Error(r.error || 'List failed');
  return r.posts || [];
}
export async function setFbCreds(payload){
  const r = await gasPost({ action:'setFbCreds', ...payload });
  if (!r.ok) throw new Error(r.error || 'setFbCreds failed');
  return r;
}
export async function fbCredsStatus(){
  const r = await gasPost({ action:'fbCredsStatus' });
  if (!r.ok) throw new Error(r.error || 'status failed');
  return r;  // { pageId, hasToken }
}
/** รายการไฟล์ในโฟลเดอร์รูป (อ่านอย่างเดียว) — ใช้กับเครื่องมือตรวจรูปที่ไม่ได้ใช้ */
export async function listDriveFolder(){
  const r = await gasPost({ action:'listFolder' }, { timeoutMs: 120000 });
  if (!r.ok) throw new Error(thaiGasError(r.error) || 'List failed');
  return r;  // { files:[{id,name,size,created}], truncated }
}
export async function securityStatus(){
  const r = await gasPost({ action:'securityStatus' });
  if (!r.ok) throw new Error(thaiGasError(r.error) || 'status failed');
  return r;  // { adminUidsSet, tokenIsDefault, requireAuth }
}

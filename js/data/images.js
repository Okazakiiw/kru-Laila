/* ============================================================================
   data/images.js — Google Drive image URLs, compress + upload/delete via Apps Script,
   import from URL / FB post (ย้ายมาจาก app.js เดิม ส่วน 3, 6, 6.5 — logic เดิมทุกบรรทัด)
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

/* ── 6) Image compress + Drive upload/delete ── */
export function compressImageToDataURL(file, max=1280, quality=0.82){
  return new Promise((resolve,reject)=>{
    const img = new Image(), fr = new FileReader();
    fr.onload = ()=> { img.src = fr.result; };
    fr.onerror = reject;
    img.onload = ()=>{
      const long = Math.max(img.width, img.height);
      const scale = Math.min(1, max/long);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      cv.toBlob(b=>{
        const fr2 = new FileReader();
        fr2.onload = ()=> resolve(fr2.result);
        fr2.onerror = reject;
        fr2.readAsDataURL(b);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    fr.readAsDataURL(file);
  });
}
export async function getAuthToken(){
  try{ return auth?.currentUser ? await auth.currentUser.getIdToken() : ''; }
  catch{ return ''; }
}
export async function uploadToDrive(files){
  if (!GAS_UPLOAD_URL) throw new Error('GAS_UPLOAD_URL is not set');
  const list = [];
  for (let i=0;i<files.length;i++){
    const dataURL = await compressImageToDataURL(files[i]);
    list.push({ name: files[i].name || `img_${Date.now()}_${i}.jpg`, dataURL });
  }
  const idToken = await getAuthToken();
  const res = await fetch(GAS_UPLOAD_URL, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action:'upload', files:list, token: GAS_SHARED_TOKEN, idToken })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Upload failed');
  return json.items;
}
export async function deleteDriveFiles(ids){
  if (!GAS_UPLOAD_URL) throw new Error('GAS_UPLOAD_URL is not set');
  const idToken = await getAuthToken();
  const res = await fetch(GAS_UPLOAD_URL, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action:'delete', ids, token: GAS_SHARED_TOKEN, idToken })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Delete failed');
  return json;
}

/* ── 6.5) Apps Script generic caller + FB import helpers ── */
export async function gasCall(payload){
  if (!GAS_UPLOAD_URL) throw new Error('GAS_UPLOAD_URL is not set');
  const idToken = await getAuthToken();
  const res = await fetch(GAS_UPLOAD_URL, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: GAS_SHARED_TOKEN, idToken })
  });
  return res.json();
}
export async function importViaUrls(urls){
  const r = await gasCall({ action:'importUrls', urls });
  if (!r.ok) throw new Error(r.error || 'Import failed');
  return r;  // { ok, items, errors }
}
export async function importViaPostUrl(postUrl){
  const r = await gasCall({ action:'importFbShare', postUrl });
  if (!r.ok) throw new Error(r.error || 'Import failed');
  // diagnostic: ดูว่า server พบกี่รูป (found) และดึง HTML จากแหล่งใดได้บ้าง (sources)
  console.log('[importFbShare] found:', r.found, 'imported:', (r.items||[]).length, 'sources:', r.sources, 'errors:', r.errors);
  return r;  // { ok, items, errors, message, found, sources }
}
export async function listRecentFbPosts(){
  const r = await gasCall({ action:'listFbPosts' });
  if (!r.ok) throw new Error(r.error || 'List failed');
  return r.posts || [];
}
export async function setFbCreds(payload){
  const r = await gasCall({ action:'setFbCreds', ...payload });
  if (!r.ok) throw new Error(r.error || 'setFbCreds failed');
  return r;
}
export async function fbCredsStatus(){
  const r = await gasCall({ action:'fbCredsStatus' });
  if (!r.ok) throw new Error(r.error || 'status failed');
  return r;  // { pageId, hasToken }
}

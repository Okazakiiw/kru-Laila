/* ============================================================================
   data/firebase.js — Firebase init, site settings, types
   (ย้ายมาจาก app.js เดิม ส่วน 5, 7, 8 — logic เดิมทุกบรรทัด)
============================================================================ */
import { toast } from '../core/dom.js';

/* ── 5) Firebase init ── */
export let db, auth;
try{
  if (!window.firebaseConfig) console.warn('Missing window.firebaseConfig');
  if (!firebase.apps?.length) firebase.initializeApp(window.firebaseConfig || {});
  db = firebase.firestore();
  if (firebase.auth) auth = firebase.auth();
}catch(e){
  console.error('Firebase init error:', e);
}

export const GAS_UPLOAD_URL  = (window.GAS_UPLOAD_URL || '').trim();
export const GAS_SHARED_TOKEN = (window.GAS_SHARED_TOKEN || '').trim();

export function rulesHint(label='บันทึก/แก้ไข'){
  toast('Firestore: สิทธิ์ไม่พอ — ตรวจ Auth/Rules อีกครั้ง (' + label + ')', 'error', 5000);
  console.warn(`Firestore permission denied for "${label}". Make sure user is signed in AND Rules allow write for request.auth != null`);
}

/* ── 7) Site settings (phone, LINE, etc.) — read once, reactive on admin ── */
export let siteSettings = {};
/** ES module: ผู้ import แก้ตัวแปร export ตรง ๆ ไม่ได้ — เดิม admin เขียน `siteSettings = payload` */
export function setSiteSettings(v){ siteSettings = v || {}; }
export async function loadSiteSettings(){
  try{
    const doc = await db.collection('meta').doc('site').get();
    siteSettings = doc.exists ? (doc.data() || {}) : {};
  }catch(e){ console.warn('loadSiteSettings:', e); }
  return siteSettings;
}

/* ── 8) Common: types loader ── */
export async function loadTypes(){
  try{
    const doc = await db.collection('meta').doc('types').get();
    return (doc.exists && Array.isArray(doc.data().list)) ? doc.data().list : ['บ้าน','ที่ดิน'];
  }catch{ return ['บ้าน','ที่ดิน']; }
}

/**
 * Apps Script — Drive uploader/deleter for ครูไลลาขายบ้านและที่ดิน
 *
 * 🔧 วิธี deploy:
 *   1. ไปที่ https://script.google.com → New project
 *   2. แทนที่ Code.gs ด้วยไฟล์นี้
 *   3. ปรับ CONFIG ด้านล่างให้ตรงกับโปรเจกต์
 *   4. Deploy → New deployment → Type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone (จำเป็นสำหรับให้ web เรียกได้)
 *   5. Copy URL ที่ได้ → ใส่ใน window.GAS_UPLOAD_URL ใน admin.html
 *   6. ตั้ง SHARED_TOKEN ให้เป็นรหัสยาว ๆ แล้วเอาไปใส่ window.GAS_SHARED_TOKEN
 *
 * 🔒 ชั้นความปลอดภัย:
 *   - ตรวจ SHARED_TOKEN: กันคนสุ่มยิงไม่รู้รหัส
 *   - ตรวจ idToken (Firebase ID Token) ผ่าน Google's tokeninfo:
 *     เฉพาะผู้ที่ล็อกอินใน Firebase Auth ของโปรเจกต์เราเท่านั้นจึงจะ upload/delete ได้
 *   - ตรวจ aud == PROJECT_ID เพื่อกันคนใช้ token จาก project อื่น
 *   - จำกัดขนาดไฟล์
 */

// ════════════════════════ CONFIG ════════════════════════
const CONFIG = {
  FOLDER_ID: '1ZRPgYjluQ40Pcgnhn6AEHtf2H5_lM2Ws', // โฟลเดอร์ Drive ที่จะเก็บรูป
  SHARED_TOKEN: 'CHANGE_ME_LONG_RANDOM_STRING',  // ตรงกับ window.GAS_SHARED_TOKEN
  PROJECT_ID: 'laila-18024',                     // ต้องตรงกับ firebaseConfig.projectId
  // ⚠️ ใส่ค่าเดียวกับ firebaseConfig.apiKey ใน admin.html/index.html
  //    ใช้สำหรับ verify Firebase ID token ผ่าน Identity Toolkit
  FIREBASE_WEB_API_KEY: 'AIzaSyAoMKMzM1-Ya6FF5M649IslWo_eNtQBSQg',
  MAX_FILE_BYTES: 5 * 1024 * 1024,               // 5 MB ต่อรูป
  MAX_FILES_PER_REQUEST: 12,
  REQUIRE_AUTH: true,                             // ตั้ง false ได้ตอนทดสอบ แต่ production ให้ true
  // 🔒 รายชื่อ UID แอดมินที่อนุญาต (ดู UID ในหน้า admin.html หลังล็อกอิน)
  //    เว้นว่าง [] = ยอมรับทุกบัญชีที่ล็อกอินได้ (แบบเดิม — ไม่แนะนำ เพราะใครก็สมัครบัญชี Firebase เองได้)
  ADMIN_UIDS: [],

  // 📘 Facebook Graph API — สำหรับฟีเจอร์ "นำเข้ารูปจาก FB"
  //   - ถ้าไม่ตั้งค่า ปุ่ม "ดึงจากโพสต์ / โพสต์ล่าสุด" จะไม่ทำงาน
  //     (แต่ปุ่ม "วาง URL รูป" ยังใช้ได้ปกติ)
  //   - วิธีเอา Page ID + Long-Lived Page Access Token ดูใน README.md
  FB_PAGE_ID: '',
  FB_PAGE_ACCESS_TOKEN: '',
  FB_GRAPH_VERSION: 'v19.0'
};
// ═══════════════════════════════════════════════════════

/**
 * 🔓 รัน function นี้หนึ่งครั้งใน Apps Script editor (กดปุ่ม Run ด้านบน)
 *    เพื่อเปิด dialog ขอ permission ทั้งหมดที่ต้องใช้:
 *      ✅ UrlFetchApp       → เรียก Firebase / Facebook Graph API
 *      ✅ DriveApp           → อ่าน/เขียนไฟล์ใน Drive
 *      ✅ PropertiesService  → เก็บ FB token แบบลับ
 *
 *    หลังกด Run จะมี dialog "Authorization required" → Review permissions
 *    → เลือกบัญชี Google → กด "Advanced" → "Go to ... (unsafe)" → Allow
 *    ⚠️ ใน popup ต้องเห็นและ Allow ทั้ง 3 รายการ:
 *       - "See, edit, create, and delete all your Google Drive files"
 *       - "Connect to an external service"
 *       - "Allow this application to run when you are not present"
 *    (ที่เห็น "unsafe" เพราะ app ยังไม่ได้ verify กับ Google — ปกติสำหรับ private project)
 *
 *    หลังรันเสร็จ ดูที่ "Execution log" ด้านล่าง — ต้องเห็นว่าผ่านครบทุก service
 */
function authorize() {
  const results = [];

  try {
    const r = UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions:true });
    results.push('✅ UrlFetchApp: OK (HTTP ' + r.getResponseCode() + ')');
  } catch(e){ results.push('❌ UrlFetchApp: ' + e.message); }

  try {
    const name = DriveApp.getRootFolder().getName();
    results.push('✅ DriveApp: OK (root folder = "' + name + '")');
  } catch(e){ results.push('❌ DriveApp: ' + e.message); }

  try {
    // เช็คเข้าถึงโฟลเดอร์ที่ตั้งใน CONFIG ได้หรือไม่
    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    results.push('✅ Target folder: "' + folder.getName() + '" (' + CONFIG.FOLDER_ID + ')');
  } catch(e){
    results.push('❌ Target folder: เข้าถึงโฟลเดอร์ ' + CONFIG.FOLDER_ID + ' ไม่ได้ — ตรวจ FOLDER_ID ใน CONFIG');
  }

  try {
    PropertiesService.getScriptProperties().getProperty('_authorize_check');
    results.push('✅ PropertiesService: OK');
  } catch(e){ results.push('❌ PropertiesService: ' + e.message); }

  const summary = results.join('\n');
  Logger.log(summary);
  console.log(summary);
  return summary;
}

function doPost(e) {
  const out = (obj) => ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
  try {
    const data = JSON.parse(e.postData.contents || '{}');

    // (1) Shared token check
    if (!data.token || data.token !== CONFIG.SHARED_TOKEN) {
      return out({ ok:false, error:'Invalid shared token' });
    }

    // (2) Firebase ID Token check
    if (CONFIG.REQUIRE_AUTH) {
      const idToken = data.idToken || '';
      if (!idToken) return out({ ok:false, error:'Missing idToken' });
      const verified = verifyFirebaseIdToken_(idToken);
      if (!verified.ok) return out({ ok:false, error:'Auth: ' + verified.error });
      if (CONFIG.ADMIN_UIDS && CONFIG.ADMIN_UIDS.length && CONFIG.ADMIN_UIDS.indexOf(verified.uid) < 0) {
        return out({ ok:false, error:'Auth: บัญชีนี้ไม่ใช่แอดมิน' });
      }
    }

    if (data.action === 'upload')         return out(handleUpload_(data));
    if (data.action === 'delete')         return out(handleDelete_(data));
    if (data.action === 'importUrls')     return out(handleImportUrls_(data));
    if (data.action === 'importFbShare')  return out(handleImportFbShare_(data));
    if (data.action === 'resolveGmap')    return out(handleResolveGmap_(data));
    if (data.action === 'importFbPost')   return out(handleImportFbPost_(data));
    if (data.action === 'listFbPosts')    return out(handleListFbPosts_(data));
    if (data.action === 'setFbCreds')     return out(handleSetFbCreds_(data));
    if (data.action === 'fbCredsStatus')  return out(handleFbCredsStatus_(data));
    return out({ ok:false, error:'Unknown action' });

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
            .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleUpload_(data){
  const files = Array.isArray(data.files) ? data.files : [];
  if (!files.length) return { ok:false, error:'No files' };
  if (files.length > CONFIG.MAX_FILES_PER_REQUEST)
    return { ok:false, error:'Too many files (max ' + CONFIG.MAX_FILES_PER_REQUEST + ')' };

  const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  const items = [];

  for (let i = 0; i < files.length; i++){
    const f = files[i];
    const dataURL = String(f.dataURL || '');
    const m = dataURL.match(/^data:(.+?);base64,(.+)$/);
    if (!m) return { ok:false, error:'Invalid dataURL at index ' + i };
    const mime = m[1];
    if (!/^image\//.test(mime)) return { ok:false, error:'Not an image at index ' + i };

    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length > CONFIG.MAX_FILE_BYTES)
      return { ok:false, error:'File too large at index ' + i };

    const name = sanitizeName_(f.name || ('img_' + Date.now() + '_' + i + '.jpg'));
    const blob = Utilities.newBlob(bytes, mime, name);
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(se) { console.warn('setSharing: ' + se); }
    const id = file.getId();
    items.push({
      id: id,
      url: 'https://lh3.googleusercontent.com/d/' + id + '=s1200',
      name: file.getName()
    });
  }
  return { ok:true, items };
}

function handleDelete_(data){
  const ids = Array.isArray(data.ids) ? data.ids : [];
  if (!ids.length) return { ok:false, error:'No ids' };
  const removed = [];
  for (const id of ids){
    try{
      DriveApp.getFileById(String(id)).setTrashed(true);
      removed.push(id);
    }catch(e){ /* ignore one-off errors */ }
  }
  return { ok:true, removed };
}

function sanitizeName_(name){
  return String(name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}

/* ═════════════════════════ Import from URL(s) ═════════════════════════ */
/**
 * รับ URL รูปหลายอัน → server fetch → save ลง Drive → return items
 * รองรับทั้ง URL ของ Facebook CDN และเว็บอื่น
 */
function handleImportUrls_(data){
  const urls = Array.isArray(data.urls) ? data.urls : [];
  if (!urls.length) return { ok:false, error:'No urls' };
  if (urls.length > CONFIG.MAX_FILES_PER_REQUEST)
    return { ok:false, error:'Too many urls (max ' + CONFIG.MAX_FILES_PER_REQUEST + ')' };

  const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  const items = [];
  const errors = [];

  for (let i = 0; i < urls.length; i++){
    const url = String(urls[i]||'').trim();
    if (!/^https?:\/\//i.test(url)){
      errors.push({ url, error:'Not http(s)' });
      continue;
    }
    try {
      const item = fetchAndSave_(url, folder, 'url_' + i);
      items.push(item);
    } catch(e){
      errors.push({ url, error: String(e).slice(0, 200) });
    }
  }
  return { ok:true, items, errors };
}

/* ═════════════════════════ Resolve Google Maps short link → lat/lng ═════════════════════════ */
/**
 * รับลิงก์ Google Maps (โดยเฉพาะลิงก์ย่อ maps.app.goo.gl ที่ไม่มีพิกัดในตัว)
 * → ตาม redirect ฝั่ง server ไปหา URL เต็ม → แกะพิกัด
 * (browser ทำเองไม่ได้เพราะ Google ไม่ส่ง CORS header ให้อ่าน redirect)
 * จำกัดเฉพาะโดเมน Google Maps เพื่อกันใช้เป็นเครื่องมือ fetch URL มั่ว ๆ
 */
function handleResolveGmap_(data){
  const url = String(data.url || '').trim();
  if (!url) return { ok:false, error:'Missing url' };
  if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|www\.google\.[a-z.]+\/maps)/i.test(url)){
    return { ok:false, error:'รองรับเฉพาะลิงก์ Google Maps' };
  }
  try {
    const finalUrl = followRedirects_(url, 6);
    let c = parseLatLngFromUrl_(finalUrl || url);
    // ถ้า URL ปลายทางไม่มีพิกัดตรง ๆ (เช่น redirect ไปหน้า place ด้วย cid) → ดึง HTML มาค้นต่อ
    if (!c){
      const resp = UrlFetchApp.fetch(finalUrl || url, {
        muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KrulailaBot/1.0)' }
      });
      if (resp.getResponseCode() === 200) c = parseLatLngFromUrl_(resp.getContentText() || '');
    }
    return { ok:true, url: finalUrl || url, lat: c ? c.lat : null, lng: c ? c.lng : null };
  } catch(e){
    return { ok:false, error: String(e) };
  }
}

/** ตาม HTTP redirect ทีละ hop (สูงสุด maxHops) → return URL สุดท้าย */
function followRedirects_(url, maxHops){
  let current = url;
  for (let i = 0; i < (maxHops || 5); i++){
    const resp = UrlFetchApp.fetch(current, {
      muteHttpExceptions: true,
      followRedirects: false,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KrulailaBot/1.0)' }
    });
    const code = resp.getResponseCode();
    if (code < 300 || code >= 400) break;
    const h = resp.getAllHeaders();
    let next = null;
    for (const k in h){
      if (k.toLowerCase() === 'location'){
        next = Array.isArray(h[k]) ? h[k][0] : h[k];
        break;
      }
    }
    if (!next) break;
    current = next;
  }
  return current;
}

/** แกะ lat/lng จาก URL/HTML Google Maps หลายรูปแบบ — return {lat,lng} หรือ null */
function parseLatLngFromUrl_(s){
  let t = s;
  try { t = decodeURIComponent(s); } catch(e){ /* ถ้า decode ไม่ได้ (เช่น HTML body) ใช้ค่าดิบ */ }
  // !3d!4d = พิกัดหมุดจริง (แม่นสุด + เจาะจง ลด false positive ใน HTML) → เช็คก่อน
  let m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return { lat:+m[1], lng:+m[2] };
  m = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);            // /maps/place/.../@13.7,100.5,17z
  if (m) return { lat:+m[1], lng:+m[2] };
  m = t.match(/[?&](?:q|ll|destination|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/); // ?q=LAT,LNG
  if (m) return { lat:+m[1], lng:+m[2] };
  return null;
}

/* ═════════════════════════ Import from FB share URL (no token) ═════════════════════════ */
/**
 * รับ URL share/post ของ Facebook → fetch HTML → parse og:image meta tags → save Drive
 *
 * ✅ ใช้ได้กับ public posts (โพสต์สาธารณะ)
 * ✅ ไม่ต้องใช้ Page Access Token
 * ✅ ทำงานกับ URL หลายรูปแบบ:
 *    - https://www.facebook.com/share/p/XXX/
 *    - https://www.facebook.com/{page}/posts/{id}
 *    - https://www.facebook.com/photo/?fbid={id}
 *    - https://www.facebook.com/permalink.php?story_fbid={id}&id={page}
 *
 * ❌ ไม่รองรับ private/friends-only posts, posts in closed groups
 * ⚠️ FB อาจ block IP ของ Apps Script เป็นช่วง — fallback ใช้ "paste URL รูป" แทน
 */
function handleImportFbShare_(data){
  const postUrl = String(data.postUrl||'').trim();
  if (!postUrl) return { ok:false, error:'Missing postUrl' };
  if (!/^https?:\/\/(www\.|m\.|web\.|mbasic\.)?facebook\.com\//i.test(postUrl)){
    return { ok:false, error:'ต้องเป็น URL จาก facebook.com' };
  }

  try {
    const fetched = fetchFbHtmlMulti_(postUrl);
    if (!fetched.html) {
      return { ok:false, error:'ดึง HTML จาก URL นี้ไม่ได้ (FB อาจ block หรือโพสต์ private) — sources: ' + fetched.sources.join(', ') };
    }

    const caption = extractOgDescription_(fetched.html) || extractOgTitle_(fetched.html) || '';

    // รวมรูปจากทุกแหล่ง: จัดกลุ่มตาม photo id แล้วเลือก "ขนาดใหญ่สุด" ต่อรูป
    // (เดิมเอาอันแรกที่เจอ — ถ้าเจอ thumbnail ก่อน full-size รูปนั้นจะได้ขนาดเล็ก หรือถูกกรองทิ้ง)
    const best = {};    // photoKey -> { url, score }
    const order = [];   // รักษาลำดับการพบรูปครั้งแรก
    function consider(u){
      const url = decodeHtmlEntities_(String(u || ''));
      if (!/^https?:\/\//i.test(url)) return;
      const key = fbPhotoKey_(url);
      const score = fbPhotoSizeScore_(url);
      if (!(key in best)){ best[key] = { url, score }; order.push(key); }
      else if (score > best[key].score){ best[key] = { url, score }; }
    }
    extractOgImages_(fetched.html).forEach(consider);
    extractFbcdnImages_(fetched.html).forEach(consider);
    const merged = order.map(k => best[k].url);

    if (!merged.length){
      return { ok:false, error:'ไม่พบรูปในโพสต์ — โพสต์อาจ private หรือ FB เปลี่ยน markup ลองวาง URL รูปตรง ๆ แทน' };
    }

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const items = [];
    const errors = [];
    const limit = Math.min(merged.length, CONFIG.MAX_FILES_PER_REQUEST);
    for (let i = 0; i < limit; i++){
      try {
        items.push(fetchAndSave_(merged[i], folder, 'fbshare_' + i));
      } catch(e){
        errors.push({ url: merged[i], error: String(e).slice(0, 200) });
      }
    }

    if (!items.length){
      return { ok:false, error: 'พบ URL รูป ' + merged.length + ' อัน แต่ดาวน์โหลดไม่สำเร็จ: ' +
               (errors[0] && errors[0].error || 'unknown') };
    }
    // found = จำนวนรูปที่ "พบ" (อาจ > items ถ้าบางอันโหลดไม่ผ่าน), sources = แหล่ง HTML ที่ดึงได้ (ไว้ debug)
    return { ok:true, items, errors, message: caption, found: merged.length, sources: fetched.sources };

  } catch(e){
    return { ok:false, error: String(e) };
  }
}

/**
 * Fetch HTML ของ FB URL จาก "หลายแหล่ง" แล้วต่อกัน เพื่อให้ extractor เห็นรูปครบที่สุด
 *   - browser UA บน www       → มัก embed photo URLs (t39.30808-6) ใน JSON ของหน้า (ได้หลายรูป)
 *   - facebookexternalhit     → og:image + caption ที่สะอาด (มักได้รูป cover 1 รูป)
 *   - mbasic.facebook.com     → server-rendered (ถ้าเข้าถึงได้โดยไม่ต้อง login)
 * ต่อ HTML ทุกแหล่งเข้าด้วยกัน — เพราะขั้น extract มี dedup อยู่แล้ว ซ้ำได้ไม่เป็นไร
 * return { html, sources } — sources ไว้ debug ว่าดึงจากไหนได้/ไม่ได้
 */
function fetchFbHtmlMulti_(url){
  const browserUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
  const mobileUA  = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const crawlerUA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  const mbasicUrl = url.replace(/:\/\/(www\.|web\.|m\.)?facebook\.com/i, '://mbasic.facebook.com');

  const targets = [
    { tag:'browser', url: url, ua: browserUA },
    { tag:'crawler', url: url, ua: crawlerUA }
  ];
  if (mbasicUrl !== url) targets.push({ tag:'mbasic', url: mbasicUrl, ua: mobileUA });

  let combined = '';
  const sources = [];
  for (const t of targets){
    try {
      const resp = UrlFetchApp.fetch(t.url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          'User-Agent': t.ua,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
        }
      });
      const code = resp.getResponseCode();
      if (code !== 200){ sources.push(t.tag + ':HTTP' + code); continue; }
      const text = resp.getContentText();
      if (/og:image|scontent[-\w]*\.fbcdn\.net/i.test(text)){
        combined += '\n<!--' + t.tag + '-->\n' + text;
        sources.push(t.tag + ':ok(' + text.length + ')');
      } else {
        sources.push(t.tag + ':no-img');
      }
    } catch(e){ sources.push(t.tag + ':err'); }
  }
  return { html: combined, sources: sources };
}

/**
 * Extract og:image / og:image:secure_url URLs จาก HTML
 * Match ทั้งกรณี property มาก่อน content หรือกลับกัน
 */
function extractOgImages_(html){
  const urls = [];
  const seen = {};
  function addUrl(u){
    let url = decodeHtmlEntities_(u);
    if (!/^https?:\/\//i.test(url)) return;
    if (seen[url]) return;
    seen[url] = true;
    urls.push(url);
  }
  // property first
  const re1 = /<meta[^>]+property=["'](?:og:image(?::secure_url|:url)?)["'][^>]+content=["']([^"']+)["']/gi;
  let m;
  while ((m = re1.exec(html)) !== null) addUrl(m[1]);
  // content first
  const re2 = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og:image(?::secure_url|:url)?)["']/gi;
  while ((m = re2.exec(html)) !== null) addUrl(m[1]);
  return urls;
}

/**
 * หา scontent.fbcdn.net image URLs ใน HTML/JSON body
 * - unescape \/ และ & ก่อน (FB embed รูปใน JSON ที่ escape ไว้ — ต้อง decode ให้ signature ถูก)
 * - เก็บเฉพาะ "รูปที่โพสต์" (path code t39.30808-6) → ตัด avatar/sticker/cover/UI ออกแม่นยำ
 *   โดยไม่ต้องเดาจากขนาด (กันการทิ้งรูปจริงที่บังเอิญมาเป็นขนาดกลาง)
 */
function extractFbcdnImages_(html){
  const text = String(html).replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
  const urls = [];
  const seen = {};
  const re = /https?:\/\/scontent[-\w.]*\.fbcdn\.net\/v\/[^"'\s\\)]+/gi;
  let m;
  while ((m = re.exec(text)) !== null){
    let u = decodeHtmlEntities_(m[0]).replace(/[",}\]>]+$/, '');  // ตัด junk ท้าย
    if (seen[u]) continue;
    seen[u] = true;
    if (!/\/t39\.30808-6\//.test(u)) continue;   // เฉพาะรูปที่โพสต์ในไทม์ไลน์/โพสต์
    urls.push(u);
    if (urls.length >= 60) break;
  }
  return urls;
}

/**
 * คืน "คีย์รูป" สำหรับ dedup — FB ตั้งชื่อไฟล์เป็น {id}_{id}_{id}_suffix.jpg
 * รูปเดียวกันต่างขนาด/ต่าง CDN node จะมีชุด id เดียวกัน → ถือเป็นรูปเดียว
 */
function fbPhotoKey_(url){
  const m = url.match(/\/(\d{6,}_\d{6,}_\d{3,})/);
  if (m) return m[1];
  return url.split('?')[0];   // fallback: path ไม่รวม query string
}

/**
 * คะแนนขนาดรูป — ใช้เลือก URL ที่ใหญ่ที่สุดของรูปเดียวกัน
 * URL ที่ไม่มี marker sNNxNN/pNNxNN = original (คะแนนสูงสุด)
 */
function fbPhotoSizeScore_(url){
  const m = url.match(/[\/_](?:s|p|c)(\d{2,4})x(\d{2,4})[\/_]/);
  if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
  return 1e9;  // ไม่มี size marker = ขนาดเต็ม
}

function extractOgDescription_(html){
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  return m ? decodeHtmlEntities_(m[1]) : '';
}
function extractOgTitle_(html){
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  return m ? decodeHtmlEntities_(m[1]) : '';
}
function decodeHtmlEntities_(s){
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x3a;/gi, ':')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

/* ═════════════════════════ Import from FB post URL ═════════════════════════ */
/**
 * รับ URL โพสต์ FB → Graph API → ดึงรูปทั้งหมด → save Drive → return items
 * ใช้ Page Access Token ที่บันทึกไว้ใน Script Properties (action setFbCreds)
 */
function handleImportFbPost_(data){
  const postUrl = String(data.postUrl||'').trim();
  if (!postUrl) return { ok:false, error:'Missing postUrl' };

  const token = getFbToken_();
  if (!token) return { ok:false, error:'ยังไม่ได้ตั้ง Facebook Page Access Token (ตั้งใน Site Settings)' };

  let postId = parseFbPostUrl_(postUrl);

  // share/p/ และ pfbid: ลอง resolve หลายวิธี
  if (!postId) {
    // วิธี 1: follow HTTP redirect → parse URL ที่ได้
    const redirected = resolveShareUrl_(postUrl);
    if (redirected) postId = parseFbPostUrl_(redirected);
  }
  if (!postId) {
    // วิธี 2: ถาม Graph API /?id= ให้ resolve → ได้ numeric ID จาก og_object
    postId = resolveViaGraphApi_(postUrl, token);
  }

  if (!postId) return {
    ok: false,
    error: 'ไม่สามารถดึง post ID จาก URL นี้ได้ — ลองใช้ "ดูโพสต์ล่าสุดของ Page" แทน'
  };

  return fetchFbPostImages_(postId, token);
}

/** Follow HTTP redirect จาก share URL (สูงสุด 3 hop) → return URL ที่มี numeric post ID */
function resolveShareUrl_(shareUrl) {
  try {
    let current = shareUrl;
    for (let i = 0; i < 3; i++) {
      const resp = UrlFetchApp.fetch(current, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; facebookexternalhit/1.1)' }
      });
      const code = resp.getResponseCode();
      if (code < 300 || code >= 400) break;
      const allH = resp.getAllHeaders();
      let next = null;
      for (const k in allH) { if (k.toLowerCase() === 'location') { next = allH[k]; break; } }
      if (!next) break;
      if (parseFbPostUrl_(next)) return next;
      current = next;
    }
  } catch(e) { console.warn('resolveShareUrl_: ' + e); }
  return null;
}

/** ถาม Graph API /?id=URL → return numeric ID จาก og_object.id (ถ้ามี) */
function resolveViaGraphApi_(shareUrl, token) {
  try {
    const url = 'https://graph.facebook.com/' + CONFIG.FB_GRAPH_VERSION +
                '/?id=' + encodeURIComponent(shareUrl) +
                '&fields=id,og_object' +
                '&access_token=' + encodeURIComponent(token);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    const body = JSON.parse(resp.getContentText() || '{}');
    // body.id อาจเป็น URL เอง — ตรวจว่า numeric หรือไม่
    if (/^\d+$/.test(String(body.id || ''))) return String(body.id);
    // og_object.id เป็น numeric object ID ของ FB
    if (body.og_object && /^\d+$/.test(String(body.og_object.id || ''))) return String(body.og_object.id);
  } catch(e) { console.warn('resolveViaGraphApi_: ' + e); }
  return null;
}

/* ═════════════════════════ List recent FB posts ═════════════════════════ */
/**
 * โหลดโพสต์ล่าสุด 25 อันของ Page (สำหรับให้ admin เลือกใน UI)
 */
function handleListFbPosts_(data){
  const token = getFbToken_();
  const pageId = getFbPageId_();
  if (!token || !pageId) return { ok:false, error:'ยังไม่ได้ตั้ง FB Page ID + Token (ตั้งใน Site Settings)' };

  try {
    // ⚠️ ต้อง encodeURIComponent ทั้ง fields เพราะมี { } ที่ Apps Script UrlFetchApp ไม่ยอมรับใน URL ดิบ
    const fields = encodeURIComponent('id,message,created_time,full_picture,attachments{media}');
    const url = 'https://graph.facebook.com/' + CONFIG.FB_GRAPH_VERSION + '/' + encodeURIComponent(pageId) +
                '/posts?fields=' + fields + '&limit=25' +
                '&access_token=' + encodeURIComponent(token);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
    const body = JSON.parse(resp.getContentText() || '{}');
    if (resp.getResponseCode() !== 200){
      return { ok:false, error: 'FB API: ' + (body.error && body.error.message || resp.getResponseCode()) };
    }
    const posts = (body.data || []).map(p => ({
      id: p.id,
      message: (p.message || '').slice(0, 200),
      created_time: p.created_time,
      thumb: p.full_picture || (p.attachments && p.attachments.data && p.attachments.data[0] && p.attachments.data[0].media && p.attachments.data[0].media.image && p.attachments.data[0].media.image.src) || ''
    }));
    return { ok:true, posts };
  } catch(e){
    return { ok:false, error: String(e) };
  }
}

/* ═════════════════════════ Set/Get FB credentials ═════════════════════════ */
function handleSetFbCreds_(data){
  const props = PropertiesService.getScriptProperties();
  if (typeof data.fbPageId === 'string') props.setProperty('FB_PAGE_ID', data.fbPageId.trim());
  if (typeof data.fbToken === 'string' && data.fbToken.trim()) props.setProperty('FB_PAGE_TOKEN', data.fbToken.trim());
  if (data.clearToken === true) props.deleteProperty('FB_PAGE_TOKEN');
  return { ok:true };
}
function handleFbCredsStatus_(data){
  const props = PropertiesService.getScriptProperties();
  // ส่งกลับเฉพาะ Page ID (ไม่ลับ) + flag ว่ามี token หรือยัง — ไม่ส่ง token จริง
  return {
    ok: true,
    pageId: props.getProperty('FB_PAGE_ID') || '',
    hasToken: !!props.getProperty('FB_PAGE_TOKEN')
  };
}
function getFbToken_(){
  return PropertiesService.getScriptProperties().getProperty('FB_PAGE_TOKEN') || '';
}
function getFbPageId_(){
  return PropertiesService.getScriptProperties().getProperty('FB_PAGE_ID') || '';
}

/* ═════════════════════════ Helpers ═════════════════════════ */
/**
 * Fetch URL → save to Drive folder → return { id, url, name }
 * ใช้สำหรับทั้ง direct URL และรูปจาก FB attachments
 *
 * 📌 ตรวจ image จาก 3 แหล่ง (ผ่านอันใดอันหนึ่งก็พอ):
 *    1) Content-Type response header
 *    2) นามสกุลใน URL (.jpg, .png, .webp, .gif)
 *    3) Magic number (byte signature) ที่จุดเริ่มไฟล์
 *    เพราะ Facebook/Instagram CDN บางครั้งส่ง Content-Type เป็น application/octet-stream
 *    หรือไม่ส่งเลย
 */
function fetchAndSave_(url, folder, namePrefix){
  const resp = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KrulailaBot/1.0)' }
  });
  const code = resp.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);

  const blob = resp.getBlob();
  const bytes = blob.getBytes();
  if (!bytes || !bytes.length) throw new Error('Empty response');
  if (bytes.length > CONFIG.MAX_FILE_BYTES) {
    throw new Error('File too large (' + bytes.length + ' bytes, max ' + CONFIG.MAX_FILE_BYTES + ')');
  }

  // 1) Content-Type
  const headerMime = blob.getContentType() || '';
  // 2) URL extension
  const extMatch = url.toLowerCase().match(/\.(jpe?g|png|webp|gif|bmp)(?:\?|#|$)/);
  // 3) Magic number
  const sniffed = sniffImageMime_(bytes);

  let mime = '';
  if (/^image\//.test(headerMime)) mime = headerMime;
  else if (sniffed) mime = sniffed;
  else if (extMatch) mime = 'image/' + (extMatch[1] === 'jpg' ? 'jpeg' : extMatch[1]);

  if (!mime){
    throw new Error('Not an image (Content-Type=' + (headerMime||'(none)') +
                    ', first bytes=' + bytesPreview_(bytes) + ')');
  }

  const ext = (mime.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 6);
  const name = sanitizeName_(namePrefix + '_' + Date.now() + '.' + ext);
  // สร้าง blob ใหม่พร้อม MIME ที่ถูกต้อง (กรณี origin ส่งมาผิด)
  const fixedBlob = Utilities.newBlob(bytes, mime, name);
  const file = folder.createFile(fixedBlob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(se) { console.warn('setSharing: ' + se); }
  const id = file.getId();
  return {
    id: id,
    url: 'https://lh3.googleusercontent.com/d/' + id + '=s1200',
    name: file.getName()
  };
}

/** ตรวจ image type จาก first bytes (magic numbers) — return MIME หรือ null */
function sniffImageMime_(bytes){
  if (!bytes || bytes.length < 12) return null;
  // unsigned ใน Apps Script: bytes เป็น signed int, แปลง & 0xFF
  const b = i => bytes[i] & 0xFF;
  // JPEG: FF D8 FF
  if (b(0)===0xFF && b(1)===0xD8 && b(2)===0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b(0)===0x89 && b(1)===0x50 && b(2)===0x4E && b(3)===0x47) return 'image/png';
  // GIF: GIF87a / GIF89a
  if (b(0)===0x47 && b(1)===0x49 && b(2)===0x46 && b(3)===0x38) return 'image/gif';
  // WebP: RIFF ???? WEBP
  if (b(0)===0x52 && b(1)===0x49 && b(2)===0x46 && b(3)===0x46 &&
      b(8)===0x57 && b(9)===0x45 && b(10)===0x42 && b(11)===0x50) return 'image/webp';
  // BMP: BM
  if (b(0)===0x42 && b(1)===0x4D) return 'image/bmp';
  return null;
}
/** สรุป first bytes เป็น hex string สั้น ๆ ไว้ใส่ใน error message */
function bytesPreview_(bytes){
  const n = Math.min(8, bytes.length);
  let s = '';
  for (let i=0; i<n; i++){
    const h = (bytes[i] & 0xFF).toString(16).padStart(2,'0');
    s += (i?' ':'') + h;
  }
  return s.toUpperCase();
}

/**
 * Pull all image URLs from a Facebook post via Graph API, then save to Drive.
 * postId — numeric post ID (share/pfbid URLs ถูก resolve ใน handleImportFbPost_ ก่อนแล้ว)
 */
function fetchFbPostImages_(postId, token){
  try {
    // subattachments.limit(50) — ดึงสูงสุด 50 รูปต่อโพสต์ (default ของ FB คือ ~10)
    const fields = encodeURIComponent('message,full_picture,attachments{media,subattachments.limit(50){media}}');
    const url = 'https://graph.facebook.com/' + CONFIG.FB_GRAPH_VERSION + '/' + encodeURIComponent(postId) +
                '?fields=' + fields +
                '&access_token=' + encodeURIComponent(token);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
    const code = resp.getResponseCode();
    const body = JSON.parse(resp.getContentText() || '{}');
    if (code !== 200){
      return { ok:false, error:'FB API: ' + (body.error && body.error.message || code) };
    }

    const seen = {};
    const urls = [];
    function addUrl(src){ if (src && !seen[src]){ seen[src]=1; urls.push(src); } }

    function walk(att){
      if (!att) return;
      const subs = att.subattachments && att.subattachments.data;
      if (subs && subs.length) {
        // album wrapper — ดึงรูปจาก sub เท่านั้น (ข้าม thumbnail cover ที่ซ้ำ)
        subs.forEach(walk);
      } else if (att.media && att.media.image && att.media.image.src) {
        addUrl(att.media.image.src);
      }
    }
    if (body.attachments && body.attachments.data){
      body.attachments.data.forEach(walk);
    }
    // Fallback — บางโพสต์มีแค่ full_picture
    if (!urls.length && body.full_picture) addUrl(body.full_picture);
    if (!urls.length) return { ok:false, error:'ไม่พบรูปในโพสต์นี้' };

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const items = [];
    const errors = [];
    const limit = Math.min(urls.length, CONFIG.MAX_FILES_PER_REQUEST);
    for (let i = 0; i < limit; i++){
      try { items.push(fetchAndSave_(urls[i], folder, 'fbpost_' + i)); }
      catch(e){ errors.push({ url: urls[i], error: String(e).slice(0, 200) }); }
    }
    return { ok:true, items, errors, message: body.message || '', found: urls.length };

  } catch(e){
    return { ok:false, error: String(e) };
  }
}

/**
 * Parse Facebook post URL → return post ID for Graph API.
 * Supported patterns:
 *   /posts/{numeric_id}
 *   /photo/?fbid={id}
 *   /permalink.php?story_fbid={id}&id={page_id}
 *   /videos/{id}
 *   /{page_id}/posts/{id}
 * Returns null for pfbid (encrypted) URLs — those can't be queried directly.
 */
function parseFbPostUrl_(url){
  // /posts/{numeric}
  let m = url.match(/\/posts\/(\d+)/);
  if (m) return m[1];
  // /videos/{numeric}
  m = url.match(/\/videos\/(\d+)/);
  if (m) return m[1];
  // permalink.php
  m = url.match(/[?&]story_fbid=(\d+)/);
  if (m){
    const idMatch = url.match(/[?&]id=(\d+)/);
    if (idMatch) return idMatch[1] + '_' + m[1];
    return m[1];
  }
  // photo with fbid
  m = url.match(/[?&]fbid=(\d+)/);
  if (m) return m[1];
  // bare numeric
  m = url.match(/\/(\d{10,})(?:\/|$|\?)/);
  if (m) return m[1];
  return null;
}

/**
 * Verify Firebase ID Token using Firebase Identity Toolkit (accounts:lookup).
 *
 * 📌 ทำไมไม่ใช้ oauth2.googleapis.com/tokeninfo:
 *    เพราะ tokeninfo ใช้กับ Google OAuth ID tokens (ออกโดย Google's main key)
 *    ส่วน Firebase ID tokens ถูก sign ด้วย project-specific keys
 *    ดังนั้น tokeninfo จะตีกลับ HTTP 400 เสมอ
 *
 * 📌 Identity Toolkit accounts:lookup รับ idToken แล้ว return user info
 *    ถ้า token valid → 200 + users[]
 *    ถ้า invalid/expired/wrong audience → 400 พร้อม error message
 *
 * Returns { ok:true, uid, email } or { ok:false, error }.
 */
function verifyFirebaseIdToken_(idToken){
  try{
    if (!CONFIG.FIREBASE_WEB_API_KEY) {
      return { ok:false, error:'Missing FIREBASE_WEB_API_KEY in CONFIG' };
    }
    const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
                encodeURIComponent(CONFIG.FIREBASE_WEB_API_KEY);
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const body = JSON.parse(resp.getContentText() || '{}');

    if (code !== 200){
      const msg = body.error && body.error.message ? body.error.message : ('HTTP ' + code);
      return { ok:false, error: 'identitytoolkit: ' + msg };
    }
    const users = body.users || [];
    if (!users.length) return { ok:false, error:'No user in response' };
    const u = users[0];
    return { ok:true, uid: u.localId || '', email: u.email || '' };
  }catch(e){
    return { ok:false, error:String(e) };
  }
}
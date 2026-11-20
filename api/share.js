/* api/share.js — หน้าสำหรับแชร์ลิงก์ประกาศ (/l/{id}) ให้บอท Facebook / LINE / Messenger อ่าน og:* ได้
   บอทไม่รัน JavaScript และไม่อ่านส่วนหลัง # → ฟังก์ชันนี้ดึงประกาศจาก Firestore (REST, อ่านสาธารณะตาม Rules)
   แล้วตอบ HTML ที่มี meta ครบ · ผู้เข้าชมจริงถูกส่งต่อไป /#/listing/{id} ทันที
   ไม่เปิดเผย: ฉบับร่าง, ที่ดินที่ขายแล้ว (ซ่อนจากเว็บ), พิกัด */
const PROJECT = 'laila-18024';
const API_KEY = 'AIzaSyAoMKMzM1-Ya6FF5M649IslWo_eNtQBSQg';   // web key ชุดเดียวกับ window.firebaseConfig (เป็นค่าสาธารณะอยู่แล้ว)
const SITE = 'ครูไลลาขายบ้านและที่ดิน';
const DEF_DESC = 'รวมประกาศขายบ้าน ที่ดิน คอนโด อาคารพาณิชย์ พร้อมแผนที่และรูปภาพจริง';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function val(v){   // แปลงค่า Firestore REST → JS
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  return undefined;
}
function fields(f){ const o = {}; for (const k in f) o[k] = val(f[k]); return o; }

function driveURL(u){   // เหมือน normalizeDriveImageURL ฝั่งเว็บ
  if (!u) return '';
  try{
    if (u.includes('uc?') || u.includes('/open?')){ const id = new URL(u).searchParams.get('id'); if (id) return `https://lh3.googleusercontent.com/d/${id}=s1200`; }
    const m = u.match(/\/file\/d\/([^/]+)/); if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=s1200`;
  } catch {}
  return u;
}
function coverURL(it){
  const list = Array.isArray(it.imageObjs) ? it.imageObjs.map(o => o && o.url) : (Array.isArray(it.imageURLs) ? it.imageURLs : []);
  const u = driveURL(list.find(Boolean) || '');
  return /^https:\/\//i.test(u) ? u : '';
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  const proto = 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const origin = /^[\w.-]+(:\d+)?$/.test(host) ? `${proto}://${host}` : '';
  const dest = '/#/listing/' + encodeURIComponent(id);

  let title = SITE, desc = DEF_DESC, image = '';
  if (/^[\w-]{1,64}$/.test(id)){
    try{
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings/${id}?key=${API_KEY}`);
      if (r.ok){
        const it = fields((await r.json()).fields || {});
        const st = it.status || 'available';
        const hidden = st === 'draft' || (st === 'sold' && /ที่ดิน/.test(it.type || ''));
        if (!hidden){
          title = String(it.title || 'ประกาศ').slice(0, 120);
          const price = Number(it.price) > 0 ? '฿' + Number(it.price).toLocaleString('en-US') + (it.listingMode === 'rent' ? ' / เดือน' : '') : '';
          const head = [price, it.type].filter(Boolean).join(' · ');
          desc = (head + (head ? ' · ' : '') + String(it.desc || '')).replace(/\s+/g, ' ').trim().slice(0, 200) || DEF_DESC;
          image = coverURL(it);
        }
      }
    } catch {}
  }

  const url = origin + '/l/' + encodeURIComponent(id);
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>${esc(title)} | ${esc(SITE)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE)}">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta property="og:image:width" content="1200">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(image)}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="canonical" href="${esc(origin + dest)}">
<noscript><meta http-equiv="refresh" content="0;url=${esc(dest)}"></noscript>
<script>location.replace(${JSON.stringify(dest)});</script>
</head><body><p><a href="${esc(dest)}">${esc(title)}</a></p></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(html);
};

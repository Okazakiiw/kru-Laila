/* Design preview — sample data + tiny render helpers.
   รูปใช้รูปจริงจากประกาศบน Firestore (Google Drive) — ข้อมูลบางรายการเป็น "ตัวอย่าง" เพื่อให้เห็นครบทุกสถานะ/ประเภท */
const G = (id) => `https://lh3.googleusercontent.com/d/${id}=s1200`;
const H1 = ['1U16jkdgwtJKGtneoyP_tKXOD_m6Lu0u4','1aEbMuN1Yp3TMXL0O3I6BH4mMSXqkmSTG','1D4IoCuUnXT4VEINCqyLUK60sG-3Zxupl','1dZ5MSG3487qCLFhl1b0N-Je-uW8-FNuL','12zppB9n6fs4l8-16O8Nh24yq5OJ0ICkH','1nQPy1ZQiShN4lryZLLoQ37LjSBEdubwK','12gK0rNSTfCJxjs0fyTTVwW5Htc7Jrw94','1UraV6iP9WSmcj2P00jVFpEb3jGssNFe3','1aHv3p5uDSmXSVPlAXAMehoYLFN7c9os4'].map(G);
const H2 = ['1tnY0FJibitPfV7R4XwXjSbjb2fO8vZLV'].map(G);
const LA = ['1tOowK-dA8seMAQ9dcSF2qhgOl8-MgOWX','1FO9-DTzepw2FcKSLUCdsxFEr-vvi26d0','12yJKokrjBMbsy_47Wi1m7A5WQrDP2Gbb'].map(G);
const LB = ['1rhPbVTA4D1AnxH8WgrBgATwywStgxJbo','1ssjZAZnYLIPMENLGtbxmeUyNtDWXME4k','1Q4FdsHMaJ94Yc9ixEQhUzL5kquaNdsvS'].map(G);
const LC = ['1jmPMAbe1chPvePUBox794DkkR4EeuScc','1VUt1gHH5kY4aQB-uFsbADpy8wrmn-Y7r','1QkvXKL-QHoXH7XF9LnxrLP1lBNiJaCAP'].map(G);

const ITEMS = [
  { id:'a1', title:'บ้านเดี่ยวทรงโมเดิร์น หน้ากว้าง 10 ม.', type:'บ้าน', listingMode:'sale', status:'available', price:2200000, bedrooms:3, bathrooms:3, usableArea:140, landSize:50, parking:2, views:48, pinned:true, created:'2026-11-12', imgs:H1 },
  { id:'a2', title:'ที่ดิน 1 ไร่ 41 ตร.วา ถนนฆูวอ สะเตงนอก', type:'ที่ดิน', listingMode:'sale', status:'available', price:700000, landSize:441, views:31, pinned:true, created:'2026-11-03', imgs:LA },
  { id:'a3', title:'บ้านเดี่ยวทรงปั้นหยา 60 ตร.วา ดีไซน์ร่วมสมัย', type:'บ้าน', listingMode:'sale', status:'reserved', price:1000000, bedrooms:3, bathrooms:2, usableArea:96, landSize:60, parking:1, views:27, pinned:true, created:'2026-10-20', imgs:H2.concat(H1.slice(3)) },
  { id:'a4', title:'คอนโด 1 ห้องนอน ใกล้ตัวเมือง (ตัวอย่าง)', type:'คอนโด', listingMode:'rent', status:'available', price:8500, priceUnit:'ต่อเดือน', bedrooms:1, bathrooms:1, usableArea:32, views:19, created:'2026-10-05', imgs:[H1[5],H1[6]] },
  { id:'a5', title:'ที่ดิน 1 งาน 66.5 ตร.วา พร้อมโอน', type:'ที่ดิน', listingMode:'sale', status:'available', price:1100000, landSize:166.5, views:22, created:'2026-09-14', imgs:LB },
  { id:'a6', title:'ทาวน์เฮาส์ 2 ชั้น ตกแต่งพร้อมอยู่ (ตัวอย่าง)', type:'บ้าน', listingMode:'rent', status:'available', price:12000, priceUnit:'ต่อเดือน', bedrooms:2, bathrooms:2, usableArea:110, views:14, created:'2026-08-30', imgs:[H1[2],H1[7]] },
  { id:'a7', title:'ที่ดิน 1 งาน 50 ตร.วา ข้างปั๊ม ปตท.', type:'ที่ดิน', listingMode:'sale', status:'sold', price:385000, landSize:150, views:39, created:'2026-07-11', imgs:LC },
  { id:'a8', title:'บ้านชั้นเดียว พร้อมอยู่ (ตัวอย่าง)', type:'บ้าน', listingMode:'sale', status:'sold', price:1650000, bedrooms:2, bathrooms:1, usableArea:88, landSize:52, views:11, created:'2026-06-12', imgs:[H1[8],H1[1]] },
  { id:'a9', title:'คอนโด 2 ห้องนอน วิวเมือง (ตัวอย่าง)', type:'คอนโด', listingMode:'sale', status:'available', price:1890000, bedrooms:2, bathrooms:1, usableArea:48, views:8, created:'2026-06-02', imgs:[H1[4],H1[0]] },
];
const STATUS = { available:'เปิดขาย', reserved:'จองแล้ว', sold:'ขายแล้ว', draft:'ฉบับร่าง' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ic = (n, cls='') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const trim0 = (x) => String(+x.toFixed(2));
/* ราคาอ่านง่าย: 2.2 ล้าน · 7 แสน · ฿8,500/ด. */
function priceParts(it){
  const p = +it.price || 0;
  if (!p) return { n:'สอบถาม', u:'' };
  if (it.listingMode === 'rent') return { n:'฿' + p.toLocaleString('th-TH'), u:'/ด.' };
  if (p >= 1e6) return { n:trim0(p/1e6), u:'ล้าน' };
  if (p >= 1e5) return { n:trim0(p/1e5), u:'แสน' };
  return { n:'฿' + p.toLocaleString('th-TH'), u:'' };
}
const priceHTML = (it) => { const q = priceParts(it); return `${q.n}${q.u ? `<span class="u">${q.u}</span>` : ''}`; };
function shortPrice(it){ const p=+it.price||0; if (p>=1e6) return trim0(p/1e6)+'M'; if (p>=1e3) return trim0(p/1e3)+'K'; return String(p); }
const statusHTML = (s) => `<span class="status"><span class="dot ${s}"></span>${STATUS[s]}</span>`;
function specsHTML(it){
  const b = [];
  if (it.bedrooms)   b.push(`<span>${ic('bed')}${it.bedrooms}</span>`);
  if (it.bathrooms)  b.push(`<span>${ic('bath')}${it.bathrooms}</span>`);
  if (it.usableArea) b.push(`<span>${ic('maximize')}${it.usableArea} ตร.ม.</span>`);
  if (it.landSize)   b.push(`<span>${ic('land-plot')}${it.landSize} ตร.วา</span>`);
  return `<div class="specs">${b.join('')}</div>`;
}
function cardHTML(it, i){
  return `<article class="lcard reveal${it.status==='sold'?' is-sold':''}" style="--i:${i}">
    <div class="ph"><img src="${esc(it.imgs[0])}" alt="" loading="lazy"><span class="chip on-img">${statusHTML(it.status)}</span></div>
    <button class="icon-btn fav" aria-pressed="${i===1}" aria-label="บันทึกรายการโปรด">${ic('heart')}</button>
    <div class="body">
      <div class="meta"><span>${esc(it.type)} · ${it.listingMode==='rent'?'เช่า':'ขาย'}</span><span>${ic('eye','ic-sm')} ${it.views}</span></div>
      <div class="price">${priceHTML(it)}</div>
      <a class="t stretch" href="listing.html">${esc(it.title)}</a>
      ${specsHTML(it)}
    </div>
  </article>`;
}
/* กราฟเส้นบาง: การกระจายราคา (เรียงจากต่ำไปสูง) */
function sparkSVG(prices){
  const w=280, h=44, pad=4;
  const s = prices.slice().sort((a,b)=>a-b);
  if (s.length === 1) s.unshift(s[0]);
  const min=s[0], max=s[s.length-1], span=(max-min)||1;
  const pts = s.map((v,i)=>[pad + i*(w-2*pad)/(s.length-1), h-pad-((v-min)/span)*(h-2*pad)]);
  const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#fff" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`;
}
/* ตัวเลขนับขึ้น */
function countUp(root=document){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec||0);
    const fmt = (v) => v.toLocaleString('th-TH', { minimumFractionDigits:dec, maximumFractionDigits:dec });
    if (reduce){ el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const tick = (t) => { const k = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-k,3); el.textContent = fmt(to*e); if (k<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

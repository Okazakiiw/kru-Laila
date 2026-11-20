/* ============================================================================
   pages/listing.js — #/listing/{id}  หน้าประกาศเต็ม
   bento gallery + lightbox · title/chips/specs/desc/mini map · price card (sticky)
   ติดต่อ · คัดลอกลิงก์ · แชร์ · หัวใจ · คำนวณค่างวด · ฟอร์มฝากข้อมูล · ประกาศใกล้เคียง
   ลิงก์เดิม index.html#/listing/{id} ใช้ได้เหมือนเดิม · ฉบับร่างเปิดผ่านลิงก์ตรงไม่ได้
============================================================================ */
import { create, safeUrl, safePhoneTel, toast, copyText } from '../core/dom.js';
import { STATUS_LABEL, MODE_LABEL, pricePerArea, isNewListing, isHotListing, fmtPostDate, fmtInt, baht, priceText } from '../core/format.js';
import { getImageURLs } from '../data/images.js';
import { publicCoords, mapLink } from '../data/geo.js';
import { bumpView, effectivePinned, similarPool, submitLead } from '../data/listings.js';
import { store } from '../store.js';
import { setMeta, baseUrl } from '../seo.js';
import { goBack } from '../router.js';
import { icon } from '../ui/icons.js';
import { statusEl, chip, priceEl, imgEl, favButton, listingCard, emptyState, listingHref } from '../ui/components.js';
import { openLightbox } from '../ui/lightbox.js';
import { loanWidget } from '../ui/loan.js';
import { ensureLeaflet, monoTiles, newMap, thumbPinIcon, approxCircle } from '../ui/map.js';

export function mount(root, { id }){
  let shownId = null;   // วาดแล้ว → อัปเดต real-time ไม่วาดใหม่ (กันแกลเลอรี/ฟอร์มที่พิมพ์ค้างรีเซ็ต)
  let miniMap = null;
  let viewsEl = null;
  let sticky = null;

  const find = () => store.items.find(x => x.id === id && (x.status || 'available') !== 'draft');

  function skeleton(){
    setMeta({ title:'ประกาศ', hash: location.hash });
    root.textContent = '';
    root.append(
      create('div', { class:'crumbs' }, create('div', { class:'skel line', style:{ width:'200px', marginTop:'0' } })),
      create('div', { class:'skel', style:{ height:'min(520px, 75vw)', borderRadius:'28px' } }),
      create('div', { class:'skel line lg', style:{ width:'60%', marginTop:'24px' } }),
      create('div', { class:'skel line', style:{ width:'40%' } })
    );
  }

  function notFound(){
    root.textContent = '';
    if (sticky){ sticky.remove(); sticky = null; }
    root.appendChild(create('section', { class:'nf' }, [
      emptyState({ art:'house', title:'ไม่พบประกาศนี้', text:'อาจถูกลบ หรือปิดการขายไปแล้ว ลองดูประกาศอื่นที่ใกล้เคียงได้เลย',
        actions:[ create('a', { class:'btn', href:'#/' }, [ icon('house'), 'กลับหน้าแรก' ]), create('a', { class:'btn btn-white', href:'#/explore' }, [ icon('map'), 'ไปสำรวจ' ]) ] })
    ]));
    setMeta({ title:'ไม่พบประกาศ', hash: location.hash });
  }

  function render(it){
    root.textContent = '';
    shownId = it.id;
    const justCounted = bumpView(it);   // นับยอดดู (ครั้งเดียวต่อเครื่อง)
    const urls = getImageURLs(it);
    const st = it.status || 'available';
    const mode = it.listingMode === 'rent' ? 'rent' : 'sale';
    const listingUrl = location.origin + '/l/' + encodeURIComponent(it.id);   // ลิงก์แชร์: เซิร์ฟเวอร์ใส่ og:image ให้ Facebook/LINE อ่านได้ (/api/share.js)

    /* crumbs */
    root.appendChild(create('nav', { class:'crumbs', 'aria-label':'เส้นทาง' }, [
      create('button', { type:'button', class:'icon-btn', 'aria-label':'ย้อนกลับ', onclick: () => goBack('#/') }, icon('arrow-left')),
      create('a', { href:'#/', text:'หน้าแรก' }), create('span', { 'aria-hidden':'true', text:'/' }),
      create('span', { text: it.type || 'ประกาศ' })
    ]));

    /* gallery: mobile strip + desktop bento */
    root.appendChild(gallery(urls, it.title || ''));

    /* detail */
    const detail = create('div', { class:'detail' });
    const main = create('div', { class:'d-main' });
    main.appendChild(create('h1', { class:'d-title', text: it.title || '-' }));
    const chips = create('div', { class:'d-chips' }, [
      chip(statusEl(st), 'white'), chip(MODE_LABEL[mode], 'white'), it.type ? chip(it.type, 'white') : null
    ]);
    if (effectivePinned(it)) chips.appendChild(chip([icon('pin','ic-sm'), 'แนะนำ'], 'dark'));
    if (isNewListing(it)) chips.appendChild(chip('ใหม่', 'dark'));
    if (isHotListing(it)) chips.appendChild(chip([icon('flame','ic-sm'), 'ฮิต'], 'white'));
    const vc = (+it.views || 0) + (justCounted ? 1 : 0);
    viewsEl = create('span', { class:'num', text: fmtInt(vc) });
    chips.appendChild(chip([icon('eye','ic-sm'), 'เข้าชม ', viewsEl, ' ครั้ง'], 'white'));
    const postDate = fmtPostDate(it);
    if (postDate) chips.appendChild(chip([icon('calendar','ic-sm'), postDate], 'white'));
    main.appendChild(chips);

    const tiles = specTiles(it);
    if (tiles) main.appendChild(tiles);

    const rest = create('div', { class:'d-rest' });
    if (it.desc){
      const d = create('div', { class:'d-desc' });
      d.textContent = it.desc;
      const card = create('section', { class:'card', 'aria-labelledby':'descH' }, [ create('h2', { id:'descH', class:'card-title', text:'รายละเอียด' }), create('div', { style:{ marginTop:'12px' } }, d) ]);
      if (it.desc.length > 600){
        d.classList.add('clamp');
        const more = create('button', { type:'button', class:'btn btn-soft btn-sm', style:{ marginTop:'12px' }, text:'อ่านเพิ่มเติม', 'aria-expanded':'false',
          onclick: () => { const open = d.classList.toggle('clamp'); more.textContent = open ? 'อ่านเพิ่มเติม' : 'ย่อ'; more.setAttribute('aria-expanded', String(!open)); } });
        card.appendChild(more);
      }
      rest.appendChild(card);
    }
    const loc = locationCard(it);
    if (loc) rest.appendChild(loc);
    main.appendChild(rest);
    detail.appendChild(main);
    detail.appendChild(priceCard(it, listingUrl));
    root.appendChild(detail);

    /* similar */
    const sim = similarPool(it, store.items).slice(0, 4);
    if (sim.length){
      const grid = create('div', { class:'grid-cards' });
      sim.forEach((x, i) => grid.appendChild(listingCard(x, { i, anim:false })));
      root.appendChild(create('section', { class:'sec', 'aria-labelledby':'simH' }, [
        create('div', { class:'sec-head' }, [ create('div', {}, [ create('h2', { id:'simH', text:'ประกาศใกล้เคียง' }), create('div', { class:'label', text:`${it.type || ''} · ${MODE_LABEL[mode]} · ราคาใกล้เคียงกัน` }) ]) ]),
        grid
      ]));
    }

    /* mobile sticky contact */
    if (sticky) sticky.remove();
    sticky = stickyBar(it);
    document.body.appendChild(sticky);

    /* SEO: title + og:image + canonical */
    setMeta({ title: it.title || 'ประกาศ', desc: `${priceText(it)} · ${it.type || ''} · ${(it.desc || '').slice(0, 140)}`, image: urls[0], hash: '#/listing/' + encodeURIComponent(it.id) });
  }

  function gallery(urls, title){
    const frag = document.createDocumentFragment();
    const n = urls.length;
    // mobile: scroll-snap strip
    const strip = create('div', { class:'gal-strip', tabindex:'0', 'aria-label':'รูปภาพ (ปัดซ้าย-ขวา)' });
    const count = create('span', { class:'chip on-img gal-count num', text: n ? `1 / ${n}` : '' });
    if (!n) strip.appendChild(create('div', {}, imgEl('')));
    urls.forEach((u, i) => strip.appendChild(create('button', { type:'button', 'aria-label':`ดูรูปที่ ${i+1} แบบเต็มจอ`, onclick: () => openLightbox(urls, i) },
      imgEl(u, { size: 1200, eager: i === 0, alt: i === 0 ? title : '' }))));
    strip.addEventListener('scroll', () => { const i = Math.round(strip.scrollLeft / strip.clientWidth); count.textContent = `${i + 1} / ${n}`; }, { passive:true });
    const m = create('div', { class:'gal-m' }, [ strip, n > 1 ? count : null ]);
    frag.appendChild(m);
    // desktop: bento
    const shown = Math.min(n, 5);
    const bento = create('div', { class:'bento', dataset:{ n: String(Math.max(1, shown)) } });
    if (!n) bento.appendChild(create('div', {}, imgEl('')));
    urls.slice(0, shown).forEach((u, i) => bento.appendChild(create('button', { type:'button', 'aria-label':`ดูรูปที่ ${i+1} แบบเต็มจอ`, onclick: () => openLightbox(urls, i) },
      imgEl(u, { size: i === 0 ? 1600 : 800, eager: i === 0, alt: i === 0 ? title : '' }))));
    if (n > 1) bento.appendChild(create('button', { type:'button', class:'btn btn-white all', onclick: () => openLightbox(urls, 0) }, [ icon('images'), `ดูทั้งหมด ${n} รูป` ]));
    frag.appendChild(bento);
    return frag;
  }

  function specTiles(it){
    const cells = [];
    if (it.bedrooms)   cells.push(['bed', it.bedrooms, '', 'ห้องนอน']);
    if (it.bathrooms)  cells.push(['bath', it.bathrooms, '', 'ห้องน้ำ']);
    if (it.usableArea) cells.push(['maximize', it.usableArea, 'ตร.ม.', 'พื้นที่ใช้สอย']);
    if (it.landSize)   cells.push(['land-plot', it.landSize, 'ตร.วา', 'ขนาดที่ดิน']);
    if (it.parking)    cells.push(['car', it.parking, 'คัน', 'ที่จอดรถ']);
    if (!cells.length) return null;
    return create('div', { class:'spec-tiles' }, cells.map(([ic, v, u, l]) => create('div', { class:'tile' }, [
      icon(ic), create('div', { class:'v' }, [ String(v), u ? create('small', { text:u }) : null ]), create('div', { class:'label', text:l })
    ])));
  }

  function locationCard(it){
    const pc = publicCoords(it);   // approx → ใช้จุดแสดงผล (สุ่ม) ไม่เปิดพิกัดจริง
    if (!pc) return null;
    const mapBox = create('div', { class:'mini-map', role:'img', 'aria-label': pc.approx ? 'แผนที่ทำเลโดยประมาณ' : 'แผนที่ตำแหน่งประกาศ' });
    const card = create('section', { class:'card', 'aria-labelledby':'locH' }, [
      create('div', { class:'sec-head', style:{ marginBottom:'0' } }, [
        create('h2', { id:'locH', class:'card-title', text:'ทำเล' }),
        create('a', { class:'btn btn-soft btn-sm', href: mapLink(pc.lat, pc.lng), target:'_blank', rel:'noopener' }, [ icon('external-link','ic-sm'), pc.approx ? 'ดูทำเลโดยประมาณ' : 'เปิด Google Maps' ])
      ]),
      mapBox
    ]);
    if (pc.approx) card.appendChild(create('p', { class:'loc-note' }, [ icon('info','ic-sm'), 'ตำแหน่งบนแผนที่เป็นพื้นที่โดยประมาณ (รัศมี) ไม่ใช่จุดที่ตั้งจริง' ]));
    ensureLeaflet().then(() => {
      if (!mapBox.isConnected || miniMap) return;
      miniMap = newMap(mapBox, { layers:[ monoTiles() ], scrollWheelZoom:false, dragging: !L.Browser.mobile, tap:false }).setView([pc.lat, pc.lng], pc.approx ? 15 : 16);
      if (pc.approx) approxCircle(pc, it, true).addTo(miniMap);
      else L.marker([pc.lat, pc.lng], { icon: thumbPinIcon(it, true), keyboard:false, interactive:false }).addTo(miniMap);
    }).catch(() => {});
    return card;
  }

  function contactLinks(it){
    const s = store.settings;
    return {
      tel: s.phone ? safePhoneTel(s.phone) : '',
      line: safeUrl(s.lineUrl),
      msgr: safeUrl(s.messengerUrl),
      fb: safeUrl(it.fbUrl || s.facebookPage),
      tt: safeUrl(s.tiktokUrl)
    };
  }

  function priceCard(it, listingUrl){
    const isRent = it.listingMode === 'rent';
    const st = it.status || 'available';
    const card = create('aside', { class:'card price-card', 'aria-label':'ราคาและการติดต่อ' });
    const top = create('div', {}, [ create('div', { class:'label', text: isRent ? 'ค่าเช่า' : 'ราคา' }), priceEl(it) ]);
    const sub = [ it.price ? baht(it.price) : '', it.priceUnit || '', pricePerArea(it) ].filter(Boolean).join(' · ');
    if (sub) top.appendChild(create('div', { class:'unit-line num', text: sub }));
    card.appendChild(top);

    const c = contactLinks(it);
    if (c.tel) card.appendChild(create('a', { class:'btn btn-lg btn-block', href:c.tel }, [ icon('phone'), 'โทรหาครูไลลา' ]));
    const grid = create('div', { class:'contact-grid' });
    if (c.line) grid.appendChild(create('a', { class:'btn btn-white', href:c.line, target:'_blank', rel:'noopener' }, [ icon('message-circle'), 'LINE' ]));
    if (c.msgr) grid.appendChild(create('a', { class:'btn btn-white', href:c.msgr, target:'_blank', rel:'noopener' }, [ icon('send'), 'Messenger' ]));
    if (c.fb)   grid.appendChild(create('a', { class:'btn btn-white', href:c.fb, target:'_blank', rel:'noopener' }, [ icon('facebook'), 'Facebook' ]));
    if (c.tt)   grid.appendChild(create('a', { class:'btn btn-white', href:c.tt, target:'_blank', rel:'noopener' }, [ icon('tiktok'), 'TikTok' ]));
    if (grid.childNodes.length) card.appendChild(grid);
    if (!c.tel && !grid.childNodes.length) card.appendChild(create('a', { class:'btn btn-lg btn-block', href:'#/contact' }, [ icon('phone'), 'ช่องทางติดต่อ' ]));

    // share — มือถือใช้แผ่นแชร์ของระบบ · คอมฯ คัดลอกลิงก์ · แชร์ LINE
    const share = create('div', { class:'share-row' }, [
      create('button', { type:'button', class:'btn btn-soft', onclick: () => copyText(listingUrl) }, [ icon('link'), 'คัดลอกลิงก์' ]),
      navigator.share ? create('button', { type:'button', class:'icon-btn soft', 'aria-label':'แชร์', onclick: () => navigator.share({ title: it.title || 'ประกาศ', text: (it.title||'') + ' — ' + baht(it.price), url: listingUrl }).catch(()=>{ /* ผู้ใช้กดยกเลิก */ }) }, icon('share')) : null,
      create('a', { class:'icon-btn soft', 'aria-label':'แชร์ไปที่ LINE', href:'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(listingUrl), target:'_blank', rel:'noopener' }, icon('message-circle')),
      favButton(it, 'icon-btn soft')
    ]);
    card.appendChild(share);

    if (it.price && !isRent){
      card.appendChild(create('div', { class:'divider', role:'presentation' }));
      card.appendChild(create('h2', { class:'card-title', text:'คำนวณค่างวด' }));
      card.appendChild(loanWidget({ price: +it.price, compact:true }));
    }
    // ฟอร์มสอบถาม/นัดดู → /leads (ไม่แสดงเมื่อขายแล้ว)
    if (st !== 'sold') card.appendChild(leadForm(it));
    return card;
  }

  function leadForm(it){
    const wrap = create('details', { class:'lead-box' });
    wrap.appendChild(create('summary', {}, [ create('span', { text:'สนใจประกาศนี้ — ฝากข้อมูลให้ติดต่อกลับ' }), icon('chevron-down') ]));
    const form = create('form', { class:'lead-form', novalidate:'' });
    const name  = create('input', { class:'input', name:'name', maxlength:'100', placeholder:'ชื่อ *', autocomplete:'name', required:'', 'aria-label':'ชื่อ' });
    const phone = create('input', { class:'input', name:'phone', maxlength:'30', placeholder:'เบอร์โทร หรือ LINE ID *', autocomplete:'tel', inputmode:'tel', required:'', 'aria-label':'เบอร์โทร หรือ LINE ID' });
    const msg   = create('textarea', { class:'input', name:'message', maxlength:'1000', rows:'3', placeholder:'ข้อความ เช่น อยากนัดดูวันเสาร์ / สอบถามเรื่องสินเชื่อ', 'aria-label':'ข้อความ' });
    // honeypot กันบอท: ช่องที่คนมองไม่เห็น ถ้ามีค่า = บอท
    const hp = create('input', { class:'hp-field', name:'website', tabindex:'-1', autocomplete:'off', 'aria-hidden':'true' });
    const consentChk = create('input', { type:'checkbox', required:'' });
    const consent = create('label', { class:'check' }, [ consentChk, create('span', { text:'ยินยอมให้ใช้ชื่อและเบอร์ติดต่อนี้เพื่อติดต่อกลับเรื่องประกาศนี้เท่านั้น (PDPA)' }) ]);
    const send = create('button', { class:'btn btn-block', type:'submit' }, [ icon('send'), 'ส่งข้อมูล' ]);
    [name, phone, msg, hp, consent, send].forEach(el => form.appendChild(el));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      send.disabled = true;
      try{
        const r = await submitLead(it, { name:name.value, phone:phone.value, message:msg.value, honeypot:hp.value, consent:consentChk.checked });
        if (r.bot) return;
        if (!r.ok) return toast(r.warn, 'warn');
        form.reset();
        wrap.open = false;
        toast('ส่งข้อมูลแล้ว ครูไลลาจะติดต่อกลับโดยเร็ว','success',4000);
      }catch(err){
        console.error('lead:', err);
        // ยังไม่ได้อัปเดต Rules → แนะนำช่องทางอื่นแทน
        toast('ส่งไม่สำเร็จ — กรุณาติดต่อทางโทรศัพท์หรือ LINE ด้านบน','error',5000);
      }finally{ send.disabled = false; }
    });
    wrap.appendChild(form);
    return wrap;
  }

  function stickyBar(it){
    const c = contactLinks(it);
    const bar = create('div', { class:'sticky-contact', role:'region', 'aria-label':'ติดต่อด่วน' }, [ favButton(it, 'icon-btn') ]);
    if (c.line) bar.appendChild(create('a', { class:'btn btn-soft', href:c.line, target:'_blank', rel:'noopener' }, [ icon('message-circle'), 'LINE' ]));
    else if (c.msgr) bar.appendChild(create('a', { class:'btn btn-soft', href:c.msgr, target:'_blank', rel:'noopener' }, [ icon('send'), 'Messenger' ]));
    if (c.tel) bar.appendChild(create('a', { class:'btn', href:c.tel }, [ icon('phone'), 'โทรเลย' ]));
    else bar.appendChild(create('a', { class:'btn', href:'#/contact' }, [ icon('phone'), 'ติดต่อ' ]));
    return bar;
  }

  function sync(){
    if (!store.ready){ skeleton(); return; }
    const it = find();
    if (!it){
      if (shownId !== '__nf'){ notFound(); if (shownId) toast('ไม่พบประกาศนี้ อาจถูกลบหรือปิดการขายไปแล้ว','warn',4000); shownId = '__nf'; }
      return;
    }
    if (shownId === it.id){
      // อัปเดตเงียบ ๆ: ยอดเข้าชม
      if (viewsEl) viewsEl.textContent = fmtInt(+it.views || 0);
      return;
    }
    if (miniMap){ miniMap.remove(); miniMap = null; }
    render(it);
  }
  sync();

  return {
    ownsMeta: true,
    update(kind){
      if (kind === 'data') sync();
      else if (kind === 'settings' && shownId && shownId !== '__nf'){ const it = find(); if (it){ shownId = null; if (miniMap){ miniMap.remove(); miniMap = null; } render(it); } }
    },
    destroy(){ if (miniMap) miniMap.remove(); if (sticky) sticky.remove(); }
  };
}

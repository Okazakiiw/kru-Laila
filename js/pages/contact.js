/* ============================================================================
   pages/contact.js — #/contact  ช่องทางติดต่อ (จาก meta/site) + ข้อความ "เกี่ยวกับเรา"
============================================================================ */
import { create, safeUrl, safePhoneTel, copyText } from '../core/dom.js';
import { store } from '../store.js';
import { icon } from '../ui/icons.js';

export function mount(root){
  const about = create('p');
  const list = create('div', { style:{ display:'grid', gap:'10px', marginTop:'14px' } });
  root.append(
    create('section', { class:'page-head' }, create('div', {}, [ create('h1', { text:'ติดต่อครูไลลา' }), about ])),
    create('div', { class:'contact-cards' }, [
      create('section', { class:'card', 'aria-labelledby':'chH' }, [ create('h2', { id:'chH', class:'card-title', text:'ช่องทางติดต่อ' }), list ]),
      create('section', { class:'card', style:{ display:'grid', gap:'14px', alignContent:'start' } }, [
        create('h2', { class:'card-title', text:'นัดดูทรัพย์' }),
        create('p', { class:'label', text:'แจ้งชื่อประกาศหรือส่งลิงก์ประกาศมาทาง LINE ได้เลย ครูไลลาดูแลตั้งแต่นัดชมจนถึงวันโอน' }),
        create('div', { class:'btn-row' }, [
          create('a', { class:'btn', href:'#/explore' }, [ icon('compass'), 'ดูประกาศทั้งหมด' ]),
          create('a', { class:'btn btn-soft', href:'#/favorites' }, [ icon('heart'), 'รายการโปรด' ])
        ])
      ])
    ])
  );
  function row(ic, title, value, href, ext){
    return create('a', { class:'contact-row', href, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null }, [
      create('span', { class:'icon-btn', 'aria-hidden':'true' }, icon(ic)),
      create('span', { style:{ minWidth:'0' } }, [ create('b', { text:title }), create('span', { class:'label', text:value }) ]),
      icon(ext ? 'arrow-up-right' : 'chevron-right', 'go')
    ]);
  }
  function render(){
    const s = store.settings || {};
    about.textContent = (s.aboutText || '').trim() || 'ติดต่อโดยตรง ไม่ผ่านนายหน้าซ้ำซ้อน — โทร ทัก LINE หรือ Facebook ได้ทุกวัน';
    list.textContent = '';
    const tel = safePhoneTel(s.phone), line = safeUrl(s.lineUrl), msgr = safeUrl(s.messengerUrl), fb = safeUrl(s.facebookPage), tt = safeUrl(s.tiktokUrl);
    if (tel) list.appendChild(row('phone', 'โทร', String(s.phone), tel, false));
    if (line) list.appendChild(row('message-circle', 'LINE', s.lineId ? String(s.lineId) : 'เพิ่มเพื่อน', line, true));
    else if (s.lineId) list.appendChild(create('button', { type:'button', class:'contact-row', style:{ border:'0', width:'100%', textAlign:'left', font:'inherit', cursor:'pointer' },
      onclick: () => copyText(String(s.lineId), 'คัดลอก LINE ID แล้ว') }, [ create('span', { class:'icon-btn', 'aria-hidden':'true' }, icon('message-circle')),
      create('span', {}, [ create('b', { text:'LINE ID' }), create('span', { class:'label', text:String(s.lineId) }) ]), icon('copy', 'go') ]));
    if (msgr) list.appendChild(row('send', 'Messenger', 'ส่งข้อความ', msgr, true));
    if (fb) list.appendChild(row('facebook', 'Facebook', 'เพจหลัก', fb, true));
    if (tt) list.appendChild(row('tiktok', 'TikTok', 'ดูวิดีโอ', tt, true));
    if (!list.childNodes.length) list.appendChild(create('p', { class:'label', text:'ยังไม่ได้ตั้งค่าช่องทางติดต่อ' }));
  }
  render();
  return { meta: { title:'ติดต่อ', hash:'#/contact' }, update(kind){ if (kind === 'settings') render(); } };
}

/* ============================================================================
   pages/calculator.js — #/calculator  เครื่องคำนวณค่างวด (สูตรเดิม)
============================================================================ */
import { create } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { loanWidget } from '../ui/loan.js';

export function mount(root){
  root.append(
    create('section', { class:'page-head' }, create('div', {}, [
      create('h1', { text:'คำนวณค่างวด' }),
      create('p', { text:'ประมาณค่าผ่อนต่อเดือนจากราคา เงินดาวน์ ดอกเบี้ย และระยะเวลา — ลองปรับแถบเลื่อนดูได้ทันที' })
    ])),
    create('div', { class:'calc' }, [
      create('div', { class:'card' }, loanWidget({ price: 2500000, editablePrice:true })),
      create('div', { class:'card', style:{ display:'grid', gap:'14px' } }, [
        create('h2', { class:'card-title', text:'ก่อนยื่นกู้' }),
        tip('percent', 'ธนาคารส่วนใหญ่ให้กู้ 80–95% ของราคาประเมิน ที่เหลือคือเงินดาวน์'),
        tip('calendar', 'อายุผู้กู้ + ระยะเวลาผ่อน มักต้องไม่เกิน 65–70 ปี'),
        tip('trending-up', 'ค่างวดไม่ควรเกิน 30–40% ของรายได้ต่อเดือน'),
        create('div', { class:'btn-row', style:{ marginTop:'6px' } }, [
          create('a', { class:'btn', href:'#/explore' }, [ icon('compass'), 'หาบ้านที่ใช่' ]),
          create('a', { class:'btn btn-soft', href:'#/contact' }, [ icon('phone'), 'ปรึกษาครูไลลา' ])
        ])
      ])
    ])
  );
  function tip(ic, text){
    return create('div', { class:'contact-row', style:{ cursor:'default' } }, [ create('span', { class:'icon-btn', 'aria-hidden':'true' }, icon(ic === 'percent' ? 'calculator' : ic)), create('span', { text }) ]);
  }
  return { meta: { title:'คำนวณค่างวด', hash:'#/calculator', desc:'เครื่องคำนวณค่างวดบ้าน ประมาณค่าผ่อนต่อเดือนจากราคา เงินดาวน์ ดอกเบี้ย และระยะเวลาผ่อน' } };
}

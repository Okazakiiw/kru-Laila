/* ============================================================================
   ui/loan.js — เครื่องคำนวณค่างวด (สูตรเดิมจาก recalcLoan() ใน app.js) + UI slider
============================================================================ */
import { create } from '../core/dom.js';

/** สูตรเดิม: clamp ค่าที่กรอกเกินช่วง (เดิมดาวน์ 120% → วงเงินกู้ติดลบ) */
export function calcLoan(priceIn, downIn, rateIn, yearsIn){
  const price = +priceIn || 0;
  const downPct = Math.min(100, Math.max(0, +downIn || 0));
  const rate = Math.max(0, +rateIn || 0);
  const years = Math.min(40, Math.max(0, +yearsIn || 0));
  if (!price || !years) return null;
  const loan = price * (1 - downPct/100);
  const r = (rate/100)/12;
  const n = years*12;
  const m = r === 0 ? loan/n : loan * r / (1 - Math.pow(1+r, -n));
  const total = m*n;
  const interest = total - loan;
  return { loan, m, total, interest, downPct, rate, years, price };
}

const fmt = (v) => Math.round(v).toLocaleString('th-TH');
let uid = 0;

function rangeField({ label, min, max, step, value, unit, fmtVal }){
  const id = 'rg' + (++uid);
  const out = create('b', { class:'num' });
  const input = create('input', { type:'range', id, min:String(min), max:String(max), step:String(step), value:String(value) });
  const paint = () => {
    const p = ((+input.value - min) / (max - min)) * 100;
    input.style.setProperty('--p', p + '%');
    out.textContent = (fmtVal ? fmtVal(+input.value) : input.value) + (unit ? ' ' + unit : '');
    input.setAttribute('aria-valuetext', out.textContent);
  };
  input.addEventListener('input', paint);
  paint();
  const wrap = create('div', { class:'range-field' }, [
    create('div', { class:'top' }, [ create('label', { for:id, text:label }), out ]),
    input
  ]);
  return { wrap, input };
}

/**
 * loanWidget({ price, editablePrice })
 * - หน้าประกาศ: ราคาจากประกาศ (ไม่แก้)
 * - หน้า "คำนวณค่างวด": กรอกราคาเองได้
 */
export function loanWidget({ price = 0, editablePrice = false, compact = false } = {}){
  const root = create('div', { class:'loan' + (compact ? ' compact' : '') });
  let priceInput = null;
  if (editablePrice){
    const id = 'lp' + (++uid);
    priceInput = create('input', { id, class:'input input-lg num', inputmode:'numeric', autocomplete:'off', placeholder:'เช่น 2,500,000', value: price ? fmt(price) : '' });
    priceInput.addEventListener('input', () => {
      const digits = priceInput.value.replace(/[^\d]/g, '').slice(0, 12);
      priceInput.value = digits ? (+digits).toLocaleString('th-TH') : '';
      recalc();
    });
    root.appendChild(create('div', { class:'field' }, [ create('label', { for:id, class:'label', text:'ราคาทรัพย์ (บาท)' }), priceInput ]));
  }
  const down  = rangeField({ label:'เงินดาวน์', min:0, max:90, step:5, value:20, unit:'%' });
  const rate  = rangeField({ label:'ดอกเบี้ยต่อปี', min:0, max:12, step:0.25, value:6.5, unit:'%', fmtVal:v => v.toFixed(2) });
  const years = rangeField({ label:'ระยะเวลาผ่อน', min:5, max:40, step:1, value:30, unit:'ปี' });

  const big = create('div', { class:'price' });
  const sub = create('div', { class:'loan-sub' });
  const out = create('div', { class:'loan-out', 'aria-live':'polite' }, [
    create('div', { class:'label', text:'ค่างวดโดยประมาณ' }), big, sub
  ]);
  root.append(out, down.wrap, rate.wrap, years.wrap,
    create('p', { class:'label fine', text:'* เป็นการประมาณการเท่านั้น ดอกเบี้ยและเงื่อนไขจริงขึ้นกับธนาคาร' }));

  function recalc(){
    const p = priceInput ? +priceInput.value.replace(/[^\d]/g, '') : price;
    const r = calcLoan(p, down.input.value, rate.input.value, years.input.value);
    big.textContent = ''; sub.textContent = '';
    if (!r){
      big.appendChild(document.createTextNode('—'));
      sub.textContent = 'กรอกราคาและระยะเวลาเพื่อคำนวณ';
      return;
    }
    big.appendChild(document.createTextNode('฿' + fmt(r.m)));
    big.appendChild(create('span', { class:'u', text:'/เดือน' }));
    const row = (l, v) => create('div', { class:'row' }, [ create('span', { class:'label', text:l }), create('b', { class:'num', text:v }) ]);
    sub.append(
      row('วงเงินกู้', '฿' + fmt(r.loan)),
      row('เงินดาวน์', '฿' + fmt(r.price - r.loan)),
      row('ดอกเบี้ยรวมตลอดสัญญา', '฿' + fmt(r.interest)),
      row('รวมจ่าย', '฿' + fmt(r.total))
    );
  }
  [down.input, rate.input, years.input].forEach(i => i.addEventListener('input', recalc));
  recalc();
  return root;
}

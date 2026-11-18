/* stub — กำลังสร้างหน้านี้ใน commit ถัดไป */
import { create } from '../core/dom.js';
export function mount(root){
  root.appendChild(create('section', { class:'page-head' }, create('h1', { text:'กำลังปรับปรุงหน้านี้' })));
  return {};
}

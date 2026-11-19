/* ============================================================================
   pages/notfound.js — 404
============================================================================ */
import { create } from '../core/dom.js';
import { icon } from '../ui/icons.js';

export function mount(root){
  root.appendChild(create('section', { class:'nf' }, [
    create('div', { class:'big num', 'aria-hidden':'true', text:'404' }),
    create('h1', { style:{ fontSize:'28px' }, text:'ไม่พบหน้านี้' }),
    create('p', { class:'label', text:'ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว' }),
    create('div', { class:'empty-actions' }, [
      create('a', { class:'btn btn-lg', href:'#/' }, [ icon('house'), 'กลับหน้าแรก' ]),
      create('a', { class:'btn btn-white btn-lg', href:'#/explore' }, [ icon('map'), 'สำรวจแผนที่' ])
    ])
  ]));
  return { meta: { title:'ไม่พบหน้า' } };
}

/* ============================================================================
   pages/favorites.js — #/favorites  รายการโปรด (localStorage krulaila:favs)
============================================================================ */
import { create } from '../core/dom.js';
import { getFavs } from '../data/listings.js';
import { store, publicItems } from '../store.js';
import { icon } from '../ui/icons.js';
import { listingCard, skeletonCards, emptyState } from '../ui/components.js';

export function mount(root){
  const sub = create('p', { 'aria-live':'polite' });
  const head = create('section', { class:'page-head' }, [
    create('div', {}, [ create('h1', { text:'รายการโปรด' }), sub ]),
    create('a', { class:'btn btn-white', href:'#/explore' }, [ icon('map'), 'ดูบนแผนที่' ])
  ]);
  const grid = create('div', { class:'grid-cards', style:{ marginTop:'20px' } });
  root.append(head, grid);
  let animated = false;

  function render(){
    grid.textContent = '';
    if (!store.ready){ grid.append(...skeletonCards(4).children); sub.textContent = 'กำลังโหลด…'; return; }
    const favs = getFavs();
    const q = (store.filters.q || '').trim().toLowerCase();
    // เรียงตามลำดับที่กดถูกใจล่าสุดก่อน
    const items = favs.slice().reverse().map(id => publicItems().find(x => x.id === id)).filter(Boolean)
      .filter(it => !q || `${it.title||''} ${it.desc||''} ${it.type||''}`.toLowerCase().includes(q));
    const missing = favs.length - favs.filter(id => publicItems().some(x => x.id === id)).length;
    sub.textContent = items.length
      ? `บันทึกไว้ ${items.length} ประกาศ` + (missing ? ` · ${missing} ประกาศถูกปิดหรือลบไปแล้ว` : '') + ' · เก็บไว้ในเครื่องนี้เท่านั้น'
      : 'กดรูปหัวใจบนประกาศที่สนใจ เพื่อกลับมาดูภายหลัง';
    if (!items.length){
      grid.appendChild(emptyState({ art:'heart', title: q ? 'ไม่พบในรายการโปรด' : 'ยังไม่มีรายการโปรด',
        text: q ? 'ลองค้นด้วยคำอื่น' : 'เลือกบ้านหรือที่ดินที่ชอบ แล้วกดหัวใจไว้ จะรวมอยู่ที่นี่',
        actions:[ create('a', { class:'btn btn-lg', href:'#/explore' }, [ icon('compass'), 'ไปสำรวจ' ]) ] }));
      return;
    }
    const anim = !animated; animated = true;
    items.forEach((it, i) => grid.appendChild(listingCard(it, { i, anim })));
  }
  render();
  return {
    meta: { title:'รายการโปรด', hash:'#/favorites' },
    update(kind){ if (kind === 'data' || kind === 'favs' || kind === 'filters') render(); }
  };
}

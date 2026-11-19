/* ============================================================================
   admin/media.js — เครื่องมือดูแลรูปใน Google Drive (หน้า "ตั้งค่า")
   1) ตรวจความปลอดภัยของ Apps Script (ADMIN_UIDS / SHARED_TOKEN) — อ่านสถานะอย่างเดียว
   2) ตรวจ "รูปที่ไม่ได้ใช้" = ไฟล์ในโฟลเดอร์ Drive ที่ไม่มีประกาศไหนอ้างอิง (เช่น ไฟล์ค้างจากอัปโหลดที่ไม่ได้บันทึก)
      → เลือกแล้วย้ายลงถังขยะของ Drive (กู้คืนได้ 30 วัน) · ไม่ลบอัตโนมัติ · ข้ามไฟล์ที่สร้างภายใน 1 ชม.
   ไม่เปลี่ยน schema Firestore — อ่าน imageObjs / imageURLs ที่มีอยู่เท่านั้น
============================================================================ */
import { create, toast, confirmDialog } from '../core/dom.js';
import { listDriveFolder, securityStatus, deleteDriveFiles, driveIdFromURL } from '../data/images.js';
import { icon } from '../ui/icons.js';
import { admin } from './store.js';
import { currentImgArr_ } from './ops.js';

const FRESH_MS = 60 * 60 * 1000;
const fmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((b || 0) / 1024)) + ' KB';

/** ไอดีไฟล์ Drive ที่ "ทุกประกาศ" (รวมฉบับร่าง) อ้างอิงอยู่ */
function usedDriveIds(){
  const used = new Set();
  (admin.items || []).forEach(it => currentImgArr_(it).forEach(o => {
    if (o.id) used.add(o.id);
    const d = driveIdFromURL(o.url); if (d) used.add(d);
  }));
  return used;
}

export function driveToolsCard(){
  const secOut = create('div', { class:'dt-out', 'aria-live':'polite' });
  const scanOut = create('div', { class:'dt-out', 'aria-live':'polite' });
  const secBtn = create('button', { type:'button', class:'btn btn-soft' }, [ icon('lock','ic-sm'), 'ตรวจความปลอดภัย Apps Script' ]);
  const scanBtn = create('button', { type:'button', class:'btn btn-soft' }, [ icon('images','ic-sm'), 'ตรวจรูปที่ไม่ได้ใช้' ]);

  const row = (ok, text, fix) => create('div', { class:'dt-row ' + (ok ? 'ok' : 'warn') }, [
    icon(ok ? 'check' : 'alert', 'ic-sm'),
    create('div', {}, [ create('div', { text }), fix ? create('small', { class:'help', text: fix }) : null ])
  ]);

  secBtn.addEventListener('click', async () => {
    secBtn.disabled = true; secOut.textContent = '';
    secOut.appendChild(create('span', { class:'label', text:'กำลังตรวจ…' }));
    try {
      const r = await securityStatus();
      secOut.textContent = '';
      secOut.append(
        row(r.adminUidsSet, r.adminUidsSet ? 'จำกัดสิทธิ์อัปโหลด/ลบรูปเฉพาะแอดมินที่ระบุ (ADMIN_UIDS) แล้ว' : 'ยังไม่ได้จำกัดสิทธิ์ — ใครสมัครบัญชี Firebase ได้ก็อัปโหลด/ลบรูปได้',
          r.adminUidsSet ? '' : 'ใส่ UID ของคุณ (ดูได้ในการ์ด "บัญชีแอดมิน" ด้านบน) ลงใน ADMIN_UIDS ใน gas-upload.gs แล้ว Deploy เวอร์ชันใหม่'),
        row(!r.tokenIsDefault, r.tokenIsDefault ? 'SHARED_TOKEN ยังเป็นค่าเริ่มต้น (CHANGE_ME…)' : 'SHARED_TOKEN ถูกเปลี่ยนจากค่าเริ่มต้นแล้ว',
          r.tokenIsDefault ? 'ตั้งเป็นรหัสสุ่มยาว ๆ ทั้งใน gas-upload.gs และ window.GAS_SHARED_TOKEN ใน admin.html ให้ตรงกัน' : ''),
        row(r.requireAuth, r.requireAuth ? 'บังคับล็อกอิน Firebase ก่อนอัปโหลด (REQUIRE_AUTH)' : 'REQUIRE_AUTH ปิดอยู่ — ใครก็อัปโหลดได้', r.requireAuth ? '' : 'ตั้ง REQUIRE_AUTH: true')
      );
    } catch (e) {
      secOut.textContent = '';
      secOut.appendChild(row(false, 'ตรวจไม่สำเร็จ: ' + e.message));
      secOut.appendChild(create('small', { class:'help', text:'ถ้าขึ้น "Unknown action" แปลว่า Apps Script ยังเป็นเวอร์ชันเก่า — วางไฟล์ gas-upload.gs ล่าสุด แล้ว Deploy → Manage deployments → Edit → New version' }));
    } finally { secBtn.disabled = false; }
  });

  async function scan(){
    scanOut.textContent = '';
    if (!admin.ready){ scanOut.appendChild(create('span', { class:'label', text:'ข้อมูลประกาศยังโหลดไม่เสร็จ — รอสักครู่แล้วลองใหม่' })); return; }
    scanBtn.disabled = true;
    scanOut.appendChild(create('span', { class:'label', text:'กำลังอ่านรายการไฟล์ใน Drive…' }));
    try {
      const r = await listDriveFolder();
      const used = usedDriveIds();
      const now = Date.now();
      const orphans = r.files.filter(f => !used.has(f.id) && (now - f.created) > FRESH_MS).sort((a, b) => b.created - a.created);
      const bytes = orphans.reduce((n, f) => n + (f.size || 0), 0);
      scanOut.textContent = '';
      scanOut.appendChild(create('div', { class:'label', text:`ไฟล์ในโฟลเดอร์ ${r.files.length} ไฟล์ · ถูกใช้งาน ${r.files.length - orphans.length} · ไม่ได้ใช้ ${orphans.length} ไฟล์ (${fmtSize(bytes)})` + (r.truncated ? ' · แสดงเฉพาะ 3,000 ไฟล์แรก' : '') }));
      if (!orphans.length){ scanOut.appendChild(row(true, 'ไม่มีรูปค้าง — ทุกไฟล์ถูกประกาศใช้งานอยู่')); return; }
      const checks = new Map();
      const grid = create('div', { class:'dt-grid' });
      orphans.forEach(f => {
        const cb = create('input', { type:'checkbox', 'aria-label':'เลือก ' + f.name });
        cb.checked = true; checks.set(f.id, cb);
        grid.appendChild(create('label', { class:'dt-tile' }, [
          create('img', { src:'https://lh3.googleusercontent.com/d/' + encodeURIComponent(f.id) + '=s160', alt:'', loading:'lazy', referrerpolicy:'no-referrer' }),
          cb,
          create('span', { class:'dt-cap', text: fmtSize(f.size) + ' · ' + new Date(f.created).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) })
        ]));
      });
      const delBtn = create('button', { type:'button', class:'btn btn-danger-solid' }, [ icon('trash','ic-sm'), 'ย้ายที่เลือกไปถังขยะ' ]);
      const allBtn = create('button', { type:'button', class:'btn btn-soft btn-sm' }, 'เลือก/ไม่เลือกทั้งหมด');
      allBtn.addEventListener('click', () => { const any = [...checks.values()].some(c => c.checked); checks.forEach(c => { c.checked = !any; }); });
      delBtn.addEventListener('click', async () => {
        const ids = [...checks].filter(([, c]) => c.checked).map(([id]) => id);
        if (!ids.length) return toast('ยังไม่ได้เลือกไฟล์','warn');
        // ตรวจซ้ำก่อนลบ: ประกาศอาจเพิ่งถูกแก้ให้ใช้ไฟล์เหล่านี้ระหว่างที่เปิดหน้านี้ค้างไว้
        const usedNow = usedDriveIds();
        const safe = ids.filter(id => !usedNow.has(id));
        if (!confirmDialog(`ย้ายไฟล์ ${safe.length} รายการลงถังขยะของ Google Drive?\n(กู้คืนได้ภายใน 30 วันจากถังขยะใน Drive)`)) return;
        delBtn.disabled = true;
        try {
          let removed = 0;
          for (let i = 0; i < safe.length; i += 40){
            const res = await deleteDriveFiles(safe.slice(i, i + 40));
            removed += (res.removed || []).length;
          }
          toast(`ย้ายลงถังขยะแล้ว ${removed} ไฟล์`,'success');
        } catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error', 6000); }
        delBtn.disabled = false;
        scan();
      });
      scanOut.append(grid, create('div', { class:'btn-row', style:{ marginTop:'12px' } }, [ delBtn, allBtn ]));
    } catch (e) {
      scanOut.textContent = '';
      scanOut.appendChild(row(false, 'ตรวจไม่สำเร็จ: ' + e.message));
      scanOut.appendChild(create('small', { class:'help', text:'ถ้าขึ้น "Unknown action" ให้ Deploy gas-upload.gs เวอร์ชันล่าสุดก่อน' }));
    } finally { scanBtn.disabled = false; }
  }
  scanBtn.addEventListener('click', scan);

  return create('section', { class:'card', 'aria-labelledby':'s5' }, [
    create('h2', { id:'s5', class:'card-title', text:'รูปภาพใน Google Drive' }),
    create('p', { class:'label fine', style:{ marginTop:'10px' } }, 'ตรวจความปลอดภัยของตัวอัปโหลด และหาไฟล์ที่ค้างอยู่ใน Drive โดยไม่มีประกาศใช้ (เช่น เปิดฟอร์มอัปโหลดแล้วปิดโดยไม่บันทึก) — ไม่ลบอัตโนมัติ คุณเลือกเองก่อนทุกครั้ง'),
    create('div', { class:'btn-row', style:{ marginTop:'14px' } }, [ secBtn, scanBtn ]),
    secOut, scanOut
  ]);
}

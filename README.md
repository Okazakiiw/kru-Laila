# 🏡 ครูไลลาขายบ้านและที่ดิน — v2.1

เว็บไซต์ประกาศขาย/เช่าอสังหาริมทรัพย์ ใช้ static HTML/CSS/JS + Firebase Firestore + Google Drive ผ่าน Apps Script (เก็บรูปฟรี)

---

## 🆕 v2.1 (พ.ย. 2569) — แก้บัค + ฟีเจอร์ใหม่

> ⚠️ **ต้องทำ 2 ขั้นตอนด้วยมือ** หลังอัปโหลดไฟล์ใหม่ — ดูหัวข้อ [🔐 ความปลอดภัย: จำกัดสิทธิ์แอดมิน](#-ความปลอดภัย-จำกัดสิทธิ์แอดมิน-สำคัญ)

### 🐞 บัคที่แก้
- **หลุดตำแหน่งจริง**: ประกาศแบบ "ตำแหน่งไม่ชัด" — คลิกการ์ด/ค้นหาแล้วแผนที่บินไปพิกัด *จริง* → ตอนนี้ใช้จุดแสดงผลเสมอ
- **แผนที่กระโดดเอง**: ทุกครั้งที่มีคนเปิดดูประกาศ (ยอดดู +1) แผนที่ซูมออกและแผงรายละเอียดรีเซ็ต → ตอนนี้ไม่ขยับ
- **หมุดหายจากแผนที่**: แผนที่โชว์แค่ 12 ประกาศแรก → ตอนนี้โชว์ทุกประกาศที่ผ่านตัวกรอง
- กด "โหลดเพิ่ม" แล้วแผนที่ซูมเปลี่ยน → แก้แล้ว
- **ฉบับร่างเปิดได้ผ่านลิงก์ตรง** (`#/listing/{id}`) → ปิดแล้ว; ลิงก์ประกาศที่ถูกลบจะแจ้งเตือน
- เปิดลิงก์แชร์แล้วแผนที่ไม่เลื่อนไปที่ประกาศ → แก้แล้ว
- หมุดแผนที่ทับ topbar ตอนเลื่อนจอบนมือถือ → แก้แล้ว
- เพิ่มประกาศ: เดิมสร้างประกาศก่อนแล้วค่อยอัปโหลดรูป ถ้าอัปโหลดพังจะมีประกาศไม่มีรูปค้าง → ตอนนี้อัปโหลดก่อน
- แก้ไขประกาศ: บันทึกหัวข้อว่างได้ / รัศมีตำแหน่งค้างจากประกาศก่อนหน้า → แก้แล้ว
- ตรวจพิกัด (กันใส่ละติจูด/ลองจิจูดสลับกัน)
- นำเข้า JSON: เลือกไฟล์เดิมซ้ำไม่ทำงาน, นำเข้า backup ซ้ำแล้วประกาศเบิ้ล → แก้แล้ว + สรุปผลสำเร็จ/ข้าม/ล้มเหลว
- ออกจากระบบแล้วล็อกอินใหม่ หน้า admin ไม่โหลดข้อมูลใหม่ → แก้แล้ว
- เครื่องคำนวณค่างวด: ดาวน์เกิน 100% ได้วงเงินติดลบ → จำกัดช่วงแล้ว
- คัดลอกลิงก์ใช้ไม่ได้ใน LINE in-app browser บางรุ่น → มี fallback
- `firestore.rules`: ฟังก์ชันอยู่นอก `service` (อาจ publish ไม่ผ่าน) → ย้ายเข้าไปแล้ว
- ปุ่ม "🍪 ตั้งค่า cookie" แสดงทั้งที่ไม่ได้ใช้ GA4 → ซ่อนเมื่อไม่ได้ตั้ง `GA4_ID`

### 🔒 ช่องโหว่ความปลอดภัยที่แก้
- **ใครก็เป็นแอดมินได้**: rules เดิม `request.auth != null` + Firebase เปิด API สมัครบัญชีให้ทุกคนที่มี apiKey (อยู่ใน HTML) → คนแปลกหน้าสมัครเองแล้วลบประกาศทั้งหมดได้
  ตอนนี้ต้องมีชื่ออยู่ใน collection `admins/{uid}` เท่านั้น (+ ตัวเลือก `ADMIN_UIDS` ใน Apps Script)

### ✨ ฟีเจอร์ใหม่
- **📝 ฟอร์ม "สนใจประกาศนี้"** ในหน้ารายละเอียด → ลูกค้าฝากชื่อ+เบอร์/LINE → แอดมินเห็นใน **กล่อง "📥 ลูกค้าที่สนใจ"** (ทำเครื่องหมายติดต่อแล้ว/ลบได้) มี checkbox ยินยอม PDPA + กันบอท (honeypot + จำกัด 1 ครั้ง/นาที)
- **🏘️ ประกาศใกล้เคียง** (ประเภทเดียวกัน ราคาใกล้กัน) ท้ายหน้ารายละเอียด
- **📤 แชร์** (แผ่นแชร์ของมือถือ) + **💚 แชร์ LINE**
- **ราคาต่อพื้นที่** อัตโนมัติ (≈ บาท/ตร.วา หรือ บาท/ตร.ม.)
- **ตัวกรองห้องนอน** (1+ … 4+) และ **จำนวนผลลัพธ์** "พบ N ประกาศ"
- Empty state มีปุ่ม "ล้างตัวกรอง"
- ใช้งานด้วยคีย์บอร์ดได้: Tab ไปที่การ์ด → Enter เปิด, **Esc** ปิดแผง/modal ทุกอัน
- หน้า admin แสดง UID ของบัญชีที่ล็อกอิน (ใช้ตั้งสิทธิ์)

### 🔐 ความปลอดภัย: จำกัดสิทธิ์แอดมิน (สำคัญ)
ทำตามลำดับนี้ **ก่อน** publish rules ใหม่ ไม่งั้นหน้า admin จะบันทึกไม่ได้:
1. เข้า `admin.html` → ล็อกอิน → กด **คัดลอก UID** (การ์ด "บัญชีแอดมินที่ล็อกอินอยู่")
2. Firebase Console → **Firestore** → Start collection → Collection ID: `admins` → Document ID: *วาง UID* → (ไม่ต้องมี field ก็ได้ / หรือใส่ `email`) → Save
3. Firebase Console → Firestore → **Rules** → วางเนื้อหา `firestore.rules` ใหม่ทั้งหมด → **Publish**
4. (แนะนำ) Firebase Console → **Authentication → Settings → User actions** → ปิด **Enable create (sign-up)**
5. (แนะนำ) Apps Script → ใส่ UID ใน `CONFIG.ADMIN_UIDS: ['UID ของคุณ']` → **Deploy → Manage deployments → Edit → New version**

### ⚠️ ข้อจำกัดที่ยังเหลือ (ต้องปรับโครงสร้างข้อมูล — ยังไม่ได้ทำ)
- Firestore อ่านได้ทั้งเอกสาร → คนที่เปิด DevTools ยังเห็น **พิกัดจริง** ของประกาศ "ตำแหน่งไม่ชัด" และเห็นประกาศ **ฉบับร่าง** ได้
  ทางแก้ถาวร: ย้ายพิกัดจริง/ฉบับร่างไปไว้ใน collection ที่อ่านได้เฉพาะแอดมิน

---

## ✨ สิ่งที่อัพเกรดใน v2

### 🔒 ความปลอดภัย
- เปลี่ยนจาก localStorage password → **Firebase Authentication** (Email/Password)
- เพิ่ม **Firestore Security Rules** ที่จำกัดเขียนเฉพาะแอดมิน (ดู `firestore.rules`)
- กัน **XSS** โดยใช้ `textContent` / `escapeHTML()` ทุกที่ที่ render ข้อมูลผู้ใช้
- Validate `fbUrl` ก่อนใส่ใน `href` (กัน `javascript:` URI)
- Apps Script เวอร์ชันใหม่ตรวจ **Shared Token + Firebase ID Token** กันคนยิงอัปโหลด/ลบไฟล์มั่ว ๆ

### 🏠 ฟีเจอร์ใหม่สำหรับอสังหาฯ
- ฟิลด์ครบ: ห้องนอน, ห้องน้ำ, พื้นที่ใช้สอย (ตร.ม.), ขนาดที่ดิน (ตร.วา), ที่จอดรถ
- โหมด **ขาย/เช่า** + สถานะ **เปิดขาย/จองแล้ว/ขายแล้ว**
- **เครื่องคำนวณค่างวด** (mortgage calculator) ในแต่ละประกาศ
- ปุ่ม **📞 โทร / 💬 LINE / ✉️ Messenger / 📘 Facebook** บนทุกประกาศ
- การตั้งค่าทั่วเว็บ (เบอร์โทร, LINE, FB Page) ในหน้า admin

### 🎯 UX / SEO
- **Deep link** (`#/listing/{id}`) — แชร์ลิงก์ตรงไปประกาศนั้นได้
- **คัดลอกลิงก์** ในแต่ละประกาศ
- ค้นหาด้วยคำสำคัญ + ตัวกรอง (ประเภท, โหมด, สถานะ, ราคา) + เรียง (ใหม่สุด, ราคาต่ำ→สูง, สูง→ต่ำ)
- **Marker Clustering** — แผนที่ไม่รกเวลามีประกาศเยอะ
- **Real-time updates** ผ่าน `onSnapshot` — แอดมินแก้ปุ๊บ หน้าเว็บอัปเดตทันที
- **Lightbox** มีปุ่ม ◀ ▶ ✕, รองรับ keyboard (Esc/Arrow)
- **Toast notifications** แทน `alert()` แบบเก่า
- **Skeleton loader** ตอนโหลด
- **Meta tags + Open Graph + Schema.org** — แชร์ใน LINE/FB มี preview สวย
- **Lazy load** รูปทั้งหมด
- แก้ bug ปุ่ม "FACEBOOK" บน topbar ที่ลิงก์ผิดไป admin

### ♿ Accessibility
- เพิ่ม `aria-label`, `role`, semantic HTML
- Keyboard navigation สำหรับ lightbox / modal
- `lang="th"`, focus rings ที่ชัดเจน

---

## 🚀 การติดตั้ง

### 1) Firebase Authentication
1. ไปที่ Firebase Console → **Authentication** → Get started
2. เลือก **Email/Password** → Enable
3. ไปแท็บ **Users** → Add user (สร้างบัญชีแอดมินด้วยมือ)

### 2) Firestore Security Rules
1. Firebase Console → **Firestore** → Rules
2. แทนที่ทั้งหมดด้วยเนื้อหาใน `firestore.rules`
3. กด **Publish**

> ⚠️ **ห้าม** ใช้ `allow read, write: if true;` เพราะใครก็ลบ/แก้ข้อมูลคุณได้

### 3) Google Apps Script (เก็บรูป)
1. ไปที่ https://script.google.com → **New project**
2. คัดลอกเนื้อหาจาก `gas-upload.gs` ทั้งหมดไปแทน `Code.gs`
3. แก้ `CONFIG`:
   - `FOLDER_ID` → ID ของโฟลเดอร์ Google Drive ที่จะเก็บรูป
   - `SHARED_TOKEN` → สุ่มเป็น string ยาว ๆ (เช่น `crypto.randomUUID()`)
   - `PROJECT_ID` → ตรงกับ `firebaseConfig.projectId`
4. **Deploy** → **New deployment** → Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. คัดลอก URL ที่ได้ ใส่ใน `admin.html`:
   ```js
   window.GAS_UPLOAD_URL = "https://script.google.com/macros/s/.../exec";
   window.GAS_SHARED_TOKEN = "ตรงกับ SHARED_TOKEN ใน Apps Script";
   ```

### 4) Deploy หน้าเว็บ
อัปโหลดทุกไฟล์ขึ้น hosting (Firebase Hosting / GitHub Pages / Netlify / Vercel)
- `index.html`
- `admin.html`
- `app.js`
- `styles.css`

ไม่ต้อง build ไม่ต้อง npm install ✨

### 5) (เลือกได้) เชื่อมต่อ Facebook เพื่อ "ดึงรูปจากโพสต์" อัตโนมัติ

> ถ้าไม่ทำขั้นตอนนี้ ปุ่ม "วาง URL รูป" ยังใช้ได้ตามปกติ — เพียงแต่จะไม่มีปุ่ม "ดึงโพสต์ทั้งโพสต์" และ "เลือกจากโพสต์ล่าสุด"

**ต้องมี Facebook Page (ไม่ใช่ profile ส่วนตัว)** เนื่องจาก Graph API ไม่อนุญาตให้ดึงเนื้อหาจาก profile ส่วนตัวอีกต่อไปตั้งแต่ปี 2018

#### A. หา Page ID
- เปิดเพจของคุณ → คลิก "About" → เลื่อนหา "Page ID" (ตัวเลขล้วน เช่น `123456789012345`)
- หรือใช้เครื่องมือเช่น https://lookup-id.com/

#### B. รับ Page Access Token (long-lived ~60 วัน)
1. ไปที่ https://developers.facebook.com/apps → กด **Create App** → เลือก type **Business** → ตั้งชื่ออะไรก็ได้ (เช่น "krulaila-import")
2. เข้า App Dashboard → เมนูซ้าย เลือก **Tools** → **Graph API Explorer** (https://developers.facebook.com/tools/explorer/)
3. ที่กล่องขวาบน:
   - **Meta App**: เลือก app ที่เพิ่งสร้าง
   - **User or Page**: คลิกดรอปดาวน์ → **Get Page Access Token** → เลือกเพจ → กดอนุญาต
   - **Permissions**: กด "Add permission" เพิ่ม `pages_read_engagement` และ `pages_show_list`
4. กด **Generate Access Token** → คัดลอก token ที่ได้
5. (สำคัญ) Token ที่ได้เป็น **short-lived ~1 ชม.** ต้อง exchange เป็น long-lived ก่อน:
   - คลิกไอคอน ⓘ ข้างช่อง token → **Open in Access Token Tool** → กด **Extend Access Token** → คัดลอก long-lived token
   - หรือเรียก URL นี้ใน browser:
     ```
     https://graph.facebook.com/v19.0/oauth/access_token?
       grant_type=fb_exchange_token
       &client_id={APP_ID}
       &client_secret={APP_SECRET}
       &fb_exchange_token={SHORT_LIVED_TOKEN}
     ```
     (APP_ID + APP_SECRET ดูใน App Dashboard → Settings → Basic)

#### C. ใส่ค่าใน admin
1. เข้าหน้า **admin.html** → login
2. ไปที่ card **"เชื่อมต่อ Facebook"**
   - **Page ID**: วาง Page ID
   - **Page Access Token**: วาง long-lived token
3. กด **บันทึก Facebook** → ระบบเซฟลง Apps Script Properties (ไม่อยู่ใน Firestore — กัน read)
4. กด **ทดสอบ: ดูโพสต์ล่าสุด** เพื่อตรวจสอบ

ตอนนี้ในฟอร์มเพิ่ม/แก้ประกาศจะมีปุ่ม:
- **📥 นำเข้าจาก URL** — paste URL รูปทีละหลายอัน
- **📰 ดึงจากโพสต์ FB** — paste URL โพสต์ → ดึงรูปทั้งหมด + caption
- **📂 เลือกจากโพสต์ล่าสุด** — เปิด modal เลื่อนเลือก 25 โพสต์ล่าสุด

> 🔔 Token หมดอายุ ~60 วัน — ถ้าปุ่ม FB หยุดทำงาน กลับมาทำขั้นตอน B + C ใหม่

---

## 🗂️ โครงสร้าง Firestore

```
listings/{auto_id}
  ├ title        : string  (≤200)
  ├ type         : string  ("บ้าน" / "ที่ดิน" / ...)
  ├ listingMode  : "sale" | "rent"
  ├ status       : "available" | "reserved" | "sold"
  ├ price        : number
  ├ priceUnit    : string  ("ราคาต่อหลัง" ฯลฯ)
  ├ bedrooms     : number
  ├ bathrooms    : number
  ├ usableArea   : number  (ตร.ม.)
  ├ landSize     : number  (ตร.วา)
  ├ parking      : number
  ├ desc         : string
  ├ fbUrl        : string  (ลิงก์โพสต์ FB ของประกาศนี้)
  ├ lat, lng     : number
  ├ imageObjs    : [{ id, url, name }]   ← รูปจาก Google Drive
  ├ createdAt, updatedAt : Timestamp

leads/{auto_id}          ← ฟอร์ม "สนใจประกาศนี้" (คนทั่วไปสร้างได้อย่างเดียว)
  ├ listingId, listingTitle, name, contact, message : string
  ├ handled   : bool
  ├ createdAt : Timestamp

admins/{uid}             ← รายชื่อแอดมิน (สร้างใน Firebase Console เท่านั้น)

meta/types
  └ list : string[]   ← รายชื่อประเภท

meta/site
  ├ phone         : string
  ├ lineId        : string
  ├ lineUrl       : string  (line://ti/p/~...)
  ├ facebookPage  : string  (URL FB page หลัก)
  ├ messengerUrl  : string  (m.me/...)
  ├ aboutText     : string
```

---

## 🔄 ย้ายข้อมูลจากรุ่นเดิม

ข้อมูลรุ่นเดิมยังใช้ได้ทั้งหมด — โค้ดรองรับทั้ง `imageObjs` (ใหม่) และ `imageURLs` (เก่า)

แต่ประกาศเดิมจะยังไม่มีฟิลด์ใหม่ (ห้องนอน, สถานะ, ฯลฯ) — เปิด admin แล้วแก้ทีละรายการเพื่ออัปเดต ระหว่างนี้ระบบจะถือว่า:
- `listingMode` ที่ไม่มี → `"sale"` (ขาย)
- `status` ที่ไม่มี → `"available"` (เปิดขาย)

---

## 🧪 ทดสอบในเครื่อง

```bash
# จะทดสอบ static ก็ใช้ตัวไหนก็ได้:
npx serve .
# หรือ
python3 -m http.server 8000
```

แล้วเปิด http://localhost:8000

---

## 📝 สิ่งที่ยังไม่ได้ทำ (สำหรับอนาคต)

- TypeScript + build process (vite/esbuild) — ตอนนี้ใช้ CDN ทำงานได้แล้ว ไม่จำเป็น
- ย้ายรูปไปอยู่บน CDN จริง ๆ (Cloudflare Images / R2) — `lh3.googleusercontent.com` ฟรีดี แต่บางครั้งช้า
- ระบบ analytics — แนะนำ Plausible หรือ GA4
- PWA / Service Worker
- หน้า /about แยก

---

## 🆘 Troubleshooting

**Q: ขึ้น "Firestore: สิทธิ์ไม่พอ"**
A: ตรวจว่า login แล้ว, Rules ใน Firebase Console เป็นตัวจาก `firestore.rules` และมีเอกสาร `admins/{UID ของคุณ}` (UID ดูได้ในหน้า admin)

**Q: รูปอัปโหลดไม่ขึ้น**
A: ตรวจว่า Apps Script deploy แบบ "Anyone" และ `GAS_SHARED_TOKEN` ใน admin.html ตรงกับใน Code.gs

**Q: รูปขึ้นในแอดมินแต่ไม่ขึ้นในหน้าเว็บ public**
A: ตรวจว่า Drive folder/file ตั้ง sharing เป็น "Anyone with link" (Apps Script ของเราตั้งให้อัตโนมัติทุกไฟล์ใหม่)

**Q: เข้าหน้า admin แล้ว login ไม่ได้**
A: ต้องสร้าง user ใน Firebase Console → Authentication → Users ก่อน — ไม่มีระบบสมัครจากหน้าเว็บ (เจตนา เพื่อกันคนสมัครสุ่ม)

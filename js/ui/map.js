/* ============================================================================
   ui/map.js — Leaflet helpers: tile โทนเทา (OSM + CSS filter — CARTO Positron ต้องใช้ API key),
   หมุดราคาแบบ pill, cluster สีดำ, วงรัศมีตำแหน่งโดยประมาณ
============================================================================ */
import { escapeHTML } from '../core/dom.js';
import { getImageURLs, sizedURL } from '../data/images.js';

export const hasLeaflet = () => typeof window.L !== 'undefined';

/* โหลด Leaflet + MarkerCluster เฉพาะเมื่อหน้าที่มีแผนที่ถูกเปิด (หน้าแรกเร็วขึ้น) — แอดมินโหลดแบบ static อยู่แล้ว */
const LEAFLET = [
  ['css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
  ['css', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'],
  ['js',  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'],
  ['js',  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js']
];
let leafletP = null;
function loadAsset([kind, href]){
  return new Promise((res, rej) => {
    if (document.querySelector((kind === 'css' ? 'link[href="' : 'script[src="') + href + '"]')) return res();
    const el = kind === 'css' ? Object.assign(document.createElement('link'), { rel:'stylesheet', href }) : Object.assign(document.createElement('script'), { src: href });
    el.onload = res; el.onerror = rej;
    document.head.appendChild(el);
  });
}
export function ensureLeaflet(){
  if (hasLeaflet() && (typeof L.markerClusterGroup === 'function' || !document.querySelector('[data-needs-cluster]'))) return Promise.resolve();
  if (!leafletP){
    leafletP = Promise.all(LEAFLET.filter(a => a[0] === 'css').map(loadAsset))
      .then(() => hasLeaflet() ? null : loadAsset(LEAFLET[2]))
      .then(() => typeof L.markerClusterGroup === 'function' ? null : loadAsset(LEAFLET[3]).catch(() => null))
      .catch(e => { leafletP = null; throw e; });
  }
  return leafletP;
}
export const TH_CENTER = [13.736717, 100.523186];

export function monoTiles(){
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap', className: 'tiles-mono'
  });
}

/* base layers เดิม (ถนน / ดาวเทียม / ดาวเทียม + ป้ายชื่อ) — ใช้ในหน้าแอดมินตอนเลือกตำแหน่ง
   tile ของ Esri ใช้ลำดับ {z}/{y}/{x} (y ก่อน x) · ต้องสร้าง instance ใหม่ทุกครั้ง */
export function buildMapLayers(){
  const mono = monoTiles();
  const esriImg = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:19, attribution:'Tiles © Esri'
  });
  const hybridImg = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:19, attribution:'Tiles © Esri'
  });
  const roads = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom:19 });
  const places = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom:19 });
  const hybrid = L.layerGroup([hybridImg, roads, places]);
  return {
    base: { 'ถนน': mono, 'ดาวเทียม': esriImg, 'ดาวเทียม + ป้ายชื่อ': hybrid },
    default: mono
  };
}

export function newMap(el, opts = {}){
  const map = L.map(el, { zoomControl: false, scrollWheelZoom: true, attributionControl: true, ...opts });
  L.control.zoom({ position: opts.zoomPosition || 'bottomright', zoomInTitle: 'ซูมเข้า', zoomOutTitle: 'ซูมออก' }).addTo(map);
  map.attributionControl.setPrefix(false);
  return map;
}

/** ชนิดของประกาศบนแผนที่: เช่า (listingMode=rent) · ที่ดิน (type มีคำว่า ที่ดิน) · บ้าน (ที่เหลือ) */
export const KINDS = {
  land:  { label:'ที่ดิน',  color:'#2E8B1F' },
  house: { label:'บ้าน',    color:'#1F5FD1' },
  rent:  { label:'บ้านเช่า', color:'#D9780F' }
};
export function listingKind(it){
  if (it && it.listingMode === 'rent') return 'rent';
  return /ที่ดิน/.test((it && it.type) || '') ? 'land' : 'house';
}

/** หมุดรูปปก (รูปแรกของประกาศ = รูปปกที่แอดมินเลือกด้วย ⭐) · วงขอบ+ป้ายสีตามชนิด · sold = จาง */
export function thumbPinIcon(it, selected = false){
  const k = listingKind(it), kd = KINDS[k];
  const url = getImageURLs(it)[0];
  const inner = url
    ? `<img src="${escapeHTML(sizedURL(url, 160))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<span class="pin-fallback">' + (k === 'land' ? '🌳' : '🏠') + '</span>';
  return L.divIcon({
    className: 'pm',
    html: `<div class="thumb-marker k-${k}${selected ? ' on' : ''}${it.status === 'sold' ? ' is-sold' : ''}" style="--kc:${kd.color}">${inner}<span class="tm-tag">${kd.label}</span></div>`,
    iconSize: [56, 56], iconAnchor: [28, 28], popupAnchor: [0, -30]
  });
}

/** คำอธิบายสีหมุด (legend) */
export function mapLegend(){
  const d = document.createElement('div');
  d.className = 'map-legend'; d.setAttribute('aria-label', 'คำอธิบายสีหมุด');
  d.innerHTML = Object.values(KINDS).map(k => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join('');
  return d;
}

export function clusterGroup(){
  if (typeof L.markerClusterGroup !== 'function') return L.layerGroup();
  return L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
    iconCreateFunction: (c) => L.divIcon({ html: `<span>${c.getChildCount()}</span>`, className: 'cl-pin', iconSize: [44, 44] })
  });
}

/** ตำแหน่งโดยประมาณ: วงกลมเทาโปร่ง รอบ "จุดแสดงผลที่สุ่มไว้" (ไม่ใช่พิกัดจริง) */
export function approxCircle(pc, it, active = false){
  return L.circle([pc.lat, pc.lng], approxStyle(+it.approxRadius || 300, active));
}
export function approxStyle(radius, active){
  return { radius, color: '#121212', weight: active ? 2 : 1, opacity: active ? .9 : .35, fillColor: '#121212', fillOpacity: active ? .22 : .1 };
}

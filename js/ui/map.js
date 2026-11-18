/* ============================================================================
   ui/map.js — Leaflet helpers: tile โทนเทา (OSM + CSS filter — CARTO Positron ต้องใช้ API key),
   หมุดราคาแบบ pill, cluster สีดำ, วงรัศมีตำแหน่งโดยประมาณ
============================================================================ */
import { escapeHTML } from '../core/dom.js';
import { shortPrice } from '../core/format.js';

export const hasLeaflet = () => typeof window.L !== 'undefined';
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

/** หมุดราคา: pill สีขาว · selected = ดำ · sold = จาง (ข้อความเป็นตัวเลขราคา escape แล้ว) */
export function pricePinIcon(it, selected = false){
  const sold = (it.status === 'sold');
  return L.divIcon({
    className: 'pm',
    html: `<span class="pin-pill${selected ? ' on' : ''}${sold ? ' sold' : ''}">${escapeHTML(shortPrice(it))}</span>`,
    iconSize: [0, 0], iconAnchor: [0, 0]
  });
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

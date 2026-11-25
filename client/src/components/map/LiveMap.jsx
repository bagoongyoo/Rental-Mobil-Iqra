// Peta Leaflet + OpenStreetMap (Dev 3). Dimuat lazy supaya tidak membebani halaman lain.
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PALU = [-0.8917, 119.8707]; // pusat kota Palu, Sulawesi Tengah

function pinIcon(label, active) {
  return L.divIcon({
    className: '',
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38],
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:34px;height:34px;border-radius:999px;display:grid;place-items:center;font:700 13px/1 sans-serif;color:#fff;background:${active ? '#0b6b55' : '#64748b'};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3)">${label}</div>
      <div style="width:3px;height:8px;background:${active ? '#0b6b55' : '#64748b'}"></div></div>`,
  });
}

function FitBounds({ points }) {
  const map = useMap();
  const key = points.map((p) => p.id).join(',');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    else map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 15 });
    // hanya saat daftar marker berubah, bukan tiap update posisi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * points: [{ id, lat, lng, label, title, subtitle, active }]
 * trail: [[lat, lng], ...] (opsional, jejak perjalanan)
 */
export default function LiveMap({ points = [], trail = [], className = 'h-80' }) {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return (
    <div className={className}>
      <MapContainer center={valid[0] ? [valid[0].lat, valid[0].lng] : PALU} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#0b6b55', weight: 4, opacity: 0.7 }} />}
        {valid.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.label, p.active)}>
            <Popup>
              <strong>{p.title}</strong>
              {p.subtitle && <div>{p.subtitle}</div>}
            </Popup>
          </Marker>
        ))}
        <FitBounds points={valid} />
      </MapContainer>
    </div>
  );
}

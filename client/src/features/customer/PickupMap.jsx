// Peta pilih titik jemput / antar (Dev 2). Dimuat lazy supaya Leaflet tidak membebani halaman lain.
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PALU_CENTER } from './palu';

const pin = L.divIcon({
  className: '',
  iconSize: [34, 46],
  iconAnchor: [17, 44],
  html: `<svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))">
    <path d="M17 1C8.2 1 1 8.1 1 16.9 1 28.6 17 45 17 45s16-16.4 16-28.1C33 8.1 25.8 1 17 1z" fill="#0b6b55" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="17" r="6" fill="#fff"/></svg>`,
});

function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [lat, lng, map]);
  return null;
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** lat/lng = titik terpilih (boleh null). onPick(lat, lng) dipanggil saat peta diketuk atau pin digeser. */
export default function PickupMap({ lat, lng, onPick, className = 'h-56' }) {
  const has = lat != null && lng != null;
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 ${className}`}>
      <MapContainer center={has ? [lat, lng] : PALU_CENTER} zoom={has ? 16 : 13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickToPick onPick={onPick} />
        <Recenter lat={lat} lng={lng} />
        {has && (
          <Marker
            position={[lat, lng]}
            icon={pin}
            draggable
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); onPick(p.lat, p.lng); } }}
          />
        )}
      </MapContainer>
    </div>
  );
}

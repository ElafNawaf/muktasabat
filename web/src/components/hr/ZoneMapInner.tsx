"use client";

/** Leaflet map of attendance zones (client-only; see ZoneMap for the dynamic wrapper). */
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

export type Zone = { id: number; name: string; lat: number; lng: number; radius: number; color?: string | null; active?: boolean };
export type Dot = { id: number; name: string; lat: number; lng: number; inside?: boolean | null };

const pin = L.divIcon({
  className: "zm-pin",
  html: '<span class="zm-pin__dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function Fit({ zones, focus }: { zones: Zone[]; focus?: { lat: number; lng: number; radius: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.fitBounds(L.latLng(focus.lat, focus.lng).toBounds(Math.max(focus.radius * 6, 160)), { animate: true });
      return;
    }
    if (zones.length === 0) return;
    const b = L.latLngBounds(zones.map((z) => L.latLng(z.lat, z.lng).toBounds(Math.max(z.radius * 4, 200))).flatMap((x) => [x.getSouthWest(), x.getNorthEast()]));
    map.fitBounds(b, { padding: [24, 24], maxZoom: 17 });
  }, [map, zones, focus?.lat, focus?.lng, focus?.radius]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Picker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function ZoneMapInner({ zones, height = 340, edit, dots = [], onZoneClick }: {
  zones: Zone[]; height?: number; dots?: Dot[];
  edit?: { lat: number; lng: number; radius: number; color?: string | null; onPick: (lat: number, lng: number) => void } | null;
  onZoneClick?: (id: number) => void;
}) {
  const centre = edit ?? zones[0] ?? { lat: 24.7136, lng: 46.6753 };
  return (
    <MapContainer center={[centre.lat, centre.lng]} zoom={16} style={{ height, width: "100%", borderRadius: 14 }} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {zones.map((z) => (
        <Circle key={z.id} center={[z.lat, z.lng]} radius={z.radius}
          pathOptions={{ color: z.color || "#7B1A1A", weight: 2, fillOpacity: z.active === false ? 0.04 : 0.16, dashArray: z.active === false ? "4 4" : undefined, opacity: edit ? 0.45 : 1 }}
          eventHandlers={onZoneClick ? { click: () => onZoneClick(z.id) } : undefined}>
          <Tooltip direction="top" permanent={!edit && zones.length <= 6} className="zm-tip">{z.name} · {z.radius} m</Tooltip>
        </Circle>
      ))}
      {dots.map((d) => (
        <CircleMarker key={`d${d.id}`} center={[d.lat, d.lng]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: d.inside ? "#2f7d4f" : "#c0462a", fillOpacity: 1 }}>
          <Tooltip direction="top">{d.name}</Tooltip>
        </CircleMarker>
      ))}
      {edit && (
        <>
          <Circle center={[edit.lat, edit.lng]} radius={edit.radius} pathOptions={{ color: edit.color || "#7B1A1A", weight: 2.5, fillOpacity: 0.22 }} />
          <Marker position={[edit.lat, edit.lng]} icon={pin} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); edit.onPick(p.lat, p.lng); } }} />
          <Picker onPick={edit.onPick} />
        </>
      )}
      <Fit zones={zones} focus={edit ? { lat: edit.lat, lng: edit.lng, radius: edit.radius } : null} />
    </MapContainer>
  );
}

"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";

const pin = L.divIcon({
  className: "mk-pin",
  html: '<span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

export default function ProjectMapInner({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom={false} className="mk-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]} icon={pin}>
        <Tooltip>{label}</Tooltip>
      </Marker>
    </MapContainer>
  );
}

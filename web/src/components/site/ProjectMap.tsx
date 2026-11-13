"use client";

import dynamic from "next/dynamic";

const Inner = dynamic(() => import("./ProjectMapInner"), {
  ssr: false,
  loading: () => <div className="mk-map mk-map--loading" />,
});

export function ProjectMap(props: { lat: number; lng: number; label: string }) {
  return <Inner {...props} />;
}

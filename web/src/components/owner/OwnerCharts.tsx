"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { sarText } from "@/lib/format";

type M = { month: number; collected: number; net: number; due: number };

export function CashflowChart({ data, labels, locale }: { data: M[]; labels: { months: string[]; collected: string; net: string; due: string }; locale: string }) {
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { notation: "compact", maximumFractionDigits: 1 });
  const rows = data.map((d) => ({ ...d, name: labels.months[d.month - 1] }));
  const rtl = locale === "ar";
  return (
    <div className="ow-chart" role="img" aria-label={`${labels.collected} / ${labels.net}`}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rtl ? [...rows].reverse() : rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#ece7de" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#5d636b" }} />
          <YAxis orientation={rtl ? "right" : "left"} tickFormatter={(v) => fmt.format(v)} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 12, fill: "#5d636b" }} />
          <Tooltip formatter={(v: number) => sarText(v, locale)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="collected" name={labels.collected} fill="#7B1A1A" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="net" name={labels.net} fill="#2F5D50" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line dataKey="due" name={labels.due} stroke="#b99b6b" strokeWidth={2} dot={false} type="monotoneX" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OccupancyRing({ value, label }: { value: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" role="img" aria-label={`${label}: ${pct}%`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="#ece7de" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="#2F5D50" strokeWidth="8" strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1f2328">{Math.round(pct)}%</text>
    </svg>
  );
}

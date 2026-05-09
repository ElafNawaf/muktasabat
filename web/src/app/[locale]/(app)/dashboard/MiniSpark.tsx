"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Tiny sparkline shown at the bottom of each hero KPI card. */
export function MiniSpark({
  peak,
  color,
}: {
  peak: number;
  color: string;
}) {
  // Deterministic synthesized series based on `peak` so the line moves but is
  // stable across re-renders. Real per-KPI series are a follow-up once analytics
  // grow a sparkline endpoint.
  const data = Array.from({ length: 12 }, (_, i) => ({
    x: i,
    y: Math.round(peak * (0.55 + Math.sin(i * 0.7) * 0.15 + i * 0.025)),
  }));
  const id = `sp-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height={38}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="y"
          stroke={color}
          strokeWidth={1.6}
          fill={`url(#${id})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTheme } from "@/components/ThemeProvider";

type Point = { label: string; collected: number; expected: number };

export function RevenueTrendChart({
  data,
  labels,
}: {
  data: Point[];
  labels: { collected: string; expected: string };
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const grid = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const axis = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <defs>
          <linearGradient id="grad-collected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7B1A1A" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#7B1A1A" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-expected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9CA3AF" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#9CA3AF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{
            background: isDark ? "#1F1A1B" : "#FFFFFF",
            border: "1px solid " + (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"),
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            padding: "8px 10px",
          }}
        />
        <Area
          type="monotone"
          dataKey="expected"
          name={labels.expected}
          stroke="#9CA3AF"
          strokeWidth={1.4}
          fill="url(#grad-expected)"
        />
        <Area
          type="monotone"
          dataKey="collected"
          name={labels.collected}
          stroke="#7B1A1A"
          strokeWidth={2}
          fill="url(#grad-collected)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

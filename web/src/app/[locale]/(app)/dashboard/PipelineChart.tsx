"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTheme } from "@/components/ThemeProvider";

/** Bar chart: new vs ending contracts by month. */
export function PipelineChart({
  data,
  labels,
  rtl = false,
}: {
  data: { m: string; new: number; ending: number }[];
  labels: { new: string; ending: string };
  rtl?: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const grid = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const axis = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const tooltipStyle = {
    background: isDark ? "#1F1A1B" : "#FFFFFF",
    border: "1px solid " + (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"),
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
    padding: "8px 10px",
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 6, right: 8, left: -8, bottom: 0 }}
        barCategoryGap="35%"
      >
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis
          dataKey="m"
          stroke={axis}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          reversed={rtl}
        />
        <YAxis
          stroke={axis}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          orientation={rtl ? "right" : "left"}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid }} />
        <Bar name={labels.new} dataKey="new" fill="#7B1A1A" radius={[6, 6, 0, 0]} />
        <Bar name={labels.ending} dataKey="ending" fill="#F59E0B" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

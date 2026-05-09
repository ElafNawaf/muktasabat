"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useTheme } from "@/components/ThemeProvider";

export type DonutSlice = { name: string; value: number; color: string };

export function PortfolioDonut({
  data,
  centerValue,
  centerLabel,
}: {
  data: DonutSlice[];
  centerValue: string;
  centerLabel: string;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const tooltipStyle = {
    background: isDark ? "#1F1A1B" : "#FFFFFF",
    border: "1px solid " + (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"),
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
    padding: "8px 10px",
  };

  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={86}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <div className="v">
          {centerValue}
          <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>%</span>
        </div>
        <div className="l">{centerLabel}</div>
      </div>
    </div>
  );
}

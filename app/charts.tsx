"use client";
import { useId } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Row, amount as n, rupees as rs, day } from "./ui";
export function Sparkline({
  data,
  color,
  label,
}: {
  data: { x: string; v: number }[];
  color: string;
  label: string;
}) {
  const id = useId().replaceAll(":", "");
  return (
    <figure className="spark" aria-label={label}>
      <div className="sparkPlot" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={"url(#" + id + ")"}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
export function Trend({
  data,
  budget = false,
}: {
  data: Row[];
  budget?: boolean;
}) {
  const id = useId();
  const fmt = (s: string) =>
    new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    });
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 14, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3d5afe" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#7a5af0" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 4"
            stroke="#e6e8f3"
          />
          <XAxis
            dataKey="day"
            tickFormatter={fmt}
            minTickGap={32}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8a8fab" }}
          />
          <YAxis
            width={45}
            tickFormatter={(v) => (v >= 1000 ? v / 1000 + "k" : String(v))}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8a8fab" }}
          />
          <Tooltip
            labelFormatter={(x) => day(String(x))}
            formatter={(v) => (budget ? rs(v) : n(v))}
          />
          <Area
            type="linear"
            name={budget ? "Net spend" : "Registrations"}
            dataKey={budget ? "cumulative_spend" : "cumulative"}
            stroke="#3d5afe"
            strokeWidth={2.5}
            fill={"url(#" + id + ")"}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            name={budget ? "Approved budget" : "Expected pace"}
            dataKey={budget ? "approved" : "expected"}
            stroke="#a3a8c3"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

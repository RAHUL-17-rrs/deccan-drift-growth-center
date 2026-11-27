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
              <stop offset="0%" stopColor="#509d79" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#509d79" stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 4"
            stroke="#dbe5dd"
          />
          <XAxis
            dataKey="day"
            tickFormatter={fmt}
            minTickGap={32}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#63736c" }}
          />
          <YAxis
            width={45}
            tickFormatter={(v) => (v >= 1000 ? v / 1000 + "k" : String(v))}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#63736c" }}
          />
          <Tooltip
            labelFormatter={(x) => day(String(x))}
            formatter={(v) => (budget ? rs(v) : n(v))}
          />
          <Area
            type="linear"
            name={budget ? "Net spend" : "Registrations"}
            dataKey={budget ? "cumulative_spend" : "cumulative"}
            stroke="#186e52"
            strokeWidth={3}
            fill={"url(#" + id + ")"}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            name={budget ? "Approved budget" : "Expected pace"}
            dataKey={budget ? "approved" : "expected"}
            stroke="#9b9e84"
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

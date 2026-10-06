"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const axis = { stroke: "#6b6b76", fontSize: 11, tickLine: false };

export function ClicksLeadsChart({ data }: { data: { date: string; clicks: number; leads: number }[] }) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#26262e" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b6b76", fontSize: 11 }}
            axisLine={{ stroke: "#26262e" }}
            tickLine={false}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={28}
          />
          <YAxis tick={{ fill: "#6b6b76", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{
              background: "#16161b",
              border: "1px solid #26262e",
              borderRadius: 12,
              fontSize: 12,
              color: "#f4f4f5",
            }}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Line type="monotone" dataKey="clicks" stroke="#5b9bff" strokeWidth={2.5} dot={false} name="Clicks" />
          <Line type="monotone" dataKey="leads" stroke="#3ecf8e" strokeWidth={2.5} dot={false} name="Leads" />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-ink-muted">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-clicks" />Clicks</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-leads" />Leads</span>
      </div>
    </div>
  );
}

export function Funnel({ clicks, leads, cr }: { clicks: number; leads: number; cr: number }) {
  const leadWidth = clicks > 0 ? Math.max((leads / clicks) * 100, leads > 0 ? 6 : 0) : 0;
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-ink-muted">Clicks</span>
          <span className="num font-medium text-ink">{clicks.toLocaleString()} · 100%</span>
        </div>
        <div className="flex h-12 items-center rounded-xl bg-clicks px-4 font-medium text-white">Top of funnel</div>
      </div>
      <div className="flex justify-center text-ink-faint">↓</div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-ink-muted">Leads</span>
          <span className="num font-medium text-ink">
            {leads.toLocaleString()} · {cr.toFixed(1)}%
          </span>
        </div>
        <div
          className="flex h-12 min-w-[120px] items-center rounded-xl bg-leads px-4 font-medium text-white transition-all"
          style={{ width: `${Math.min(leadWidth, 100)}%` }}
        >
          Conversion
        </div>
      </div>
    </div>
  );
}

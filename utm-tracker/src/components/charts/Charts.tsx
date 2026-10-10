"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { formatNumber, formatPercent } from "@/lib/utils";

const COLORS = [
  "#4f8ef7", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa",
  "#06b6d4", "#f97316", "#ec4899", "#10b981", "#64748b",
];

const axis = { stroke: "#6b6b76", fontSize: 11, tickLine: false };

/* ─── Line chart ─────────────────────────────────────── */
export function ClicksLeadsChart({ data }: { data: { date: string; clicks: number; submits: number; leads: number }[] }) {
  return (
    <div className="h-[280px] w-full">
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
            contentStyle={{ background: "#16161b", border: "1px solid #26262e", borderRadius: 12, fontSize: 12, color: "#f4f4f5" }}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Line type="monotone" dataKey="clicks" stroke="#5b9bff" strokeWidth={2.5} dot={false} name="Clicks" />
          <Line type="monotone" dataKey="submits" stroke="#a78bfa" strokeWidth={2.5} dot={false} name="Submits" />
          <Line type="monotone" dataKey="leads" stroke="#3ecf8e" strokeWidth={2.5} dot={false} name="Leads" />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-ink-muted">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-clicks" />Clicks</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-submits" />Submits</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-leads" />Leads</span>
      </div>
    </div>
  );
}

/* ─── Funnel ─────────────────────────────────────────── */
function FunnelStep({ label, count, pct, width, bar, caption }: {
  label: string; count: number; pct: number; width: number; bar: string; caption: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="num font-medium text-ink">{count.toLocaleString()} · {pct.toFixed(1)}%</span>
      </div>
      <div
        className={`flex h-12 min-w-[120px] items-center rounded-xl px-4 font-medium text-white transition-all ${bar}`}
        style={{ width: `${Math.min(width, 100)}%` }}
      >
        {caption}
      </div>
    </div>
  );
}

export function Funnel({ clicks, submits, leads }: { clicks: number; submits: number; leads: number }) {
  const pct = (n: number) => (clicks > 0 ? (n / clicks) * 100 : 0);
  const width = (n: number) => (clicks > 0 ? Math.max(pct(n), n > 0 ? 6 : 0) : 0);
  return (
    <div className="space-y-5">
      <FunnelStep label="Clicks" count={clicks} pct={clicks > 0 ? 100 : 0} width={100} bar="bg-clicks" caption="Top of funnel" />
      <div className="flex justify-center text-ink-faint">↓</div>
      <FunnelStep label="Submits" count={submits} pct={pct(submits)} width={width(submits)} bar="bg-submits" caption="Pressed “Отправить заявку”" />
      <div className="flex justify-center text-ink-faint">↓</div>
      <FunnelStep label="Leads" count={leads} pct={pct(leads)} width={width(leads)} bar="bg-leads" caption="Conversion" />
    </div>
  );
}

/* ─── Donut chart ────────────────────────────────────── */
type Row = { key: string; clicks: number; submits: number; leads: number; cr: number };

function DonutChart({ data, field }: { data: { name: string; value: number }[]; field: "Clicks" | "Leads" }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wide">{field}</p>
      <div className="h-[180px] w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#16161b", border: "1px solid #26262e", borderRadius: 10, fontSize: 11, color: "#f4f4f5" }}
              formatter={(v: number) => [`${v} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`, field]}
              labelStyle={{ color: "#e4e4e7" }}
              itemStyle={{ color: "#f4f4f5" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.slice(0, 7).map((d, i) => (
          <span key={d.name} className="flex items-center gap-1 text-[11px] text-ink-muted">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Breakdown panel (donuts + table) ──────────────── */
export function BreakdownPanel({ title, head, rows }: { title: string; head: string; rows: Row[] }) {
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalLeads  = rows.reduce((s, r) => s + r.leads,  0);

  const clicksData = rows.slice(0, 8).map((r) => ({ name: r.key, value: r.clicks }));
  const leadsData  = rows.slice(0, 8).map((r) => ({ name: r.key, value: r.leads  }));

  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-faint">No data yet.</p>
      ) : (
        <>
          {/* donuts */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <DonutChart data={clicksData} field="Clicks" />
            <DonutChart data={leadsData}  field="Leads"  />
          </div>

          {/* table */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 font-medium">{head}</th>
                  <th className="pb-2 text-right font-medium">Clicks</th>
                  <th className="pb-2 text-right font-medium">% clicks</th>
                  <th className="pb-2 text-right font-medium">Submits</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">% leads</th>
                  <th className="pb-2 text-right font-medium">CR%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={r.key} className="hover:bg-bg-hover/40">
                    <td className="py-2.5 flex items-center gap-2 text-ink">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      {r.key}
                    </td>
                    <td className="num py-2.5 text-right text-ink-muted">{formatNumber(r.clicks)}</td>
                    <td className="num py-2.5 text-right text-ink-muted">
                      {totalClicks > 0 ? `${((r.clicks / totalClicks) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num py-2.5 text-right text-submits">{formatNumber(r.submits)}</td>
                    <td className="num py-2.5 text-right text-leads">{formatNumber(r.leads)}</td>
                    <td className="num py-2.5 text-right text-ink-muted">
                      {totalLeads > 0 ? `${((r.leads / totalLeads) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num py-2.5 text-right font-medium text-ink">
                      {r.clicks ? `${r.cr.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

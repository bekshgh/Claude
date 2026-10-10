"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TableSection, TableView } from "@/lib/reports/types";
import { formatValue } from "./format";

export const SERIES = ["#5b9bff", "#3ecf8e", "#f6b352", "#a78bfa", "#f87171", "#06b6d4", "#f97316", "#ec4899", "#94a3b8"];

/** Worst → best bands, e.g. 1–3 / 4–6 / 7–8 / 9–10. */
function scaleColors(n: number): string[] {
  const all = ["#f87171", "#f6b352", "#5b9bff", "#3ecf8e"];
  return n >= 4 ? [...Array(n - 4).fill("#94a3b8"), ...all].slice(-n) : all.slice(4 - n);
}

const tick = { fill: "#8b8b96", fontSize: 11 };
const tooltipStyle = {
  contentStyle: { background: "#16161b", border: "1px solid #26262e", borderRadius: 12, fontSize: 12, color: "#f4f4f5" },
  labelStyle: { color: "#a1a1aa" },
  itemStyle: { color: "#f4f4f5" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

type BarsView = Extract<TableView, { type: "bars" }>;
type LineView = Extract<TableView, { type: "line" }>;
type DoughnutView = Extract<TableView, { type: "doughnut" }>;

/** Data rows for charts: the summary row ("All…", "Total") is left out. */
function chartRows(t: TableSection) {
  return t.rows.filter((_, i) => i !== t.totalRow);
}

/** Recharts names its clip-path after the chart id; without a unique id every
 * chart on the page shares one clip and bars of one chart vanish in another. */
function chartId(t: TableSection, v: TableView) {
  return `c-${t.id}-${t.views.indexOf(v)}`.replace(/[^A-Za-z0-9_-]/g, "");
}

function label(t: TableSection, row: TableSection["rows"][number], col: number) {
  return formatValue(row[col], t.columns[col].format);
}

export function describeChart(t: TableSection, v: TableView): string {
  const what = v.type === "bars" || v.type === "line" ? v.values.map((i) => t.columns[i]?.label).join(", ") : "";
  return `${v.type === "line" ? "Линейный график" : v.type === "doughnut" ? "Кольцевая диаграмма" : "Столбчатая диаграмма"}: ${what || t.columns[(v as DoughnutView).value]?.label} — ${chartRows(t).length} значений. Точные значения — в таблице.`;
}

export function BarsChart({ t, v }: { t: TableSection; v: BarsView }) {
  const rows = chartRows(t);
  const data = rows.map((r) => {
    const o: Record<string, string | number | null> = { name: label(t, r, v.label) };
    v.values.forEach((ci) => (o[`s${ci}`] = typeof r[ci] === "number" ? (r[ci] as number) : null));
    return o;
  });
  const fmt = t.columns[v.values[0]]?.format ?? { kind: "number" as const };
  const horizontal = v.horizontal;
  const longest = Math.max(...data.map((d) => String(d.name).length), 4);
  const height = horizontal ? Math.max(180, rows.length * (v.stacked ? 30 : 26 * Math.max(1, v.values.length * 0.6)) + 40) : 280;
  const colors = v.palette === "scale" ? scaleColors(v.values.length) : SERIES;
  const tickFmt = (x: number) => formatValue(x, { ...fmt, decimals: fmt.kind === "percent" ? 0 : fmt.decimals });

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart id={chartId(t, v)} data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#26262e" vertical={!horizontal} horizontal={horizontal ? false : true} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={tickFmt} domain={v.percent ? [0, 1] : [0, "auto"]} />
              <YAxis type="category" dataKey="name" tick={tick} axisLine={false} tickLine={false} width={Math.min(200, longest * 6.5 + 12)} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={tick} axisLine={{ stroke: "#26262e" }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={tickFmt} />
            </>
          )}
          <Tooltip {...tooltipStyle} formatter={(x: number, _n, item) => [formatValue(x, t.columns[Number(String(item.dataKey).slice(1))]?.format ?? fmt), item.name]} />
          {v.values.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />}
          {v.values.map((ci, i) => (
            <Bar
              key={ci}
              dataKey={`s${ci}`}
              name={t.columns[ci].label}
              stackId={v.stacked ? "s" : undefined}
              fill={colors[i % colors.length]}
              radius={v.stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 18 : 36}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeriesChart({ t, v }: { t: TableSection; v: LineView }) {
  const rows = chartRows(t);
  const data = rows.map((r) => {
    const o: Record<string, string | number | null> = { name: label(t, r, v.label) };
    v.values.forEach((ci) => (o[`s${ci}`] = typeof r[ci] === "number" ? (r[ci] as number) : null));
    return o;
  });
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart id={chartId(t, v)} data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#26262e" vertical={false} />
          <XAxis dataKey="name" tick={tick} axisLine={{ stroke: "#26262e" }} tickLine={false} minTickGap={16} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...tooltipStyle} formatter={(x: number, _n, item) => [formatValue(x, t.columns[Number(String(item.dataKey).slice(1))].format), item.name]} />
          {v.values.map((ci, i) => (
            <Line key={ci} type="monotone" dataKey={`s${ci}`} name={t.columns[ci].label} stroke={SERIES[i % SERIES.length]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DoughnutChart({ t, v }: { t: TableSection; v: DoughnutView }) {
  const rows = chartRows(t).filter((r) => typeof r[v.value] === "number" && (r[v.value] as number) > 0);
  const data = rows.map((r) => ({ name: label(t, r, v.label), value: r[v.value] as number }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
      <div className="h-[200px] w-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(x: number) => [`${formatValue(x, t.columns[v.value].format)} · ${((x / total) * 100).toFixed(1)}%`, t.columns[v.value].label]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            <span className="text-ink">{d.name}</span>
            <span className="num ml-auto pl-4 text-ink-muted">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

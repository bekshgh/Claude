import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ReportAdminActions } from "@/components/reports/ReportAdminActions";
import { ReportUpload } from "@/components/reports/ReportUpload";
import { ReportView } from "@/components/reports/ReportView";
import { prisma } from "@/lib/db";
import type { ReportDocument } from "@/lib/reports/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportAdminPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const report = await prisma.report.findUnique({ where: { id: params.id } });
  if (!report) notFound();
  const doc = report.data as unknown as ReportDocument;

  const count = (kind: string) => doc.sheets.reduce((a, s) => a + s.sections.filter((x) => x.kind === kind).length, 0);
  const cards = doc.sheets.reduce(
    (a, s) => a + s.sections.reduce((b, x) => b + (x.kind === "kpiGroup" ? x.cards.length : 0), 0),
    0,
  );
  const stats: [string, number][] = [
    ["вкладок", doc.sheets.length],
    ["таблиц", count("table")],
    ["KPI-карточек", cards],
    ["блоков выводов", count("callouts")],
  ];

  return (
    <>
      <PageHeader
        breadcrumb="Reports"
        title={report.title}
        subtitle={`${report.sourceFileName ?? "файл"} · обновлён ${formatDateTime(report.updatedAt)}${
          report.publishedAt ? ` · опубликован ${formatDateTime(report.publishedAt)}` : ""
        }`}
        action={<Link href="/reports" className="btn-ghost">← Все отчёты</Link>}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Публикация</h2>
            <Pill label={report.status === "published" ? "опубликован" : "черновик"} tone={report.status === "published" ? "success" : "paused"} />
          </div>
          <ReportAdminActions id={report.id} slug={report.slug} status={report.status} visibility={report.visibility} />
        </section>

        <section className="card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">Что нашлось в файле</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse rounded-xl border border-line bg-bg-raised/60 p-3">
                <dt className="text-xs text-ink-faint">{label}</dt>
                <dd className="num text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          {doc.skippedSheets.length > 0 && (
            <p className="mt-4 text-xs text-ink-faint">
              Не импортируются (сырые и личные данные): {doc.skippedSheets.map((s) => `${s.name} — ${s.rows} строк`).join(" · ")}
            </p>
          )}
          {doc.warnings.length === 0 ? (
            <p className="mt-4 text-sm text-leads">✓ Все ожидаемые блоки распознаны.</p>
          ) : (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
              <p className="font-medium text-accent">⚠ Предупреждения парсера ({doc.warnings.length})</p>
              <ul className="mt-2 space-y-1 text-ink-muted">
                {doc.warnings.map((w, i) => (
                  <li key={i}>
                    {[w.sheet, w.section].filter(Boolean).join(" · ")}: {w.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">Отчёт можно опубликовать: не найденные блоки просто не показываются.</p>
            </div>
          )}
        </section>
      </div>

      <details className="card mb-6 p-6">
        <summary className="cursor-pointer font-display text-lg font-semibold">Заменить файл (новая версия того же события)</summary>
        <p className="mb-4 mt-2 text-sm text-ink-muted">Ссылка и статус сохранятся, данные отчёта заменятся новым файлом того же типа.</p>
        <ReportUpload mode="replace" reportId={report.id} />
      </details>

      <section className="rounded-2xl border border-dashed border-line p-4 sm:p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-ink-faint">Предпросмотр — так отчёт увидят по ссылке</p>
        <ReportView doc={doc} initialTab={searchParams.tab} />
      </section>
    </>
  );
}

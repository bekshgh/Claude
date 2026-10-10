import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ReportUpload } from "@/components/reports/ReportUpload";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VIS = { private: "приватный", link: "по ссылке", public: "публичный" } as const;

export default async function ReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, eventName: true, type: true, status: true, visibility: true, createdAt: true },
  });

  return (
    <>
      <PageHeader
        breadcrumb="Reports"
        title="Отчёты"
        subtitle="Загрузите Excel-анализ события (Feedback или Registration) — сайт покажет его как интерактивный отчёт."
      />

      <section className="card mb-6 p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Новый отчёт</h2>
        <ReportUpload mode="create" />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">Все отчёты</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-6 py-3 font-medium">Отчёт</th>
                <th className="px-6 py-3 font-medium">Тип</th>
                <th className="px-6 py-3 font-medium">Статус</th>
                <th className="px-6 py-3 font-medium">Видимость</th>
                <th className="px-6 py-3 text-right font-medium">Загружен</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-ink-faint">Пока нет ни одного отчёта.</td>
                </tr>
              )}
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-bg-hover/40">
                  <td className="px-6 py-3">
                    <Link href={`/reports/${r.id}`} className="font-medium text-ink hover:text-accent">{r.title}</Link>
                    {r.eventName && <p className="text-xs text-ink-faint">{r.eventName}</p>}
                  </td>
                  <td className="px-6 py-3 text-ink-muted">{r.type === "feedback" ? "Feedback" : "Registration"}</td>
                  <td className="px-6 py-3">
                    <Pill label={r.status === "published" ? "опубликован" : "черновик"} tone={r.status === "published" ? "success" : "paused"} />
                  </td>
                  <td className="px-6 py-3 text-ink-muted">{VIS[r.visibility]}</td>
                  <td className="px-6 py-3 text-right text-xs text-ink-faint">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

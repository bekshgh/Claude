import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectsExplorer } from "@/components/projects/ProjectsExplorer";
import { prisma } from "@/lib/db";
import { queryProjects } from "@/lib/projects/query";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const [{ state, result, types, rows }, views] = await Promise.all([
    queryProjects(prisma, searchParams, { admin: true }),
    prisma.savedView.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, query: true } }),
  ]);
  const compareRows = state.cmp.map((slug) => rows.find((r) => r.slug === slug)).filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <>
      <PageHeader
        breadcrumb="Projects"
        title="Проекты"
        subtitle="Найти проект, сравнить сопоставимые, увидеть, что работает и где проблемы."
        action={<Link href="/projects/new" className="btn-primary">+ Новый проект</Link>}
      />
      <ProjectsExplorer state={state} result={result} types={types} views={views} compareRows={compareRows} />
    </>
  );
}

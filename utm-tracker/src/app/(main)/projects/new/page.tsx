import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_PROJECT, ProjectForm } from "@/components/projects/ProjectForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const types = await prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader breadcrumb="Projects" title="Новый проект" action={<Link href="/projects" className="btn-ghost">← Все проекты</Link>} />
      <section className="card max-w-3xl p-6">
        <ProjectForm initial={EMPTY_PROJECT} types={types.map((t) => ({ value: t.key, label: t.name }))} />
      </section>
    </>
  );
}

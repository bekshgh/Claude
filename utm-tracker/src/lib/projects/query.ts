import type { PrismaClient } from "@prisma/client";
import { runQuery, visibleRows, type QueryResult } from "./filters/engine";
import { parseState, type FilterState } from "./filters/state";
import { loadProjectRows, type ProjectRow } from "./rows";
import { getProjectSettings, type ProjectSettings } from "./settings";

export interface ProjectsPage {
  state: FilterState;
  result: QueryResult;
  settings: ProjectSettings;
  types: { value: string; label: string }[];
  /** Every project the viewer may see (for compare / similar), unfiltered. */
  rows: ProjectRow[];
}

/** One call for the page and the API: rows + settings + types → filtered result. */
export async function queryProjects(
  db: PrismaClient,
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  opts: { admin: boolean; now?: Date },
): Promise<ProjectsPage> {
  const [rows, settings, types] = await Promise.all([
    loadProjectRows(db),
    getProjectSettings(db),
    db.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const state = parseState(params, opts.admin);
  const typeOptions = types.map((t) => ({ value: t.key, label: t.name }));
  const result = runQuery(rows, state, { settings, admin: opts.admin, now: opts.now, types: typeOptions });
  return { state, result, settings, types: typeOptions, rows: visibleRows(rows, opts.admin) };
}

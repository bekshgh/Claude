# Project filters (Projects)

The `/projects` page helps an organizer answer five questions:

| Question | Answered by |
|---|---|
| **Find** the project I remember | search (case-insensitive, Cyrillic ⇄ Latin), type, period and seasons, status |
| **Compare like with like** | type, format, scale, audience, "Similar projects", comparing up to 6 projects side by side |
| **What works** | scores, NPS proxy, strongest area, most praised, channels; the "Best" view |
| **Where it hurts** | weakest area, most criticised, low response rate; the "Needs attention" view |
| **What's missing** | the "Data" filter, the "No feedback" view |

The site is behind a login; every user is an admin.

## Where the numbers come from

```
Report (ReportDocument JSON) ──► computeMetrics() ──► ProjectMetrics (1 row per project) ──► filters
        ▲ projectId                     ▲ ThemeMapping (themes → shared dictionary)
```

- A **project** (`Project`) is an event: a type from the `ProjectType`
  dictionary, format, status, dates, city, venue, owner team, tags. Reports are
  attached to a project on upload or on the report page.
- **`ProjectMetrics`** holds denormalised numbers from the attached reports (the
  latest report of each type). They are recomputed in the same transaction as
  any report change: upload, file replacement, moving to another project,
  deletion, editing the theme mapping. Filters never read report JSON.
- **No data is `null`, never `0`.** A numeric filter does not match a project
  without a value; the list shows "N hidden with no data for this filter · Show".
- **Scales** are normalised to /10 when computed (1–5 × 2), not when displayed.
- **Open-answer themes** are mapped to a shared dictionary (`THEMES`). When a
  feedback report is uploaded, a mapping is suggested by keywords (RU / KK / EN);
  an admin confirms or corrects it on the report page. Unmapped themes are
  ignored by the filters.
- **Response rate** = feedback responses ÷ unique registrants. It needs both
  reports of the same project (without a registration report, the "… of N
  registrants" caption in the feedback file is used).

## Code map

```
src/lib/projects/
  dictionaries.ts     areas, themes, channel groups, study stages, concentration (+ keyword matching)
  metrics.ts          ReportDocument → ComputedMetrics (pure function, METRICS_VERSION)
  recompute.ts        ProjectMetrics recompute, ThemeMapping on upload
  settings.ts         thresholds (AppSetting "projects.thresholds", defaults)
  rows.ts             Project + ProjectMetrics → ProjectRow (one query, no N+1)
  query.ts            entry point for the page and GET /api/projects
  filters/registry.ts THE single list of filters, quick views and sorts
  filters/state.ts    URL ⇄ state (zod; junk is dropped)
  filters/engine.ts   matching, facet counts, histograms, relative filters, sorting
src/components/projects/  panel, widgets, list, compare, forms
```

Everything in the UI — groups, widgets, chips, URL, counts, histograms — is
derived from `registry.ts`. Logic: values inside one filter are OR-ed, filters
are AND-ed. The count next to a value is how many projects remain if you pick
it, given all the other filters (but not this one).

### URL

Short, stable keys, no JSON:

```
/projects?type=forum,hackathon&season=2026-autumn&score10=9..10&enough=1&sort=-score&view=table&cmp=a,b
```

`a..b` is a range (either end may be omitted), `date=season|12m|lastyear|2026-01-01..2026-06-30`,
`nulls=1` shows projects without data. Range values are in display units
(percentages as 5, not 0.05).

## Adding a filter

1. If the metric doesn't exist yet, add a `ProjectMetrics` column
   (`schema.prisma` + migration), compute it in `metrics.ts` and bump
   `METRICS_VERSION`.
2. Add an entry to `FILTERS` (`filters/registry.ts`):
   ```ts
   { key: "speakers10", label: "Speaker score", group: "results", kind: "range",
     field: "speakerScore10", appliesTo: ["forum"], nullPolicy: "exclude", unit: "/10", decimals: 1,
     help: "Average rating of the speaker sessions, /10." },
   ```
   - `key` is also the URL parameter; don't change it after release (saved views use it).
   - `kind`: `search | multiselect | tags | range | boolean | dateRange | relative`.
   - `field` is a row column, or use `get(row, ctx)` for derived values.
   - `appliesTo` is `"all"` or project type keys: such a filter is shown first
     when one of those types is selected, and labelled with its types otherwise.
   - `options` for lists: an array, or a function of the data (city, team…).
   - `scale` is a display multiplier (shares are stored 0..1 and shown in %).
   - `visibility: "admin"` marks an admin-only filter.
3. Recompute the metrics: `npm run projects:recompute` (or `-- --outdated`).
4. Tests: add a case to `tests/projects/filters.test.ts`. The facet-count test
   automatically checks that each value's count matches the real result.

A filter with no data in any project is hidden from the panel.

## Adding a quick view

A simple view is a query string in `PRESETS`. If it needs an OR across
different metrics (like "Needs attention"), add a `group: "presets",
kind: "boolean"` filter with a `get` function to `FILTERS` and reference it from `PRESETS`.

## Adding a project type

Use "+ type" in the project form (or `POST /api/project-types`). A type is
stored in the dictionary with a Latin key (`workshop`), used in URLs and in
`appliesTo`. The starter types (Forum, Case championship, Hackathon) come from
the migration.

## Thresholds

Settings → "Project thresholds" (stored in `AppSetting`, defaults in `settings.ts`):

| Threshold | Default |
|---|---|
| Enough responses | n ≥ 30 **and** response rate ≥ 5% |
| Small sample | n < 10 |
| Bursty campaign | > 20% of registrations on one day |
| "Needs attention" | done, and the score is below its type's median, or the weakest area < 8.5/10, or response rate < 5% |
| "No feedback" | held > 7 days ago, has a registration report, no feedback report |
| Relative filters | ≥ 4 comparable projects of the same type |

## Honest comparisons

- Scores from projects with n below the small-sample threshold get a badge, go
  after the rest when sorting by score, and are left out of relative filters.
- Relative filters only use completed projects; "above the median of its type"
  is disabled when the type has fewer projects than the threshold.
- Counts, histograms and views only count projects the viewer can see
  (`visibleRows` in `engine.ts`).

## Demo data and tests

```bash
npm run db:seed:demo                 # ~20 demo projects + the real ÖZGE Forum S'26
npm run db:seed:demo -- --count 1000 # load-test set
npm run db:seed:demo -- --reset      # remove demo projects
npm test                             # everything except database tests
TEST_DATABASE_URL=postgresql://… npm test   # + metric recompute against a real Postgres
```

The seed refuses to run when `NODE_ENV=production` or `VERCEL_ENV=production`.
Demo projects are flagged `demo = true`; their metrics are made up and the bulk
recompute leaves them alone.

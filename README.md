# Estratégia de Portfólio (Gantt)

Web app for **portfolio and quarterly planning**: a Gantt-style view of work items (epics and child tasks) with **planned** vs **actual** timelines, hierarchy, assignees, and export back to spreadsheet format.

Bootstrapped from [create-t3-app](https://create.t3.gg/) (T3-style layout: env validation, Drizzle, TypeScript).

## Features

- **Automatic load** on startup from `query_devops.xlsx` in the project root (Azure DevOps–style export: header row with `ID`, `Work Item Type`, date columns, etc.).
- **CSV upload** as an alternative source; delimiter is auto-detected (`,` or `;`). Expect columns such as `Title`, `Start Date`, and optionally `Work Item Type`, assignee fields, and hierarchy.
- **Interactive timeline**: drag and resize plan and actual bars, collapse parents, undo/redo, and “dirty” state with a warning before leaving the page when there are unsaved changes.
- **Save**: writes a new Excel file on the server, `planejamento_exportado_<timestamp>.xlsx`, preserving original columns when data came from a loaded sheet.

## Stack

- [Next.js](https://nextjs.org) 15 (App Router), React 19
- [Tailwind CSS](https://tailwindcss.com) 4
- [Drizzle ORM](https://orm.drizzle.team) + LibSQL (`@libsql/client`) — schema exists for future use; the planner currently uses file-based Excel/CSV via `src/server/excel-store.ts` and `src/app/api/csv/route.ts`
- [SheetJS / xlsx](https://sheetjs.com/) for reading and writing `.xlsx`

## Prerequisites

- [Bun](https://bun.sh) (see `packageManager` in `package.json` for the pinned version)
- `DATABASE_URL` — valid URL for SQLite/LibSQL (required by env validation at build time even if you only use the Excel flow). Example for local file DB: `file:./local.db`

## Setup

```bash
bun install
```

Place your input workbook at **`query_devops.xlsx`** in the repo root if you want the default startup dataset (the API returns an empty list if the file is missing).

```bash
cp .env.example .env   # if you maintain one; otherwise set DATABASE_URL in .env
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `bun run dev`  | Dev server (Turbopack)               |
| `bun run build` / `bun run start` | Production build and server |
| `bun run check` | Lint + TypeScript check            |
| `bun run db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle CLI |

To skip strict env validation (e.g. Docker): set `SKIP_ENV_VALIDATION` as documented in `src/env.js`.

## Project layout (high level)

- `src/app/page.tsx` — main UI: Gantt, CSV parsing, state, save/load
- `src/app/api/csv/route.ts` — `GET` reads Excel via store; `POST` exports XLSX to disk
- `src/server/excel-store.ts` — reads `query_devops.xlsx`, normalizes Excel serial dates
- `src/server/db/` — Drizzle schema and client (example `posts` table; prefixed `gantt_*`)

## Deploy notes

The app expects filesystem access for `query_devops.xlsx` and for writing export files next to the process cwd. Serverless hosts with read-only disks need a different storage strategy if you rely on those paths.

# AGENTS.md — calendarizacao (Gantt)

## Commands

Always use **bun** (never npm/pnpm/yarn). Pinned version: `bun@1.3.13`.

| Action | Command |
|---|---|
| dev server | `bun run dev` (Turbopack, port 3000) |
| lint + typecheck | `bun run check` |
| typecheck only | `bun run typecheck` |
| lint only | `bun run lint` |
| format | `bun run format:write` |
| format check | `bun run format:check` |

Run `check` (or at least `typecheck`) after any code change. The app has **no tests** — don't look for or run test commands.

## Import alias

`~/*` maps to `./src/*`. **Not** `@/*`.

## Architecture

- **Single package**, no monorepo setup.
- **Main UI**: `src/app/page.tsx` (~2000 lines, single `'use client'` component).
- **API routes**: `src/app/api/csv/route.ts` (GET reads Excel, POST writes XLSX), `src/app/api/resumo/route.ts` (GET summary stats).
- **Data source**: file `query_devops.xlsx` in project root (not DB). Exports written as `planejamento_exportado_<timestamp>.xlsx`.
- **Drizzle/LibSQL schema** in `src/server/db/` is **unused by the running app** — it's an example scaffold. The real data flow is Excel-only.
- **All UI is client components**. Server layer is a thin proxy for file I/O.
- **Filesystem access required** at runtime for read/write. Not serverless-friendly without changes.

## Config & conventions

- **TypeScript**: strict, `verbatimModuleSyntax` (use `import type`), `noUncheckedIndexedAccess` (defensive array/object access).
- **Tailwind v4**: `@import "tailwindcss"` in CSS, no `tailwind.config.js`. Classes sorted by `prettier-plugin-tailwindcss`.
- **ESLint**: flat config (`eslint.config.js`), extends `next/core-web-vitals` + `typescript-eslint` strict type-checked. Key overrides: `no-unused-vars` is **warn** (not error), `require-await` is **off**, `consistent-type-imports` is **warn**.
- **Filenames**: `kebab-case`, Next.js App Router conventions.
- **Env validation**: `@t3-oss/env-nextjs`. Requires `DATABASE_URL` (e.g. `file:./db.sqlite`). Set `SKIP_ENV_VALIDATION=true` to bypass.
- **UI strings**: hardcoded in Portuguese (PT-BR).
- **No CI/CD, no pre-commit hooks, no Docker.**

## OpenCode plans

`.opencode/plans/` contains implementation plans the agent should consult before making architectural changes.

## Drizzle (if touched)

Tables use `gantt_*` prefix. CLI: `bun run db:generate`, `bun run db:migrate`, `bun run db:push`, `bun run db:studio`.

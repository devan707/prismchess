# Setup

## Prerequisites

- **Bun** ≥ 1.1 (project uses `bun` as the package manager; `npm`/`pnpm`
  will work but `bunfig.toml` is tuned for bun).
- **Node** ≥ 20 (for tools that shell out).
- A **Supabase** project (cloud or self-hosted). For local-only work
  against the existing hosted backend, you only need the URL + publishable
  key (already in `.env`).

## 1. Clone

```bash
git clone <repo-url> prism-chess
cd prism-chess
```

## 2. Install

```bash
bun install
```

## 3. Configure environment

The repo ships with a working `.env` pointing at the hosted Supabase
project. If you're forking, replace these.

### Required (client + server)

| Variable                          | Purpose                                  | Example |
|-----------------------------------|------------------------------------------|---------|
| `VITE_SUPABASE_URL`               | Supabase project URL (browser)           | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY`   | Anon/publishable key (browser)           | `eyJhbGciOi...` |
| `VITE_SUPABASE_PROJECT_ID`        | Project ref (browser)                    | `xxxxx` |
| `SUPABASE_URL`                    | Same URL, server-side                    | `https://xxxxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY`        | Same key, server-side                    | `eyJhbGciOi...` |

### Required (server only)

| Variable                       | Purpose                                          |
|--------------------------------|--------------------------------------------------|
| `SUPABASE_SERVICE_ROLE_KEY`    | Admin/maintenance ops (`supabaseAdmin`). **Never** expose to browser. |
| `SUPABASE_PROJECT_ID`          | Server-side project ref.                         |
| `LOVABLE_API_KEY`              | Lovable AI Gateway key for LLM helpers.          |

### Optional

| Variable              | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `VAPID_PUBLIC_KEY`    | Web push (browser, set as `VITE_VAPID_PUBLIC_KEY`) |
| `VAPID_PRIVATE_KEY`   | Web push signing, server-side                      |
| `SUPABASE_DB_URL`     | Direct Postgres URL (migrations / psql)            |

Server-only variables must **not** be prefixed with `VITE_`; the Vite
bundler will leak them into the browser if you do.

## 4. Run locally

```bash
bun run dev
```

Default URL: http://localhost:8080.

The TanStack Start dev server handles SSR + Vite HMR. File changes under
`src/routes/` regenerate `src/routeTree.gen.ts` automatically — do not
hand-edit that file.

## 5. Tests

There is no test runner wired up yet. The closest things to a test suite:

- `src/game/ai/benchmark.ts` — synthetic AI fixtures.
- `src/game/ai/realGameBenchmark.ts` — regression fixtures from real losses
  (JSON in `src/game/ai/fixtures/`).

Run them as one-off scripts (they expect to be invoked from a Bun/Node
context; some require minor adaptation to print results). A proper
`vitest` wrapper is on the TODO list — see `KNOWN_ISSUES.md`.

## 6. Build

```bash
bun run build         # production build
bun run build:dev     # development-mode build (sourcemaps, no minify)
bun run preview       # serve the production build locally
```

The production build targets Cloudflare Workers (via the TanStack Start
adapter). The output goes in `.output/` (or equivalent depending on
adapter version). Lovable handles deployment; for self-hosting you'd
deploy `.output/` to Cloudflare Workers with `nodejs_compat` enabled.

## 7. Database changes

Add a new file to `supabase/migrations/` named
`YYYYMMDDhhmmss_<uuid>.sql`. Apply via:

```bash
# using Supabase CLI against your project
supabase db push
```

Or via the Lovable migration tool if working inside Lovable. Always
include GRANTs alongside `CREATE TABLE` (see `DATABASE.md`).

## 8. Linting & formatting

```bash
bun run lint
bun run format
```

ESLint config: `eslint.config.js`. Prettier config: `.prettierrc`.

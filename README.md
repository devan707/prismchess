# Prism Chess

A web app for designing and playing custom chess variants — invent pieces, design
boards, play solo against an AI, or challenge friends in real-time multiplayer.

Live: https://prismchess.app

This repository was originally developed inside [Lovable](https://lovable.dev) and
is in the process of being transitioned to a standard GitHub-centric workflow.
It is intended to be editable by Lovable, Codex, Claude Code, Cursor, and
human developers without any one of those being a hard dependency.

---

## Quick links

- [`PROJECT_ARCHITECTURE.md`](./PROJECT_ARCHITECTURE.md) — frontend / backend / data layout
- [`AI_ENGINE_NOTES.md`](./AI_ENGINE_NOTES.md) — search, evaluation, safety gate, playbook
- [`VARIANT_SYSTEM.md`](./VARIANT_SYSTEM.md) — designs, custom pieces, movement, values
- [`DATABASE.md`](./DATABASE.md) — tables, RLS, migrations
- [`SETUP.md`](./SETUP.md) — clone → install → run → build
- [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) — AI weaknesses, tech debt, WIP

---

## Stack at a glance

- **Framework:** TanStack Start v1 (React 19, SSR-capable, file-based routing)
- **Build:** Vite 7, TypeScript (strict)
- **Styling:** Tailwind CSS v4 (CSS-first config in `src/styles.css`) + shadcn/ui
- **Server runtime:** Cloudflare Workers (via TanStack Start adapter) with
  `nodejs_compat`
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime), accessed via
  `createServerFn` server functions and a few `/api/public/*` routes for
  webhooks/cron
- **AI:**
  - In-browser game-playing engine in a Web Worker (`src/game/ai/`)
  - Server-side calls to the Lovable AI Gateway (`@ai-sdk/openai-compatible`)
    for things like piece movement summaries and post-game analysis

The "AI" of Prism Chess is two unrelated systems: the **game-playing engine**
that picks moves (handwritten alpha-beta search, see `AI_ENGINE_NOTES.md`),
and the **LLM gateway** used for natural-language helpers. Don't conflate them.

---

## Repository layout (top level)

```
src/
  routes/                 # TanStack Start file-based routes (UI + server routes)
  components/             # React components (chess board, designer, shell, ui)
  game/                   # Variant engine: rules, pieces, moves, AI
    ai/                   # Game-playing engine (search, eval, safety, playbook)
  lib/                    # createServerFn modules (*.functions.ts) + helpers
  integrations/supabase/  # Generated Supabase clients & auth middleware
  hooks/                  # React hooks (useGame, useMultiplayerGame, ...)
  styles.css              # Tailwind v4 entry + theme tokens
supabase/
  migrations/             # SQL migrations (36+ files, timestamped)
  config.toml             # Project ref only — do not hand-edit other settings
public/                   # Static assets, PWA manifest, service worker
```

See `PROJECT_ARCHITECTURE.md` for deeper context.

---

## Working with this repo from multiple editors

- **Lovable:** continues to work as-is. Lovable owns
  `src/integrations/supabase/{client,client.server,types,auth-*}.ts`,
  `.env`, and `supabase/config.toml` — do not hand-edit those from other
  editors or Lovable will fight you on the next sync.
- **Codex / Claude Code / Cursor / local dev:** clone, set env vars (see
  `SETUP.md`), `bun install`, `bun run dev`. Schema changes should still go in
  as new files in `supabase/migrations/` so Lovable's migration tracker stays
  consistent.
- **CI / tests:** there is no test runner wired up yet (see
  `KNOWN_ISSUES.md`); the AI engine has internal benchmark fixtures under
  `src/game/ai/fixtures/` that can be run as ad-hoc Node scripts.

---

## Contributing

Ideas, bug reports and pull requests are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## License

MIT. See [`LICENSE`](./LICENSE).

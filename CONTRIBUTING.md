# Contributing to Prism Chess

Thanks for wanting to help. Prism Chess is a one-person project, so small, focused pull requests are easiest to review.

## Good places to start

- Issues labeled `good first issue` or `help wanted`.
- The AI engine items in [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md). Each one says what's wrong and what a fix might look like.
- New piece or variant ideas: open an issue with how the piece moves and why it's fun.

## Getting set up

Follow [`SETUP.md`](./SETUP.md): clone, set env vars, `bun install`, `bun run dev`.

Read [`PROJECT_ARCHITECTURE.md`](./PROJECT_ARCHITECTURE.md) first. For engine work, read [`AI_ENGINE_NOTES.md`](./AI_ENGINE_NOTES.md).

## A few rules

- Don't hand-edit the Lovable-owned files listed in the README. They get overwritten.
- Schema changes go in as new files in `supabase/migrations/`.
- "AI" means two different things here: the in-browser game engine and the LLM helpers. Say which one your PR touches.
- For engine changes, include before and after results from the benchmark fixtures in `src/game/ai/fixtures/`.

## Pull requests

1. Open an issue first for anything bigger than a small fix.
2. Keep each PR to one change.
3. Describe what you changed and how you tested it.

By contributing, you agree your work is licensed under the MIT License in [`LICENSE`](./LICENSE).

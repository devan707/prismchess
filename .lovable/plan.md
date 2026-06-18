## Add Blitz (2 min) and Custom timer to PvP

### Changes

**1. `src/lib/multiplayer.functions.ts`** — accept any per-side minute total in addition to the existing presets.
- Replace the `TimeControl` enum with a regex schema: `z.string().regex(/^(\d+min|3day)$/)` allowing `1min`–`180min` (validate range 1–180) plus the existing `3day`.
- Replace `TC_BUDGET_MS` / `TC_PER_MOVE` lookups with helpers:
  - `budgetMsFor(tc)` → `3day` → 3 days, else `parseInt(tc) * 60_000`.
  - `isPerMove(tc)` → `tc === "3day"`.
- Update both call sites (createChallenge, claimTimeout / clock tick logic) to use the helpers.

**2. `src/routes/_authenticated/multiplayer.index.tsx`** — UI in the New Challenge dialog.
- Add `"2min"` (Blitz) to the Time control Select, alongside 10 min / 30 min / 3 days.
- Add a `"custom"` option. When selected, reveal a small number input ("Minutes per player", 1–180, default 5). On submit, send `timeControl: \`${minutes}min\``.
- Update `TimeControlLabel` to render any `Nmin` string as `N min` (with a Zap icon for ≤3 min "Blitz"), keeping the special `3day` label.

**3. `src/routes/_authenticated/multiplayer.join.$token.tsx`** — update the join screen label to format `Nmin` generically (e.g. "5 minutes") instead of the hardcoded ladder.

### Out of scope
- No DB migration: `time_control` is already a free-form text column.
- No changes to AI / single-player or to the clock tick logic itself — only the budget lookup.
- No increment/delay (Fischer) — just simple sudden-death minutes per side.
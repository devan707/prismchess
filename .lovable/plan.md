## Homepage redesign

Rework `src/routes/index.tsx` plus theme tokens in `src/styles.css` to deliver the "elegant grandmaster" layout reskinned with the user's mood: enlarged Prism Chess crest (which already contains the wordmark), dark misty rainbow backdrop, opaque flat panels with sharp corners.

### Visual direction

- **Background**: dark base (near-black slate) with a soft, blurred multi-hue aurora — emerald → teal → indigo → magenta → amber — at low opacity, layered with a faint noise/mist. Fixed, full-viewport, sits behind everything.
- **Surfaces**: opaque dark panels (`bg-card` tuned darker, ~92% opacity over the aurora), **no rounded corners** anywhere on layout chrome (`rounded-none`). Borders are 1px hairlines in a muted gold/parchment tone.
- **Typography**: keep existing Fraunces display / Inter body. Section headers get a 4px solid accent bar on the left (gold accent in dark mode).
- **Color tokens**: introduce a darker default theme for the home/marketing surface — we'll keep the existing light theme intact but force the home route to render against the dark misty backdrop via a wrapper class. No global theme flip.

### Layout (mobile-first, scales up)

1. **Header**
   - Remove the "Prism Chess" `<h1>` text and the tagline duplicate.
   - Enlarge `logoUrl` to ~180px (responsive: `h-40 w-40 sm:h-48 sm:w-48`). Logo is the H1 — wrap in `<h1 class="sr-only">Prism Chess</h1>` for SEO + an `alt="Prism Chess"`.
   - Single short tagline beneath in uppercase tracked caps: "The Ultimate Variant Sandbox".
   - User menu stays pinned top-right.

2. **Primary action grid** (sharp panels, no radius)
   - Full-width **Play Multiplayer** (accent gold-on-dark, prominent).
   - 2-column row: **Sandbox** and **Community** as tall icon+label tiles.

3. **Secondary utility row** — compact 4-icon strip for Friends / Messages / History / Help (smaller, muted). Keeps current routes accessible without the 7-button wall.

4. **Built-in games** — section heading with left accent bar + "N variants" counter on right. Cards become sharp-edged dark panels; play-count chip preserved.

5. **Your saved games** — same panel style. Empty state is a dashed sharp-edged panel.

6. **New from the community / Popular / Archive** — unchanged data flow (`listDiscoveryGames`), restyled to match. Archive collapse toggle preserved.

### Technical notes

- All changes confined to `src/routes/index.tsx` and `src/styles.css`. No data, route, or business-logic edits.
- Add CSS tokens in `src/styles.css`:
  - `--home-bg-base`, `--home-aurora-1..4`, `--home-panel`, `--home-panel-border`, `--home-accent` (warm gold).
  - A `.home-aurora` utility class via `@utility home-aurora { ... }` that paints the layered radial gradients + subtle noise (`background-image`s, `filter: blur(...)`, fixed positioning).
- Wrap the page in a `<div class="relative min-h-screen text-foreground">` with `<div class="home-aurora fixed inset-0 -z-10" aria-hidden />` behind content.
- Replace every `rounded-*` on layout panels/buttons with `rounded-none`. Keep shadcn `Button` but pass `className="rounded-none"`.
- Keep all existing links/handlers (`playBuiltin`, `playSaved`, `playPublished`, `removeSaved`, discovery archive toggle) intact — purely a presentation reshuffle.
- Preserve existing head meta (title, description, OG, canonical).

### Out of scope

- No new routes, no bottom tab nav (the prototype's bottom nav is dropped — desktop users would find it odd and it duplicates the top menu).
- Other pages (sandbox, play, forum, etc.) unchanged.


# Engine Strategy: Fairy-Stockfish vs. Native Prism Engine

This is a technical investigation only. No code changes proposed.

## 1. Background

Fairy-Stockfish (FSF) is a Stockfish fork that adds support for ~70 built-in variants and **user-defined variants via an INI file** (`variants.ini`). Pieces are described in **Extended Betza Notation** (leapers, riders, hoppers, lions, locust capture, side-effects, gating). Rules are described via a fixed catalog of flags (drops, promotion zones, royal pieces, n-check, extinction, immobilization, custom castling, etc.).

A WebAssembly build is published as **`ffish-es6`** on npm (~1.1 MB, GPL-3.0, NNUE-capable). It accepts variants.ini at runtime and exposes a JS API plus UCI.

## 2. Compatibility Matrix

Classification: **F** = fully supported, **P** = partially supported, **A** = could be approximated, **N** = not supported in FSF's model.

| Feature | FSF | Why |
|---|---|---|
| Custom board sizes | **F** | Up to 12×10 in stock builds; larger needs a custom compile. Prism stays within this. |
| Custom starting positions | **F** | Native FEN/SFEN per variant. |
| Dragon | **F** | Sliding+leaping pattern expressible in Betza (e.g. `QN` or similar). |
| Wizard | **F** | Standard leaper/slider hybrid — exact Betza string trivial to author. |
| Assassin | **P** | If it's a slider/leaper with normal capture, F. If it captures without revealing intent (fog/hidden), N. Assumed standard moveset → P pending definition lock-down. |
| Archer (ranged capture without moving) | **N** | Betza has no "capture and stay" primitive. Closest is *locust capture* (you still move), and "iron piece" (immune), neither of which expresses "fire from rest." Would require a C++ patch to FSF. |
| King's Hand | **A** | If it's a royal-adjacency restricted leaper, expressible. If it has "extends the king's check zone" semantics, FSF has no hook — must be approximated by piece-square table or pre-eval. |
| Portal (swap two friendly pieces) | **N** | No swap-of-own-pieces move kind. Drops, gates, and *pass* exist but none move two friendly pieces in one ply. |
| Prism (light/refraction routing) | **N** | No board-state-dependent path bending. Move generation in FSF is piece-local; Prism's effect is global geometry. |
| Necromancer (resurrect from corpses) | **N** | FSF has drops from a *reserve* (crazyhouse), not from per-square corpses with original-owner constraints and `raisedOnce` history. The reserve abstraction loses the spatial pairing. |
| Juggernaut (trample / multi-capture line, juggCharge, juggCastle, juggExit) | **P** | Trample is close to **lion / locust capture** (shogi Chu/Tenjiku lions can capture multiple along a path). `juggCastle` would need a custom castling block (FSF supports several but not arbitrary). `juggCharge`/`juggExit` (state machine entering/leaving a "charged" mode) is not modelable. |
| Shadow Knights (linked pair) | **N** | FSF has no inter-piece relationship state. Each piece's moves are independent of another friendly piece's identity. |
| Twin Towers (linked pair, joint capture/joint-fall) | **N** | Same reason — no link primitive. |

**Score:** 4 fully supported (board, FEN, Dragon, Wizard), 2 partial (Assassin pending, Juggernaut), 1 approximated (King's Hand), **6 not supported** (Archer, Portal, Prism, Necromancer, Shadow Knights, Twin Towers, plus most "future custom mechanics" are likely to land in this category since they're the whole point of Prism Chess).

## 3. Integration Options

### Fairy-Stockfish (native C++)
- **Server-side**: spawn UCI process; talk over stdin/stdout. Fast, but our backend is Cloudflare Workers — **no subprocesses available** (`child_process` is unimplemented in the workerd runtime per our server-runtime knowledge). Would require a separate Node/container host.
- **Browser**: not directly usable — must be WASM.

### `ffish-es6` / `fairy-stockfish.wasm`
- **Browser**: drop-in WASM, runs in a Web Worker. ~1.1 MB gzipped-ish; first-load cost is noticeable on mobile but cacheable. Supports `loadVariantConfig(iniString)` to register a custom variant at runtime — this is the integration seam.
- **API**: synchronous-style JS bindings (`new Board(fen)`, `legalMoves()`, `push(uci)`) plus an embedded UCI engine for search (`bestMove(time)`).
- **Performance**: WASM single-thread on mobile is ~3–8× a hand-written JS negamax at equal evaluation quality; with NNUE it's vastly stronger positionally. Far above our current engine at Hard.
- **No SSR concerns** if loaded client-only.

### Other relevant projects
- **Stockfish.js / stockfish.wasm**: orthodox chess only; irrelevant.
- **lc0 / Maia**: NN-only, needs GPU, useless in-browser.
- **pychess-variants** uses fairy-stockfish.wasm; it's the de-facto reference integration.
- **chess.js / chessops**: rules-only, no search; we'd still write the AI.
- No other actively maintained variant engine comes close to FSF.

### Licensing — **the critical constraint**
- FSF and all WASM ports are **GPL-3.0**. Linking it (even dynamically, even via WASM bundled into your app) makes the **combined work GPL-3.0**. That means Prism Chess's frontend, all custom-piece logic, and any closed pieces of the stack must be released under GPL-3.0 if you ship FSF inside the app.
- A **network-isolated server process** (separate UCI binary, talking over a network boundary) is the only mainstream interpretation that avoids GPL contagion of the client. That re-introduces the Cloudflare Workers problem above.
- If Prism Chess is fine being GPL-3.0 (or already MIT and you don't mind relicensing the bundled distribution), this is moot. **You need to decide this before any integration work.**

## 4. Architecture Options

### A) Continue native engine
- **Pros**: Models every Prism mechanic exactly. Just shipped Zobrist+TT (+1 ply effective). Permissive licensing. Full control. Worker-friendly.
- **Cons**: We'll never match FSF's positional/tactical strength for "normal" variants. Every strength upgrade (null-move, LMR, NNUE, better eval) is months of work that already exists in FSF.
- **Complexity / maintenance**: Medium-ongoing. We own the bug surface for every variant.

### B) Replace with FSF entirely
- **Pros**: World-class strength for compatible variants. Stops engine work.
- **Cons**: **6 of our custom pieces don't fit FSF's model**, including the signature mechanics (Portal, Prism, Necromancer, Shadow Knights, Twin Towers, Archer). Shipping FSF means either dropping those variants from AI play or forking FSF in C++ to add new move kinds — a multi-month systems project with ongoing rebase pain against upstream. Also forces a GPL-3.0 decision on the whole app.
- **Complexity / maintenance**: Very high if forking FSF; medium if accepting capability regression.

### C) Hybrid — FSF for compatible variants, native engine for the rest
- **Pros**: Best AI strength on Classic/Menagerie-with-orthodox-pieces; preserved correctness on Prism/Portal/Necromancer/etc. The engine choice is a per-variant capability check at game start, totally invisible to the UI. Custom mechanics evolve in our own engine without rebasing FSF.
- **Cons**: Two engines to maintain. Behavioral asymmetry (different playstyles per variant). Two debug surfaces. GPL question still applies *if* FSF is bundled client-side; mitigatable by making the FSF path opt-in or server-side.
- **Complexity / maintenance**: Medium upfront (worker wrapper, capability detector, variants.ini emitter for the compatible subset), low ongoing.

## 5. Recommendation

**Option C (Hybrid), with two prerequisites that must be answered first.**

1. **Licensing call**: Confirm whether Prism Chess can ship GPL-3.0 client-side code. If no, FSF must be server-side only, and the hybrid path becomes "FSF on a Node side-service, native engine in the Worker/browser." This changes the architecture but not the recommendation.
2. **Capability map**: Of the current built-in variants, count how many use *only* Fully-supported mechanics. If that's <40% of the variants people actually play, the hybrid's payoff drops and Option A wins by default.

Assuming (1) is acceptable and (2) is healthy: build a thin **`AiEngine` interface** with two implementations (`NativeEngine`, `FsfEngine`), pick per variant, and route the request from the existing worker harness. The recently-shipped Zobrist+TT work in the native engine remains valuable — it's the engine for everything FSF can't represent, which is the more interesting half of Prism Chess.

**If forced to a single answer in one line**: don't replace the engine — Prism Chess's reason to exist is exactly the mechanics FSF cannot model, so the native engine is load-bearing; add FSF as a strength upgrade for the variants where it fits, and only if GPL-3.0 is acceptable.

## 6. Non-Goals / Out of Scope

- No code changes in this turn.
- No commitment to the AiEngine interface shape.
- No decision on NNUE training for native pieces (separate investigation).
- No migration of evaluation tuning data (`Playbook`) — that stays with the native engine regardless.

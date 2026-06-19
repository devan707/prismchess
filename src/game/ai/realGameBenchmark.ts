/**
 * Real-Game Regression Benchmarks.
 *
 * Synthetic benchmark positions are not enough — the engine passes them
 * but still donates pieces in actual games. This module loads the move
 * history of a saved solo game where the AI made specific, well-known
 * tactical mistakes, replays up to the position immediately BEFORE each
 * mistake, asks the engine to choose, and asserts:
 *
 *   1. The engine MUST NOT replay the exact bad move it played before.
 *   2. The engine MUST NOT play any move that violates the high-level
 *      tactical rule the mistake represents (e.g. "no Wizard-for-Pawn").
 *
 * Adding a fixture: pick a move index N from a saved game JSON, mark
 * the move at moves[N] as `knownBadMove`, name the rule, and append.
 * Each fixture is a real position from a real game we lost — never a
 * synthetic puzzle.
 *
 * Game id `3bb066c9-41a5-4049-969c-0fc62c43118a`:
 *   8×8 Custom (Lich variant). Human = White, result = White wins
 *   on move 28 (engine resigned material). The exhibits below are
 *   each AI blunder identified in the post-game review.
 */
import type { Design, GameState, Move } from "../types";
import { initialStateFromDesign, replayMoves } from "../rules";
import { allLegalMoves, applyMoveToState } from "../moves";
import { getPiecePoints } from "../pieceValue";
import { runSearch, paramsFor } from "./search";
import { TT } from "./tt";
import { opponentBestGain } from "./safety";
import gameData from "./fixtures/real-game-3bb066c9.json";

type RuleId =
  | "noWizardForLowValue"
  | "noLichShuffle"
  | "noHangValuableUndefended"
  | "preserveBackRankAroundRoyal";

interface RealGameFixture {
  name: string;
  /** Number of plies to replay from the initial position before the engine moves. */
  replayPlies: number;
  /** Expected color to move after the replay. Validation safety-net. */
  expectedTurn: "w" | "b";
  /** The exact move the AI actually played in this saved game.
   *  The engine MUST choose a different move. */
  knownBadMove: { from: { r: number; c: number }; to: { r: number; c: number } };
  /** Tactical rule the engine's choice must also satisfy. */
  rule: RuleId;
  /** Human-readable summary for the report. */
  note: string;
}

/** Game `3bb066c9-...` (Lich variant, AI=Black). Every fixture is a real
 *  pre-mistake position from this game. Plies are 1-based human-style. */
const REAL_GAME_FIXTURES: RealGameFixture[] = [
  {
    name: "[ply 10] Wizard×Pawn — Wizard captures Shapeshifter defended by Regent",
    replayPlies: 9,
    expectedTurn: "b",
    knownBadMove: { from: { r: 5, c: 5 }, to: { r: 1, c: 5 } },
    rule: "noWizardForLowValue",
    note: "AI played Wf6xf2 losing the Wizard (8pts) for a Pawn (2pts).",
  },
  {
    name: "[ply 13] Wizard×Pawn — second Wizard offered the same way",
    replayPlies: 12,
    expectedTurn: "b",
    knownBadMove: { from: { r: 7, c: 2 }, to: { r: 1, c: 2 } },
    rule: "noWizardForLowValue",
    note: "AI played Wc8xc2 losing the second Wizard (8pts) for a Pawn (2pts).",
  },
  {
    name: "[ply 4] Lich shuffle — Lich e8↔f8 with no threat to address",
    replayPlies: 3,
    expectedTurn: "b",
    knownBadMove: { from: { r: 7, c: 4 }, to: { r: 7, c: 5 } },
    rule: "noLichShuffle",
    note: "First Lich-step of a two-step turn that just shuffled and back.",
  },
  {
    name: "[ply 24] Lich shuffle (mid-game) — engine still wasting tempo",
    replayPlies: 23,
    expectedTurn: "b",
    knownBadMove: { from: { r: 7, c: 6 }, to: { r: 7, c: 5 } },
    rule: "noLichShuffle",
    note: "Lich g8↔f8 shuffle while the kingside was under Archer pressure.",
  },
  {
    name: "[ply 36] Lich shuffle (late-game) — third repeat shuffle pattern",
    replayPlies: 35,
    expectedTurn: "b",
    knownBadMove: { from: { r: 7, c: 6 }, to: { r: 7, c: 7 } },
    rule: "noLichShuffle",
    note: "Lich g8→h8 starting yet another g8↔h8 shuffle while down material.",
  },
  {
    name: "[ply 29] Dragon donated to d4 — captured by Regent next ply",
    replayPlies: 28,
    expectedTurn: "b",
    knownBadMove: { from: { r: 7, c: 1 }, to: { r: 3, c: 3 } },
    rule: "noHangValuableUndefended",
    note: "Dragon (11pts) walked into undefended square attacked by Regent.",
  },
  {
    name: "[ply 51] Assassin donated to e6 — captured by Dragon",
    replayPlies: 50,
    expectedTurn: "b",
    knownBadMove: { from: { r: 7, c: 3 }, to: { r: 5, c: 4 } },
    rule: "noHangValuableUndefended",
    note: "Assassin Z (6pts) walked into Dragon's capture range, no compensation.",
  },
];

// ── Rule predicates ───────────────────────────────────────────────────

interface RuleContext {
  before: GameState;
  move: Move;
}

function isCapturingRoyal(rc: RuleContext): boolean {
  if (!rc.move.captured) return false;
  const def = rc.before.registry[rc.move.captured.id];
  return !!def?.royal;
}

function ruleNoWizardForLowValue({ before, move }: RuleContext): string | null {
  if (move.piece.id !== "W") return null;
  if (!move.captured) return null;
  const victimPts = getPiecePoints(move.captured.id, before.registry[move.captured.id]);
  if (victimPts <= 2) return `Wizard captured ${move.captured.id} worth ${victimPts}pts`;
  return null;
}

function ruleNoLichShuffle(rc: RuleContext): string | null {
  const { before, move } = rc;
  if (move.piece.id !== "L") return null;
  if (isCapturingRoyal(rc)) return null;
  if (move.captured) return null;
  // If pendingHand is set, the engine is *forced* to make the 2nd Lich step.
  if (before.pendingHand) return null;
  // Only a violation if non-Lich alternatives exist (otherwise Lich-step is
  // the only legal move).
  const legal = allLegalMoves(before);
  const hasAlt = legal.some((m) => m.piece.id !== "L");
  if (!hasAlt) return null;
  return `Lich step ${fmtSq(move.from!)}→${fmtSq(move.to)} with non-Lich alternatives available`;
}

function ruleNoHangValuableUndefended(rc: RuleContext): string | null {
  const { before, move } = rc;
  const moverPts = getPiecePoints(move.piece.id, before.registry[move.piece.id]);
  if (moverPts < 5) return null;
  // What can opponent immediately do after our move?
  // Reuse opponentBestGain on the resulting state.
  const after = applyMoveToState(before, move);
  const opp = opponentBestGain(after);
  if (opp.royalCapture) return `move allows opponent to capture our royal`;
  // If opponent can grab material worth at least the mover's value minus a
  // small tolerance, this is a "donate the piece" mistake.
  if (opp.gain >= moverPts * 100 - 150) {
    return `move hangs ${move.piece.id} (${moverPts}pts) — opp wins ${opp.gain}cp`;
  }
  return null;
}

const RULES: Record<RuleId, (rc: RuleContext) => string | null> = {
  noWizardForLowValue: ruleNoWizardForLowValue,
  noLichShuffle: ruleNoLichShuffle,
  noHangValuableUndefended: ruleNoHangValuableUndefended,
  // Encoded indirectly via noHangValuableUndefended on royal-area pieces;
  // kept as an alias so future fixtures can reference it explicitly.
  preserveBackRankAroundRoyal: ruleNoHangValuableUndefended,
};

function fmtSq(s: { r: number; c: number }): string {
  return `${String.fromCharCode(97 + s.c)}${s.r + 1}`;
}
function fmtMove(m: Move): string {
  return `${m.from ? fmtSq(m.from) : "*"}->${fmtSq(m.to)} (${m.piece.id})`;
}

function sameSquare(a: { r: number; c: number }, b: { r: number; c: number }): boolean {
  return a.r === b.r && a.c === b.c;
}

interface RealCaseResult {
  name: string;
  pass: boolean;
  chose: string;
  reasons: string[];
}

export async function runRealGameBenchmark(timeMs = 4000): Promise<{
  results: RealCaseResult[];
  passed: number;
  failed: number;
  total: number;
}> {
  const { design, moves } = gameData as unknown as { design: Design; moves: Move[] };
  const start = initialStateFromDesign(design);
  const results: RealCaseResult[] = [];

  for (const fx of REAL_GAME_FIXTURES) {
    const reasons: string[] = [];
    let pass = false;
    let chose = "—";
    try {
      const before = replayMoves(moves.slice(0, fx.replayPlies), start);
      if (before.turn !== fx.expectedTurn) {
        reasons.push(`turn mismatch after replay: got ${before.turn} expected ${fx.expectedTurn}`);
      }
      const tt = new TT(1 << 14);
      // Mirror production "hard" settings so the benchmark matches the
      // budget the AI actually had in the real game. `timeMs` floors the
      // budget so a benchmark run isn't slower than what the engine got
      // live — but never below paramsFor(hard).
      const prod = paramsFor(before, "hard");
      const budgetMs = Math.max(timeMs, prod.budgetMs);
      const res = runSearch(before, { difficulty: "hard", budgetMs, maxDepth: prod.maxDepth, tt });
      const move = res.move;
      if (!move) {
        reasons.push("engine returned no move");
      } else {
        chose = fmtMove(move);
        // (1) exact-replay regression
        if (move.from && sameSquare(move.from, fx.knownBadMove.from) && sameSquare(move.to, fx.knownBadMove.to)) {
          reasons.push(`replayed known-bad move ${fmtSq(fx.knownBadMove.from)}→${fmtSq(fx.knownBadMove.to)}`);
        }
        // (2) rule check
        const ruleFn = RULES[fx.rule];
        const violation = ruleFn({ before, move });
        if (violation) reasons.push(`rule[${fx.rule}]: ${violation}`);
      }
      pass = reasons.length === 0;
    } catch (e) {
      reasons.push(`threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    results.push({ name: fx.name, pass, chose, reasons });
  }

  const passed = results.filter((r) => r.pass).length;
  return { results, passed, failed: results.length - passed, total: results.length };
}

// ── CLI entry (invoked by benchmark.ts when run as script) ────────────
declare const Bun: { argv: string[] } | undefined;
if (typeof Bun !== "undefined" && Bun.argv[1]?.endsWith("realGameBenchmark.ts")) {
  runRealGameBenchmark().then((res) => {
    console.log("\nReal-Game Regression Benchmark");
    console.log("─".repeat(72));
    for (const r of res.results) {
      console.log(`${r.pass ? "✓" : "✗"} ${r.name}`);
      console.log(`   chose: ${r.chose}`);
      for (const reason of r.reasons) console.log(`   ↳ ${reason}`);
    }
    console.log("─".repeat(72));
    console.log(`${res.passed}/${res.total} passed`);
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

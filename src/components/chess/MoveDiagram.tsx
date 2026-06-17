import { PIECE_LIBRARY } from "@/game/pieces";
import { PieceById } from "./PieceGlyph";
import { JuggernautGlyph } from "./JuggernautGlyph";
import type { PieceId } from "@/game/types";

// Fixed marker colors (oklch so they render correctly regardless of theme tokens).
const MOVE_FILL = "oklch(0.72 0.17 150 / 0.7)";
const MOVE_GLOW = "oklch(0.72 0.17 150 / 0.5)";
const CAPTURE_BORDER = "oklch(0.65 0.22 25 / 0.9)";
const CAPTURE_FILL = "oklch(0.65 0.22 25 / 0.22)";
const BOTH_BORDER = "oklch(0.78 0.17 75 / 0.9)";
const BOTH_FILL = "oklch(0.78 0.17 75 / 0.2)";
const BOTH_DOT = "oklch(0.78 0.17 75 / 0.95)";

type Marker = "m" | "a" | "b";

/** A worked example: friendly blocker(s), an enemy target, and the numbered path. */
interface Scenario {
  rows: number;
  cols: number;
  /** The piece's own square in the scenario. */
  self: { r: number; c: number };
  /** Friendly blockers (rendered as same-color piece glyphs, no markers). */
  friends: Array<{ r: number; c: number; id: PieceId }>;
  /** Enemy targets (rendered as opposite-color glyphs with a capture ring). */
  enemies: Array<{ r: number; c: number; id: PieceId }>;
  /** Ordered path squares 1..N — each is rendered with its step number. */
  path: Array<{ r: number; c: number }>;
  /** One-line caption shown under the scenario. */
  caption: string;
}

interface Diagram {
  rows: number;
  cols: number;
  /** Center squares occupied by the piece itself (usually 1). */
  center: Array<{ r: number; c: number }>;
  markers: Array<{ r: number; c: number; type: Marker }>;
  /** Optional one-line note (used for pieces that can't be drawn — Portal, Dragon, Barricade). */
  note?: string;
  /** Optional worked example with friendlies/enemies, for path-dependent pieces. */
  scenario?: Scenario;
}


function ray(
  out: Array<{ r: number; c: number; type: Marker }>,
  cr: number,
  cc: number,
  dr: number,
  dc: number,
  len: number,
  type: Marker,
) {
  for (let k = 1; k <= len; k++) {
    out.push({ r: cr + dr * k, c: cc + dc * k, type });
  }
}

const ORTHO: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8: Array<[number, number]> = [...ORTHO, ...DIAG];

/** Build a movement diagram for a known piece. Returns null if unsupported. */
function buildDiagram(id: PieceId): Diagram | null {
  // Default grid: 7x7 with the piece in the center.
  const rows = 7;
  const cols = 7;
  const cr = 3;
  const cc = 3;
  const center = [{ r: cr, c: cc }];
  const markers: Array<{ r: number; c: number; type: Marker }> = [];

  switch (id) {
    case "K":
    case "H":
      for (const [dr, dc] of ALL8) markers.push({ r: cr + dr, c: cc + dc, type: "b" });
      return { rows, cols, center, markers };
    case "Q":
      for (const [dr, dc] of ALL8) ray(markers, cr, cc, dr, dc, 3, "b");
      return { rows, cols, center, markers };
    case "R":
      for (const [dr, dc] of ORTHO) ray(markers, cr, cc, dr, dc, 3, "b");
      return { rows, cols, center, markers };
    case "B":
      for (const [dr, dc] of DIAG) ray(markers, cr, cc, dr, dc, 3, "b");
      return { rows, cols, center, markers };
    case "N":
      for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]] as Array<[number, number]>)
        markers.push({ r: cr + dr, c: cc + dc, type: "b" });
      return { rows, cols, center, markers };
    case "P":
    case "S":
      // Pawn shown moving "up" (decreasing r). Forward 1 = move, forward 2 = move,
      // forward-diagonals = attack only.
      markers.push({ r: cr - 1, c: cc, type: "m" });
      markers.push({ r: cr - 2, c: cc, type: "m" });
      markers.push({ r: cr - 1, c: cc - 1, type: "a" });
      markers.push({ r: cr - 1, c: cc + 1, type: "a" });
      return { rows, cols, center, markers };
    case "A":
      // Archer: move 1 orthogonal (no capture); diagonal range 1 = move-only
      // jump; diagonal range 2 & 3 = either move OR attack.
      for (const [dr, dc] of ORTHO) markers.push({ r: cr + dr, c: cc + dc, type: "m" });
      for (const [dr, dc] of DIAG) {
        markers.push({ r: cr + dr, c: cc + dc, type: "m" });
        markers.push({ r: cr + dr * 2, c: cc + dc * 2, type: "b" });
        markers.push({ r: cr + dr * 3, c: cc + dc * 3, type: "b" });
      }
      return { rows, cols, center, markers };

    case "M":
      // Necromancer: 1 diagonal, move only.
      for (const [dr, dc] of DIAG) markers.push({ r: cr + dr, c: cc + dc, type: "m" });
      return { rows, cols, center, markers };
    case "Z": {
      // Assassin: each turn picks ONE of two move modes:
      //   (a) Single king-step (1 square, any direction) — may capture.
      //   (b) Exactly 3 king-steps with constraints:
      //         • first 2 landings must be empty (no jumping)
      //         • no revisits
      //         • 3 steps cannot all share the same direction
      //         • each consecutive turn ≤ 45°
      //         • capture only on step 3
      const DIRS_8: Array<[number, number]> = [
        [-1, 0], [-1, 1], [0, 1], [1, 1],
        [1, 0], [1, -1], [0, -1], [-1, -1],
      ];
      const turnOK = (a: number, b: number) => {
        const d = Math.abs(a - b);
        return d <= 1 || d === 7;
      };
      const reachable = new Set<string>();
      // (a) Single king-step destinations.
      for (const [dr, dc] of DIRS_8) reachable.add(`${dr},${dc}`);
      // (b) 3-step infiltration destinations.
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          if (!turnOK(i, j)) continue;
          for (let k = 0; k < 8; k++) {
            if (!turnOK(j, k)) continue;
            if (i === j && j === k) continue; // 3 identical = forbidden
            const [dr1, dc1] = DIRS_8[i];
            const [dr2, dc2] = DIRS_8[j];
            const [dr3, dc3] = DIRS_8[k];
            const p1 = `${dr1},${dc1}`;
            const p2 = `${dr1 + dr2},${dc1 + dc2}`;
            const p3 = `${dr1 + dr2 + dr3},${dc1 + dc2 + dc3}`;
            // No revisits (start = "0,0" implicit).
            const path = new Set(["0,0", p1, p2, p3]);
            if (path.size !== 4) continue;
            reachable.add(p3);
          }
        }
      }
      for (const k of reachable) {
        const [dr, dc] = k.split(",").map(Number);
        markers.push({ r: cr + dr, c: cc + dc, type: "b" });
      }
      // Worked example: friendly Pawn directly N blocks the natural N-N-?
      // routes. Assassin steps NW → N → N (idx 7,0,0 — turns 45°, 0°) to
      // slip around the Pawn and capture the Rook on the third step.
      const scenario: Scenario = {
        rows: 5,
        cols: 5,
        self: { r: 3, c: 2 },
        friends: [{ r: 2, c: 2, id: "P" }],
        enemies: [{ r: 0, c: 1, id: "R" }],
        path: [
          { r: 2, c: 1 }, // step 1: NW
          { r: 1, c: 1 }, // step 2: N
          { r: 0, c: 1 }, // step 3: N — captures the Rook
        ],
        caption:
          "Two move modes per turn. Mode 1: a plain king-step to any of the 8 adjacent squares (may capture). Mode 2 (shown): a 3-step infiltration — Assassin curves NW → N → N around the friendly Pawn; every consecutive turn stays within 45°, and the capture lands on step 3.",
      };
      return { rows, cols, center, markers, scenario };
    }




    case "W":
      // Wizard: diagonals like a bishop + orthogonal same-color squares (every other step).
      for (const [dr, dc] of DIAG) ray(markers, cr, cc, dr, dc, 3, "b");
      for (const [dr, dc] of ORTHO) {
        // same-colour squares = even step counts: 2.
        markers.push({ r: cr + dr * 2, c: cc + dc * 2, type: "b" });
      }
      return { rows, cols, center, markers };
    case "J": {
      // Juggernaut: 2-square titan. The pair sits SIDE-BY-SIDE (perpendicular
      // to its charge axis) and rolls forward, clearing BOTH columns in front
      // of it. Shift = slide the whole pair one square left/right (captures
      // any enemy on the destination cell). Charge = roll 1-5 forward,
      // trampling every enemy in either lane, stopping before friendlies.
      const rowsJ = 8;
      const colsJ = 5;
      const crJ = 6;          // back rank of the pair
      const ccLeft = 1;       // left half (anchor for the horizontal glyph)
      const ccRight = 2;      // right half
      const centerJ = [
        { r: crJ, c: ccLeft },  // [0] = anchor for the horizontal glyph
        { r: crJ, c: ccRight }, // [1] = paired half
      ];
      const m: Array<{ r: number; c: number; type: Marker }> = [];
      // Forward charge — both columns cleared each step, up to 5 squares.
      for (let k = 1; k <= 5; k++) {
        m.push({ r: crJ - k, c: ccLeft, type: "b" });
        m.push({ r: crJ - k, c: ccRight, type: "b" });
      }
      // Sideways slide — whole pair shifts one column. Destination cell can
      // be empty (shift) or hold an enemy (lateral capture) → "both".
      m.push({ r: crJ, c: ccLeft - 1, type: "b" });
      m.push({ r: crJ, c: ccRight + 1, type: "b" });
      return { rows: rowsJ, cols: colsJ, center: centerJ, markers: m };
    }

    case "D":
      return {
        rows,
        cols,
        center,
        markers: [
          // Strike pattern: 1–2 in all 8 dirs (range-2 blockable, but show all).
          ...ALL8.flatMap(([dr, dc]) => [
            { r: cr + dr, c: cc + dc, type: "a" as Marker },
            { r: cr + dr * 2, c: cc + dc * 2, type: "a" as Marker },
          ]),
        ],
        note: "Flight: also move to ANY empty square on the board (non-capturing).",
      };
    case "X":
      return {
        rows: 3,
        cols: 3,
        center: [{ r: 1, c: 1 }],
        markers: [],
        note: "Immobile barricade. Drop from reserve onto any empty square; never moves.",
      };
    case "T":
      return {
        rows: 3,
        cols: 3,
        center: [{ r: 1, c: 1 }],
        markers: [],
        note: "Cannot move or capture. Swap places with any one friendly piece anywhere on the board.",
      };
    case "Y": {
      // 3x3 with the Prism in the center; all 8 neighbors are the rainbow aura.
      const cr2 = 1, cc2 = 1;
      const m: Array<{ r: number; c: number; type: Marker }> = [];
      for (const [dr, dc] of ALL8) m.push({ r: cr2 + dr, c: cc2 + dc, type: "m" });
      return {
        rows: 3,
        cols: 3,
        center: [{ r: cr2, c: cc2 }],
        markers: m,
        note: "Indestructible fixture. Any non-royal piece that ENTERS or PASSES through one of the 8 highlighted aura squares flips color. At end of every turn, non-royal pieces still in the aura flip again — walk converted pieces out next turn to keep them. Kings are immune.",
      };
    }
    default:
      return null;
  }
}

interface Props {
  id: PieceId;
  color?: "w" | "b";
  /** Pixel size cap for the grid — diagram scales to fit. */
  maxSize?: number;
}

export function MoveDiagram({ id, color = "w", maxSize = 180 }: Props) {
  const diag = buildDiagram(id);
  const def = PIECE_LIBRARY[id];
  if (!diag || !def) return null;

  // Crop the grid to actually-used cells (in case markers fall off the edge).
  const cells: Array<{ r: number; c: number; kind: "center" | Marker | "empty" }> = [];
  for (let r = 0; r < diag.rows; r++) {
    for (let c = 0; c < diag.cols; c++) {
      const isCenter = diag.center.some((cc) => cc.r === r && cc.c === c);
      if (isCenter) {
        cells.push({ r, c, kind: "center" });
        continue;
      }
      const hit = diag.markers.find((m) => m.r === r && m.c === c);
      cells.push({ r, c, kind: hit ? hit.type : "empty" });
    }
  }

  const cellSize = Math.floor(Math.min(maxSize / diag.cols, maxSize / diag.rows));

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="rounded-md border bg-muted/40 p-1"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${diag.cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${diag.rows}, ${cellSize}px)`,
          gap: 1,
        }}
        aria-hidden
      >
        {cells.map(({ r, c, kind }) => {
          const checker = (r + c) % 2 === 0 ? "bg-background/60" : "bg-muted/60";
          let overlay: React.ReactNode = null;
          if (kind === "m") {
            overlay = (
              <span
                className="absolute inset-0 m-auto rounded-full animate-pulse"
                style={{
                  width: "45%",
                  height: "45%",
                  background: MOVE_FILL,
                  boxShadow: `0 0 6px ${MOVE_GLOW}`,
                }}
              />
            );
          } else if (kind === "a") {
            overlay = (
              <span
                className="absolute inset-1 rounded-sm animate-pulse"
                style={{
                  border: `2px solid ${CAPTURE_BORDER}`,
                  background: CAPTURE_FILL,
                }}
              />
            );
          } else if (kind === "b") {
            overlay = (
              <>
                <span
                  className="absolute inset-1 rounded-sm"
                  style={{
                    border: `2px solid ${BOTH_BORDER}`,
                    background: BOTH_FILL,
                  }}
                />
                <span
                  className="absolute inset-0 m-auto rounded-full animate-pulse"
                  style={{
                    width: "30%",
                    height: "30%",
                    background: BOTH_DOT,
                  }}
                />
              </>
            );
          }

          // Juggernaut special: render the proper top-down titan glyph spanning
          // both occupied cells (anchored on the FRONT cell, extending downward).
          let centerNode: React.ReactNode = null;
          if (kind === "center") {
            if (id === "J") {
              // Horizontal pair — render the 2-wide glyph anchored on the LEFT half (center[0]).
              const isAnchor = diag.center[0] && r === diag.center[0].r && c === diag.center[0].c;
              centerNode = isAnchor ? (
                <JuggernautGlyph color={color} orientation="horizontal" facing="up" />
              ) : null;
            } else {
              centerNode = (
                <PieceById id={id} color={color} def={def} className="h-[80%] w-[80%]" />
              );
            }
          }


          return (
            <div
              key={`${r}-${c}`}
              className={`relative ${checker} rounded-[2px] flex items-center justify-center`}
              style={{ overflow: "visible" }}
            >
              {centerNode}
              {overlay}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: MOVE_FILL }}
          />
          Move
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-sm"
            style={{
              width: 9,
              height: 9,
              border: `2px solid ${CAPTURE_BORDER}`,
              background: CAPTURE_FILL,
            }}
          />
          Capture
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-sm"
            style={{
              width: 9,
              height: 9,
              border: `2px solid ${BOTH_BORDER}`,
              background: BOTH_FILL,
            }}
          />
          Either
        </span>
      </div>

      {diag.note && (
        <p className="text-[10px] text-muted-foreground italic text-center max-w-[220px] leading-snug">
          {diag.note}
        </p>
      )}

      {diag.scenario && (
        <ScenarioGrid
          scenario={diag.scenario}
          color={color}
          cellSize={cellSize}
        />
      )}


      {/* Necromancer-only: miniature ghost + undead preview */}
      {id === "M" && (
        <div className="flex items-center justify-center gap-4 mt-1">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Ghost</span>
            <div
              className="relative flex items-center justify-center rounded-md"
              style={{ width: cellSize * 1.2, height: cellSize * 1.2 }}
            >
              {/* Spirit-glow background matching Board.tsx Spirit View */}
              <div
                className="absolute inset-0 rounded-md pointer-events-none"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0.18) 55%, transparent 75%)",
                }}
              />
              <span className="opacity-50 text-[1.1rem]" aria-hidden>
                <PieceById id="P" color={color} def={PIECE_LIBRARY["P"]} className="h-[70%] w-[70%]" />
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Undead</span>
            <div
              className="relative flex items-center justify-center rounded-md"
              style={{ width: cellSize * 1.2, height: cellSize * 1.2 }}
            >
              {/* Green glow matching PieceGlyph undead filter */}
              <div
                className="absolute inset-0 pointer-events-none rounded-full"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(circle, rgba(74,222,128,0.55) 0%, rgba(74,222,128,0.18) 45%, transparent 70%)",
                  filter: "blur(2px)",
                }}
              />
              <span
                className="text-[1.1rem]"
                aria-hidden
                style={{
                  filter: color === "w"
                    ? "brightness(0) saturate(100%) invert(1) drop-shadow(0 0 1.5px rgba(0,0,0,0.9)) drop-shadow(0 0 4px rgba(74,222,128,0.95)) drop-shadow(0 0 8px rgba(34,197,94,0.7))"
                    : "brightness(0) drop-shadow(0 0 1.5px rgba(255,255,255,0.95)) drop-shadow(0 0 4px rgba(74,222,128,0.95)) drop-shadow(0 0 8px rgba(34,197,94,0.7))",
                }}
              >
                {PIECE_LIBRARY["N"].glyph}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact worked-example grid: friendlies, enemies, and a numbered path. */
function ScenarioGrid({
  scenario,
  color,
  cellSize,
}: {
  scenario: Scenario;
  color: "w" | "b";
  cellSize: number;
}) {
  const enemyColor: "w" | "b" = color === "w" ? "b" : "w";
  const size = Math.max(20, Math.floor(cellSize * 0.85));
  const stepIndex = new Map<string, number>();
  scenario.path.forEach((p, i) => stepIndex.set(`${p.r},${p.c}`, i + 1));
  const finalKey = scenario.path.length
    ? `${scenario.path[scenario.path.length - 1].r},${scenario.path[scenario.path.length - 1].c}`
    : "";
  const friendAt = (r: number, c: number) =>
    scenario.friends.find((f) => f.r === r && f.c === c);
  const enemyAt = (r: number, c: number) =>
    scenario.enemies.find((e) => e.r === r && e.c === c);

  return (
    <div className="flex flex-col items-center gap-1 mt-2 border-t border-border/40 pt-2 w-full">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
        Example
      </span>
      <div
        className="rounded-md border bg-muted/30 p-1"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${scenario.cols}, ${size}px)`,
          gridTemplateRows: `repeat(${scenario.rows}, ${size}px)`,
          gap: 1,
        }}
        aria-hidden
      >
        {Array.from({ length: scenario.rows * scenario.cols }, (_, idx) => {
          const r = Math.floor(idx / scenario.cols);
          const c = idx % scenario.cols;
          const checker = (r + c) % 2 === 0 ? "bg-background/60" : "bg-muted/60";
          const isSelf = scenario.self.r === r && scenario.self.c === c;
          const friend = friendAt(r, c);
          const enemy = enemyAt(r, c);
          const step = stepIndex.get(`${r},${c}`);
          const isFinal = `${r},${c}` === finalKey;

          return (
            <div
              key={`s-${r}-${c}`}
              className={`relative ${checker} rounded-[2px] flex items-center justify-center`}
              style={{ overflow: "visible" }}
            >
              {step !== undefined && !isFinal && (
                <span
                  className="absolute inset-1 rounded-full"
                  style={{
                    border: `1.5px dashed ${MOVE_FILL}`,
                    background: "transparent",
                  }}
                />
              )}
              {step !== undefined && isFinal && (
                <span
                  className="absolute inset-1 rounded-sm animate-pulse"
                  style={{
                    border: `2px solid ${CAPTURE_BORDER}`,
                    background: CAPTURE_FILL,
                  }}
                />
              )}

              {isSelf && (
                <PieceById
                  id="Z"
                  color={color}
                  def={PIECE_LIBRARY["Z"]}
                  className="h-[78%] w-[78%]"
                />
              )}
              {friend && (
                <PieceById
                  id={friend.id}
                  color={color}
                  def={PIECE_LIBRARY[friend.id]}
                  className="h-[78%] w-[78%]"
                />
              )}
              {enemy && (
                <PieceById
                  id={enemy.id}
                  color={enemyColor}
                  def={PIECE_LIBRARY[enemy.id]}
                  className="h-[78%] w-[78%]"
                />
              )}

              {step !== undefined && (
                <span
                  className="absolute -top-1 -left-1 rounded-full text-[8px] font-bold flex items-center justify-center"
                  style={{
                    width: 12,
                    height: 12,
                    background: isFinal ? CAPTURE_BORDER : MOVE_FILL,
                    color: "white",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                  }}
                >
                  {step}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, border: `1.5px dashed ${MOVE_FILL}` }}
          />
          Path step
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-sm"
            style={{
              width: 9,
              height: 9,
              border: `2px solid ${CAPTURE_BORDER}`,
              background: CAPTURE_FILL,
            }}
          />
          Capture
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground italic text-center max-w-[240px] leading-snug">
        {scenario.caption}
      </p>
    </div>
  );
}


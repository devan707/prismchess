import { PIECE_LIBRARY } from "@/game/pieces";
import { PieceById } from "./PieceGlyph";
import type { PieceId } from "@/game/types";

type Marker = "m" | "a" | "b";

interface Diagram {
  rows: number;
  cols: number;
  /** Center squares occupied by the piece itself (usually 1). */
  center: Array<{ r: number; c: number }>;
  markers: Array<{ r: number; c: number; type: Marker }>;
  /** Optional one-line note (used for pieces that can't be drawn — Portal, Dragon, Barricade). */
  note?: string;
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
      // Move 1 orthogonal; jump 1/2/3 diagonal (non-capturing).
      for (const [dr, dc] of ORTHO) markers.push({ r: cr + dr, c: cc + dc, type: "m" });
      // Diagonal range 1 = move only; diagonal range 2 & 3 = both (jump-move OR fire-attack).
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
    case "Z":
      // Assassin: 0–2 diagonal glide, then 1 step in any direction (captures only on final).
      // Show 2-diagonal reach plus the 1-step ring around each diag landing.
      for (const [dr, dc] of DIAG) {
        for (let k = 1; k <= 2; k++) {
          const r = cr + dr * k;
          const c = cc + dc * k;
          markers.push({ r, c, type: "m" });
          for (const [ddr, ddc] of ALL8) markers.push({ r: r + ddr, c: c + ddc, type: "a" });
        }
      }
      // Also the "0 glide + 1 step" landing squares — adjacent ring as capture.
      for (const [dr, dc] of ALL8) markers.push({ r: cr + dr, c: cc + dc, type: "a" });
      return { rows, cols, center, markers };
    case "W":
      // Wizard: diagonals like a bishop + orthogonal same-color squares (every other step).
      for (const [dr, dc] of DIAG) ray(markers, cr, cc, dr, dc, 3, "b");
      for (const [dr, dc] of ORTHO) {
        // same-colour squares = even step counts: 2.
        markers.push({ r: cr + dr * 2, c: cc + dc * 2, type: "b" });
      }
      return { rows, cols, center, markers };
    case "J": {
      // Juggernaut: 2-square titan. Center occupies two cells stacked vertically
      // (front cell on top). Charge 1–5 forward, shift 1 sideways.
      const rowsJ = 9;
      const colsJ = 5;
      const crJ = 6; // rear cell
      const ccJ = 2;
      const centerJ = [
        { r: crJ, c: ccJ },     // rear
        { r: crJ - 1, c: ccJ }, // front
      ];
      const m: Array<{ r: number; c: number; type: Marker }> = [];
      // Forward charge from front cell, up to 5 squares — trample = both.
      for (let k = 1; k <= 5; k++) m.push({ r: crJ - 1 - k, c: ccJ, type: "b" });
      // Sideways shift 1 from each occupied cell (move only).
      m.push({ r: crJ, c: ccJ - 1, type: "m" });
      m.push({ r: crJ, c: ccJ + 1, type: "m" });
      m.push({ r: crJ - 1, c: ccJ - 1, type: "m" });
      m.push({ r: crJ - 1, c: ccJ + 1, type: "m" });
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
                  background: "hsl(var(--primary) / 0.55)",
                  boxShadow: "0 0 6px hsl(var(--primary) / 0.4)",
                }}
              />
            );
          } else if (kind === "a") {
            overlay = (
              <span
                className="absolute inset-1 rounded-sm animate-pulse"
                style={{
                  border: "2px solid hsl(0 84% 60% / 0.85)",
                  background: "hsl(0 84% 60% / 0.2)",
                }}
              />
            );
          } else if (kind === "b") {
            overlay = (
              <>
                <span
                  className="absolute inset-1 rounded-sm"
                  style={{
                    border: "2px solid hsl(38 92% 55% / 0.85)",
                    background: "hsl(38 92% 55% / 0.18)",
                  }}
                />
                <span
                  className="absolute inset-0 m-auto rounded-full animate-pulse"
                  style={{
                    width: "30%",
                    height: "30%",
                    background: "hsl(38 92% 55% / 0.9)",
                  }}
                />
              </>
            );
          }
          return (
            <div
              key={`${r}-${c}`}
              className={`relative ${checker} rounded-[2px] flex items-center justify-center`}
            >
              {kind === "center" && (
                <PieceById id={id} color={color} def={def} className="h-[80%] w-[80%]" />
              )}
              {overlay}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: "hsl(var(--primary) / 0.7)" }}
          />
          Move
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-sm"
            style={{
              width: 9,
              height: 9,
              border: "2px solid hsl(0 84% 60% / 0.85)",
              background: "hsl(0 84% 60% / 0.2)",
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
              border: "2px solid hsl(38 92% 55% / 0.85)",
              background: "hsl(38 92% 55% / 0.18)",
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
    </div>
  );
}

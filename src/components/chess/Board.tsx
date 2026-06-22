import { useEffect, useState } from "react";
import type { GameState, MoveTarget, PieceId, Square } from "@/game/types";
import { PieceGlyph } from "./PieceGlyph";
import { JuggernautGlyph } from "./JuggernautGlyph";
import { findRoyals } from "@/game/board";
import { inCheck, legalMovesFrom, moveTargetsFrom } from "@/game/moves";

interface BoardProps {
  state: GameState;
  humanColor: "w" | "b";
  flipped: boolean;
  legalFor: (sq: Square | null) => MoveTarget[];
  onMove: (from: Square, to: Square) => boolean;
  /** Currently-selected drop piece (renders legal-drop indicators). */
  dropPiece?: PieceId | null;
  dropTargets?: Square[];
  onDrop?: (pieceId: PieceId, to: Square) => boolean;
  disabled?: boolean;
  /** Notified whenever the on-board selection changes (or clears). */
  onSelectionChange?: (sq: Square | null) => void;
  /** Allow clicking an opponent piece to inspect its move/attack pattern.
   *  Only enabled in PvComputer (and analysis); disabled in PvP matches. */
  allowEnemyInspect?: boolean;
  /** When false, hides the legal-move dots for your own selected piece. */
  showHints?: boolean;
}

export function Board({ state, humanColor, flipped, legalFor, onMove, dropPiece, dropTargets, onDrop, disabled, onSelectionChange, allowEnemyInspect = false, showHints = true }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);

  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);

  // King's Hand mid-turn: auto-select the piece so the player sees that a
  // second king-step is still required (and the legal targets are painted).
  useEffect(() => {
    const ph = state.pendingHand;
    if (ph) setSelected({ r: ph.r, c: ph.c });
  }, [state.pendingHand?.r, state.pendingHand?.c]);


  const rows = state.board.length;
  const cols = state.board[0]?.length ?? 0;
  const selectedPieceForInspect = selected ? state.board[selected.r][selected.c] : null;
  const isEnemyInspect = !!selectedPieceForInspect && selectedPieceForInspect.color !== humanColor;
  const selectedTargets = isEnemyInspect && selected
    ? moveTargetsFrom(state, selected, false)
    : legalFor(selected ?? dragFrom);
  const targetKindBySquare = new Map(selectedTargets.map((t) => [`${t.square.r},${t.square.c}`, t.kind]));
  const last = state.history[state.history.length - 1];
  const moveCount = state.history.length;

  // Compute slide animation offsets for the piece that just moved.
  // Translates the destination piece from its previous (from) square visually.
  const dispR = (r: number) => ((humanColor === "w") !== flipped ? (rows - 1 - r) : r);
  const dispC = (c: number) => ((humanColor === "w") !== flipped ? c : (cols - 1 - c));
  const slideAnim = (() => {
    if (!last || !last.from) return null;
    if (last.kind === "archerShoot" || last.kind === "dragonAttack") return null; // ranged — attacker stays
    const fromDispR = dispR(last.from.r);
    const toDispR = dispR(last.to.r);
    const fromDispC = dispC(last.from.c);
    const toDispC = dispC(last.to.c);
    return {
      to: last.to,
      dx: (fromDispC - toDispC) * 100,
      dy: (fromDispR - toDispR) * 100,
      key: moveCount,
    };
  })();

  // Archer ranged-shot animation: an arrow flies from the archer (from) to the
  // target (to). The archer itself does not move on the board.
  const arrowAnim = (() => {
    if (!last || !last.from || last.kind !== "archerShoot") return null;
    const fromDispR = dispR(last.from.r);
    const toDispR = dispR(last.to.r);
    const fromDispC = dispC(last.from.c);
    const toDispC = dispC(last.to.c);
    const dx = (toDispC - fromDispC) * 100; // % of cell, rightward+
    const dy = (toDispR - fromDispR) * 100; // % of cell, downward+
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI; // arrow glyph points right
    return { from: last.from, dx, dy, rot, key: moveCount };
  })();

  // Dragon flame-breath animation: a flame streaks from the dragon (from) to
  // the captured piece (to). The dragon itself does not move on the board.
  const flameAnim = (() => {
    if (!last || !last.from || last.kind !== "dragonAttack") return null;
    const fromDispR = dispR(last.from.r);
    const toDispR = dispR(last.to.r);
    const fromDispC = dispC(last.from.c);
    const toDispC = dispC(last.to.c);
    const dx = (toDispC - fromDispC) * 100;
    const dy = (toDispR - fromDispR) * 100;
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { from: last.from, dx, dy, rot, key: moveCount };
  })();


  // ── Juggernaut partner map (deterministic) ─────────────────────────────
  // A juggernaut is a 2-cell piece. When multiple same-color juggernauts sit
  // adjacent along the pairing axis (e.g. four in a row), we must pair them
  // sequentially from the start of each run — pairs (0,1), (2,3), … — instead
  // of letting each cell pick its first neighbor independently. Otherwise the
  // overlapping partner picks render the titan as three (or more) overlapping
  // halves and capturing one cell appears to "split" them further.
  const juggPartnerMap: Map<string, Square> = (() => {
    const map = new Map<string, Square>();
    const wide = cols > rows;
    const isJugg = (r: number, c: number) =>
      !!state.board[r]?.[c] && state.registry[state.board[r][c]!.id]?.special === "juggernaut";
    if (wide) {
      // Pair vertically within each column.
      for (let c = 0; c < cols; c++) {
        let r = 0;
        while (r < rows) {
          if (!isJugg(r, c)) { r++; continue; }
          const color = state.board[r][c]!.color;
          let end = r;
          while (end + 1 < rows && isJugg(end + 1, c) && state.board[end + 1][c]!.color === color) end++;
          for (let i = r; i + 1 <= end; i += 2) {
            map.set(`${i},${c}`, { r: i + 1, c });
            map.set(`${i + 1},${c}`, { r: i, c });
          }
          r = end + 1;
        }
      }
    } else {
      // Pair horizontally within each row.
      for (let r = 0; r < rows; r++) {
        let c = 0;
        while (c < cols) {
          if (!isJugg(r, c)) { c++; continue; }
          const color = state.board[r][c]!.color;
          let end = c;
          while (end + 1 < cols && isJugg(r, end + 1) && state.board[r][end + 1]!.color === color) end++;
          for (let i = c; i + 1 <= end; i += 2) {
            map.set(`${r},${i}`, { r, c: i + 1 });
            map.set(`${r},${i + 1}`, { r, c: i });
          }
          c = end + 1;
        }
      }
    }
    return map;
  })();

  // If a juggernaut is selected, also highlight its partner square as "selected".
  const selectedPartner: Square | null = (() => {
    if (!selected) return null;
    const p = state.board[selected.r][selected.c];
    if (!p || state.registry[p.id]?.special !== "juggernaut") return null;
    return juggPartnerMap.get(`${selected.r},${selected.c}`) ?? null;
  })();


  // ── Juggernaut multi-cell move preview ─────────────────────────────────
  // When a juggernaut is selected we need to highlight the FULL 2-square
  // footprint at every legal destination, plus any trampled / path cells
  // for forward charges. Clicking on either cell of a destination footprint
  // must commit the move (translated to the lead cell stored in `to`).
  type SquareKey = string;
  const k = (r: number, c: number) => `${r},${c}`;
  const juggInfo: {
    footprint: Set<SquareKey>;         // every cell that becomes part of the titan after a legal move
    tramplePath: Set<SquareKey>;       // path cells a forward charge sweeps through (lead + partner lanes)
    trampleEnemies: Set<SquareKey>;    // cells where an enemy would be destroyed
    leadOf: Map<SquareKey, Square>;    // map any footprint cell → the move.to (lead) cell to send to onMove
  } | null = (() => {
    if (!selected) return null;
    const sp = state.board[selected.r][selected.c];
    if (!sp || state.registry[sp.id]?.special !== "juggernaut") return null;
    if (sp.color !== state.turn || sp.color !== humanColor) return null;
    if (!selectedPartner) return null;
    const offDr = selectedPartner.r - selected.r;
    const offDc = selectedPartner.c - selected.c;
    const footprint = new Set<SquareKey>();
    const tramplePath = new Set<SquareKey>();
    const trampleEnemies = new Set<SquareKey>();
    const leadOf = new Map<SquareKey, Square>();
    const moves = legalMovesFrom(state, selected);
    for (const m of moves) {
      const leadTo = m.to;
      const partnerTo = { r: leadTo.r + offDr, c: leadTo.c + offDc };
      footprint.add(k(leadTo.r, leadTo.c));
      footprint.add(k(partnerTo.r, partnerTo.c));
      leadOf.set(k(leadTo.r, leadTo.c), leadTo);
      leadOf.set(k(partnerTo.r, partnerTo.c), leadTo);
      if (m.kind === "juggCharge") {
        const dr = leadTo.r - selected.r;
        const dc = leadTo.c - selected.c;
        const steps = Math.max(Math.abs(dr), Math.abs(dc));
        const sDr = steps ? Math.sign(dr) : 0;
        const sDc = steps ? Math.sign(dc) : 0;
        for (let s = 1; s <= steps; s++) {
          const a = { r: selected.r + s * sDr, c: selected.c + s * sDc };
          const b = { r: selectedPartner.r + s * sDr, c: selectedPartner.c + s * sDc };
          tramplePath.add(k(a.r, a.c));
          tramplePath.add(k(b.r, b.c));
          const ta = state.board[a.r]?.[a.c];
          const tb = state.board[b.r]?.[b.c];
          if (ta && ta.color !== sp.color) trampleEnemies.add(k(a.r, a.c));
          if (tb && tb.color !== sp.color) trampleEnemies.add(k(b.r, b.c));
        }
      }
    }
    return { footprint, tramplePath, trampleEnemies, leadOf };
  })();

  const checkColor = inCheck(state, state.turn) ? state.turn : null;
  const checkSquares = checkColor ? findRoyals(state, checkColor) : [];

  // Spirit View: when the human's Necromancer is selected, expose a map of
  // corpses keyed by "r,c" → most-recent corpse to render as a ghost overlay.
  const selectedPiece = selected ? state.board[selected.r][selected.c] : null;
  const selectedDef = selectedPiece ? state.registry[selectedPiece.id] : null;
  const necromancerSelected =
    !!selectedPiece &&
    selectedPiece.color === humanColor &&
    selectedDef?.special === "necromancer";
  type GhostInfo = {
    id: string;
    color: "w" | "b";
    originalOwner: "w" | "b";
    occupied: boolean; // square has a piece on it (corpse buried under another piece)
  };
  const ghostMap = new Map<string, GhostInfo>();
  if (necromancerSelected && selected) {
    // Only the MOST RECENT corpse on each square is shown. If that latest
    // corpse is an "object" piece (portal, juggernaut, barricade/immobile)
    // the square is not raisable — skip. Show ghosts for ALL remaining
    // corpses across the board; the raise highlight only lights up when
    // the necromancer is adjacent and a matching piece is in the graveyard.
    const latest = new Map<string, (typeof state.corpses)[number]>();
    for (const corp of state.corpses ?? []) {
      latest.set(`${corp.square.r},${corp.square.c}`, corp);
    }
    for (const [key, corp] of latest) {
      const cdef = state.registry[corp.pieceId];
      if (!cdef) continue;
      if (cdef.special === "juggernaut" || cdef.special === "portal") continue;
      if (cdef.immobile) continue;
      const occupied = !!state.board[corp.square.r][corp.square.c];
      ghostMap.set(key, {
        id: corp.pieceId,
        color: humanColor,
        originalOwner: corp.originalOwner,
        occupied,
      });
    }
  }

  const rowIndices = Array.from({ length: rows }, (_, i) => i);
  const colIndices = Array.from({ length: cols }, (_, i) => i);
  const displayRows = (humanColor === "w" ? rowIndices.slice().reverse() : rowIndices.slice());
  const displayCols = (humanColor === "w" ? colIndices : colIndices.slice().reverse());
  if (flipped) { displayRows.reverse(); displayCols.reverse(); }

  // Prism aura: all king-distance-1 neighbors of every Prism on the board.
  // Pieces that enter or remain in these squares get color-flipped.
  const prismAura = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = state.board[r][c];
      if (!p || state.registry[p.id]?.special !== "prism") continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const o = state.board[nr][nc];
          if (o && state.registry[o.id]?.special === "prism") continue;
          prismAura.add(`${nr},${nc}`);
        }
      }
    }
  }

  const pendingHand = state.pendingHand ?? null;
  const isPendingHandTurn = !!pendingHand;

  const handleSquareClick = (sq: Square) => {
    if (disabled) return;
    if (dropPiece && dropTargets?.some((t) => t.r === sq.r && t.c === sq.c)) {
      onDrop?.(dropPiece, sq);
      return;
    }
    const p = state.board[sq.r][sq.c];
    if (selected) {
      // Juggernaut: clicking either half of a legal-destination footprint
      // commits the move (routed through the move's lead-cell `to`).
      if (juggInfo) {
        const lead = juggInfo.leadOf.get(`${sq.r},${sq.c}`);
        if (lead) {
          const ok = onMove(selected, lead);
          if (ok) { setSelected(null); return; }
        }
      }
      if (selected.r === sq.r && selected.c === sq.c) {
        // King's Hand 2nd step is optional: clicking the pending piece's
        // own square commits a handPass (stay put, end the turn).
        if (isPendingHandTurn && pendingHand && pendingHand.r === sq.r && pendingHand.c === sq.c) {
          const ok = onMove(selected, sq);
          if (ok) { setSelected(null); return; }
        }
        setSelected(null);
        return;
      }
      // Clicking the partner half of the selected juggernaut keeps it selected.
      if (selectedPartner && selectedPartner.r === sq.r && selectedPartner.c === sq.c) {
        setSelected(sq); return;
      }
      const ok = onMove(selected, sq);
      if (ok) { setSelected(null); return; }
      if (p) { setSelected(sq); return; }
      setSelected(null);
    } else {
      if (p) {
        // Enemy-piece inspection is opt-in (PvComputer only).
        if (p.color !== humanColor && !allowEnemyInspect) return;
        setSelected(sq);
      }
    }

  };

  // Aspect ratio: cols / rows
  return (
    <div
      className="grid w-full max-w-[min(92vw,640px)] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        aspectRatio: `${cols} / ${rows}`,
      }}
    >
      {displayRows.map((r) =>
        displayCols.map((c) => {
          const sq: Square = { r, c };
          const piece = state.board[r][c];
          const def = piece ? state.registry[piece.id] : undefined;
          const light = (r + c) % 2 === 1;
          const isSelected = (selected && selected.r === r && selected.c === c) || (selectedPartner && selectedPartner.r === r && selectedPartner.c === c);
          const juggFoot = juggInfo?.footprint.has(`${r},${c}`) ?? false;
          const juggPath = juggInfo?.tramplePath.has(`${r},${c}`) ?? false;
          const juggTrample = juggInfo?.trampleEnemies.has(`${r},${c}`) ?? false;
          const isDropTarget = !!dropPiece && (dropTargets?.some((t) => t.r === r && t.c === c) ?? false);
          const isPendingHandSquare = !!pendingHand && pendingHand.r === r && pendingHand.c === c;

          // Three-color move indicator:
          //   RED  = piece can capture an enemy here (or juggernaut trample target).
          //   GREEN= legal/pseudo move to an empty square (no attack threatened).
          //   ORANGE= square is threatened (could capture if enemy were here),
          //           but no enemy currently stands there.
          let markerKind: MoveTarget["kind"] | null = null;
          if (juggTrample) {
            markerKind = "capture";
          } else if (juggFoot) {
            markerKind = null; // juggernaut footprint paints its own overlay
          } else if (selectedPieceForInspect && selectedPieceForInspect.color === humanColor) {
            if (showHints) markerKind = targetKindBySquare.get(`${r},${c}`) ?? null;
          } else if (isEnemyInspect) {
            markerKind = targetKindBySquare.get(`${r},${c}`) ?? null;
          }
          // The pending-hand square shows a dedicated "↺ stay" badge below,
          // so suppress the generic green move dot the pass move would add
          // on top of the piece itself.
          if (isPendingHandSquare && markerKind === "move") markerKind = null;

          const isLast = last && (last.from && last.from.r === r && last.from.c === c) || (last && last.to.r === r && last.to.c === c);
          const isCheck = checkSquares.some((k) => k.r === r && k.c === c);

          const showFile = (humanColor === "w" ? r === 0 : r === rows - 1);
          const showRank = (humanColor === "w" ? c === 0 : c === cols - 1);
          const fileLabel = "abcdefghijkl"[c];
          const rankLabel = String(r + 1);

          return (
            <div
              key={`${r}-${c}`}
              className="relative flex items-center justify-center select-none cursor-pointer"
              style={{
                background: light ? "var(--color-board-light)" : "var(--color-board-dark)",
                fontSize: `calc(min(92vw, 640px) / ${cols} * 0.6)`,
              }}
              onClick={() => handleSquareClick(sq)}
              onDragOver={(e) => { if (dragFrom) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom) { onMove(dragFrom, sq); setDragFrom(null); setSelected(null); }
              }}
            >
              {isLast && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--color-board-last)" }} />
              )}
              {prismAura.has(`${r},${c}`) && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  aria-hidden
                  title="Prism aura — pieces here flip color"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,59,59,0.18), rgba(255,159,28,0.18), rgba(255,225,77,0.18), rgba(74,222,128,0.18), rgba(56,189,248,0.18), rgba(167,139,250,0.18))",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
                  }}
                />
              )}
              {/* Juggernaut charge path — faint sweep so players see the lane. */}
              {juggPath && !juggFoot && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: "color-mix(in oklab, var(--color-board-capture) 22%, transparent)" }} />
              )}
              {/* Juggernaut destination footprint — both cells shaded together. */}
              {juggFoot && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "color-mix(in oklab, var(--color-board-legal) 30%, transparent)",
                    boxShadow: "inset 0 0 0 2px var(--color-board-legal)",
                  }} />
              )}
              {isSelected && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--color-board-highlight)" }} />
              )}
              {isPendingHandSquare && (
                <>
                  <div
                    className="absolute inset-1 rounded-lg pointer-events-none ring-2 ring-dashed animate-pulse"
                    style={{
                      borderColor: "var(--color-board-legal)",
                      boxShadow: "inset 0 0 0 2px var(--color-board-legal)",
                    }}
                    aria-hidden
                  />
                  <span
                    className="absolute top-0.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full text-[9px] font-bold pointer-events-none uppercase tracking-wide"
                    style={{
                      background: "var(--color-board-legal)",
                      color: "oklch(0.18 0.04 145)",
                      lineHeight: 1,
                      letterSpacing: "0.04em",
                    }}
                    aria-label="Click this piece to stay (skip 2nd step)"
                    title="Click to stay — 2nd king-step is optional"
                  >
                    ↺ stay
                  </span>
                </>
              )}
              {isCheck && (
                <div className="absolute inset-0 pointer-events-none animate-pulse"
                  style={{ background: "radial-gradient(circle, var(--color-board-check), transparent 70%)" }} />
              )}
              {showFile && (
                <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold opacity-60"
                  style={{ color: light ? "oklch(0.3 0.04 145)" : "oklch(0.92 0.02 85)" }}>{fileLabel}</span>
              )}
              {showRank && (
                <span className="absolute top-0.5 left-1 text-[10px] font-semibold opacity-60"
                  style={{ color: light ? "oklch(0.3 0.04 145)" : "oklch(0.92 0.02 85)" }}>{rankLabel}</span>
              )}
              {markerKind === "move" && (
                <div className="absolute rounded-full pointer-events-none"
                  style={{ width: "30%", height: "30%", background: "var(--color-board-legal)" }} />
              )}
              {markerKind === "attack" && (
                <div className="absolute rounded-full pointer-events-none"
                  style={{ width: "30%", height: "30%", background: "var(--color-board-attack)" }} />
              )}
              {(markerKind === "ranged" || markerKind === "rangedCapture") && (
                <div
                  className="absolute rounded-full pointer-events-none flex items-center justify-center"
                  style={{
                    width: "42%",
                    height: "42%",
                    border: `3px solid var(${markerKind === "rangedCapture" ? "--color-board-capture" : "--color-board-attack"})`,
                    background: "transparent",
                  }}
                >
                  <div
                    className="absolute"
                    style={{ width: "78%", height: "3px", background: `var(${markerKind === "rangedCapture" ? "--color-board-capture" : "--color-board-attack"})` }}
                  />
                  <div
                    className="absolute"
                    style={{ width: "3px", height: "78%", background: `var(${markerKind === "rangedCapture" ? "--color-board-capture" : "--color-board-attack"})` }}
                  />
                  <div
                    className="rounded-full"
                    style={{ width: "20%", height: "20%", background: `var(${markerKind === "rangedCapture" ? "--color-board-capture" : "--color-board-attack"})` }}
                  />
                </div>
              )}
              {markerKind === "capture" && !juggFoot && (
                <div className="absolute inset-1 rounded-full pointer-events-none ring-4"
                  style={{ borderColor: "var(--color-board-capture)", boxShadow: "inset 0 0 0 4px var(--color-board-capture)" }} />
              )}
              {isDropTarget && (
                <div className="absolute inset-1 rounded-lg pointer-events-none ring-2 ring-dashed"
                  style={{ borderColor: "var(--color-board-legal)", boxShadow: "inset 0 0 0 2px var(--color-board-legal)" }} />
              )}
              {arrowAnim && arrowAnim.from.r === r && arrowAnim.from.c === c && (
                <div
                  key={`arrow-${arrowAnim.key}`}
                  aria-hidden
                  className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                  style={{
                    fontSize: "0.55em",
                    ["--arrow-dx" as string]: `${arrowAnim.dx}%`,
                    ["--arrow-dy" as string]: `${arrowAnim.dy}%`,
                    ["--arrow-rot" as string]: `${arrowAnim.rot}deg`,
                    animation: "archer-arrow 360ms ease-out forwards",
                    filter: "drop-shadow(0 0 2px rgba(0,0,0,0.55))",
                  }}
                >
                  ➤
                </div>
              )}
              {flameAnim && flameAnim.from.r === r && flameAnim.from.c === c && (
                <div
                  key={`flame-${flameAnim.key}`}
                  aria-hidden
                  className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                  style={{
                    fontSize: "0.7em",
                    ["--arrow-dx" as string]: `${flameAnim.dx}%`,
                    ["--arrow-dy" as string]: `${flameAnim.dy}%`,
                    ["--arrow-rot" as string]: `${flameAnim.rot}deg`,
                    animation: "dragon-flame 520ms ease-out forwards",
                    filter: "drop-shadow(0 0 6px rgba(255,120,0,0.85)) drop-shadow(0 0 12px rgba(255,60,0,0.6))",
                  }}
                >
                  🔥
                </div>
              )}
              {piece && (() => {
                const isJugg = state.registry[piece.id]?.special === "juggernaut";
                if (isJugg) {
                  const wide = cols > rows;
                  const partner = juggPartnerMap.get(`${r},${c}`) ?? null;
                  // Render the unified 2-cell glyph only on the "lead" half (lower index
                  // on the perpendicular axis); the trailing half stays visually empty
                  // but still clickable/highlightable as its own square.
                  if (partner) {
                    const isLead = wide ? r < partner.r : c < partner.c;
                    if (!isLead) return null;
                    const orientation = wide ? "vertical" : "horizontal";
                    const facing: "up" | "down" | "left" | "right" = wide
                      ? (piece.color === "w" ? "right" : "left")
                      : (piece.color === "w" ? "up" : "down");
                    const animate = slideAnim && slideAnim.to.r === r && slideAnim.to.c === c;
                    return (
                      <div
                        key={animate ? `anim-${slideAnim.key}` : undefined}
                        draggable={!disabled && piece.color === state.turn && piece.color === humanColor}
                        onDragStart={() => { setDragFrom(sq); setSelected(sq); }}
                        onDragEnd={() => setDragFrom(null)}
                        className="relative z-10 w-full h-full"
                        style={animate ? {
                          ["--slide-x" as string]: `${slideAnim.dx}%`,
                          ["--slide-y" as string]: `${slideAnim.dy}%`,
                          animation: "piece-slide 160ms ease-out",
                        } : undefined}
                      >
                        <JuggernautGlyph color={piece.color} orientation={orientation} facing={facing} />
                      </div>
                    );
                  }
                  // Orphan juggernaut (no partner) — fall through to normal glyph.
                }

                const animate = slideAnim && slideAnim.to.r === r && slideAnim.to.c === c;
                return (
                  <div
                    key={animate ? `anim-${slideAnim.key}` : undefined}
                    draggable={!disabled && piece.color === state.turn && piece.color === humanColor}
                    onDragStart={() => { setDragFrom(sq); setSelected(sq); }}
                    onDragEnd={() => setDragFrom(null)}
                    className="relative z-10 flex items-center justify-center w-full h-full"
                    style={animate ? {
                      ["--slide-x" as string]: `${slideAnim.dx}%`,
                      ["--slide-y" as string]: `${slideAnim.dy}%`,
                      animation: "piece-slide 160ms ease-out",
                    } : undefined}
                  >
                    <PieceGlyph piece={piece} def={def} />
                  </div>
                );
              })()}
              {/* Spirit View overlay — render ghost over every corpse square,
                   including occupied ones, so pieces underneath remain visible. */}
              {necromancerSelected && ghostMap.has(`${r},${c}`) && (() => {
                const g = ghostMap.get(`${r},${c}`)!;
                const gdef = state.registry[g.id];
                const isEnemy = g.originalOwner !== humanColor;
                const adjacent = selected
                  ? Math.max(Math.abs(selected.r - r), Math.abs(selected.c - c)) === 1
                  : false;
                const canRaise = adjacent && !g.occupied;
                return (
                  <>
                    <div
                      className="absolute inset-1 rounded-md pointer-events-none"
                      aria-hidden
                      style={{
                        background:
                          "radial-gradient(circle, rgba(168,85,247,0.4) 0%, rgba(168,85,247,0.15) 55%, transparent 75%)",
                        boxShadow: canRaise
                          ? "inset 0 0 0 2px rgba(168,85,247,0.9), 0 0 14px rgba(168,85,247,0.6)"
                          : undefined,
                      }}
                    />
                    <div
                      className="absolute inset-0 z-[30] flex items-center justify-center pointer-events-none"
                      style={{ opacity: 0.5 }}
                      aria-hidden
                      title={`Ghost ${gdef?.name ?? g.id}${isEnemy ? " — will rise as Undead" : ""}${g.occupied ? " — square occupied, clear to raise" : ""}`}
                    >
                      <PieceGlyph piece={{ id: g.id, color: g.color, undead: isEnemy }} def={gdef} />
                    </div>
                  </>
                );
              })()}
            </div>
          );
        }),
      )}
    </div>
  );
}

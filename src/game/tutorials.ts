import type { Design, PieceId } from "./types";
import { PIECE_LIBRARY, STANDARD_PIECE_IDS } from "./pieces";

export interface TutorialSlide {
  title: string;
  body?: string;
  bullets?: string[];
  pieceId?: PieceId;
}

export interface GameTutorial {
  slides: TutorialSlide[];
  generatedBy?: "builtin" | "ai" | "fallback";
}

/** Programmatic tutorial built from the design + piece library. Used for
 *  built-in games and as a graceful fallback when AI generation is unavailable. */
export function buildBaseTutorial(opts: {
  name: string;
  description: string;
  design: Design;
}): GameTutorial {
  const { name, description, design } = opts;
  const present = new Set(design.placements.map((p) => p.pieceId));
  const customPresent = Array.from(present).filter(
    (id) => !STANDARD_PIECE_IDS.includes(id as PieceId),
  ) as PieceId[];

  // Build a lookup that includes both built-in pieces and any user-defined
  // pieces that ship with the design (e.g. a Catapult created in the piece
  // builder). Without this, custom pieces would silently lose their slide.
  const customById = new Map(design.customPieces.map((p) => [p.id, p]));
  const lookup = (id: PieceId) => customById.get(id) ?? PIECE_LIBRARY[id];

  const slides: TutorialSlide[] = [
    {
      title: `Welcome to ${name}`,
      body:
        description ||
        `A ${design.rows}×${design.cols} chess variant. Take a moment to learn the pieces, then jump in.`,
    },
    {
      title: "Board & setup",
      body: `Play unfolds on a ${design.rows}×${design.cols} board with ${design.placements.length} starting pieces. White moves first.`,
      bullets: [
        `Board: ${design.rows} ranks × ${design.cols} files`,
        `Starting army per side: ${Math.floor(design.placements.length / 2)} pieces`,
      ],
    },
  ];

  if (customPresent.length === 0) {
    slides.push({
      title: "Pieces",
      body: "Every piece uses its standard chess movement — kings, queens, rooks, bishops, knights, and pawns.",
    });
  } else {
    for (const id of customPresent) {
      const def = lookup(id);
      if (!def) continue;
      slides.push({
        title: `${def.name}`,
        body: def.description,
        pieceId: id,
      });
    }
  }

  slides.push({
    title: "How you win",
    body: "Capture the enemy King to win. If the player to move has no legal moves, it's stalemate — a draw. Standard check rules apply: you can't leave your King in check.",
  });

  slides.push({
    title: "Tips for new players",
    bullets: [
      "Tap any piece to see where it can move.",
      "Open the Info button on the game screen for per-piece tips at any time.",
      "Develop pieces toward the center early, and protect your King.",
      "Don't trade a strong custom piece for a weaker one without a clear plan.",
      "You can take back a move or restart anytime from the settings panel.",
    ],
  });

  return { slides, generatedBy: "builtin" };
}

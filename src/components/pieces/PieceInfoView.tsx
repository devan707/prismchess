import { PieceById } from "@/components/chess/PieceGlyph";
import { PieceReachPreview } from "@/components/pieces/PieceReachPreview";
import { PieceWorthBadge } from "@/components/pieces/PieceWorthBadge";
import type { PieceDef } from "@/game/types";

interface Props {
  def: PieceDef;
  name: string;
  description?: string | null;
  movementSummary?: string | null;
  /** Reach preview grid size. Defaults to 9. */
  previewSize?: number;
  /** Glyph size override. */
  glyphSize?: "sm" | "md" | "lg";
  /** Hide the description block (e.g. when shown elsewhere). */
  hideDescription?: boolean;
}

/**
 * Reusable card showing a custom piece's glyph, technical movement diagram,
 * AI-generated movement summary, and (optionally) the author's description.
 * Used in the piece detail page, the in-design library panel info popup,
 * and the in-game tutorial.
 */
export function PieceInfoView({
  def,
  name,
  description,
  movementSummary,
  previewSize = 9,
  glyphSize = "md",
  hideDescription,
}: Props) {
  const glyphClass =
    glyphSize === "lg" ? "text-7xl" : glyphSize === "sm" ? "text-3xl" : "text-5xl";
  const tile =
    glyphSize === "lg" ? "w-28 h-28" : glyphSize === "sm" ? "w-12 h-12" : "w-16 h-16";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className={`${tile} rounded-lg bg-stone-200 dark:bg-stone-700 flex items-center justify-center shrink-0`}>
          <PieceById id={def.id} color="w" def={def} className={glyphClass} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg font-semibold truncate">{name}</h3>
            <PieceWorthBadge id={def.id} def={def} />
          </div>
          {!hideDescription && description && (
            <p className="text-sm text-foreground/90 mt-1">{description}</p>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="flex justify-center sm:block">
          <PieceReachPreview def={def} size={previewSize} />
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Movement & attacks
          </h4>
          {movementSummary ? (
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {movementSummary}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              Movement summary will appear once the piece is saved or updated.
            </p>
          )}
          <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1">
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 align-middle" />
              Move &amp; capture
              <span className="ml-3 inline-block w-2 h-2 rounded-full border-2 border-emerald-500 mr-1.5 align-middle" />
              Move only
              <span className="ml-3 inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 align-middle" />
              Capture only
            </p>
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-sky-500 mr-1.5 align-middle" />
              Slide
              <span className="ml-3 inline-block w-3 h-3 rounded-full border-2 border-orange-500 mr-1.5 align-middle" />
              Ranged
              <span className="ml-3 inline-block w-2 h-2 rounded-full ring-2 ring-amber-400/70 mr-1.5 align-middle" />
              Conditional
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

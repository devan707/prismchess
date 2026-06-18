import { Users, Play } from "lucide-react";

interface Props {
  unique: number;
  total: number;
  className?: string;
}

/** Tiny "X players · Y plays" badge shown on gallery cards. */
export function PlayCount({ unique, total, className }: Props) {
  if (unique === 0 && total === 0) return null;
  return (
    <div
      className={`pointer-events-none flex items-center gap-2 text-[10px] text-muted-foreground ${className ?? ""}`}
      title={`${unique} unique players · ${total} total games played`}
    >
      <span className="inline-flex items-center gap-0.5">
        <Users className="h-3 w-3" /> {formatCount(unique)}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <Play className="h-3 w-3" /> {formatCount(total)}
      </span>
    </div>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

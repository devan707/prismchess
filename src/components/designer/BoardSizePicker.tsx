import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  rows: number;
  cols: number;
  onChange: (rows: number, cols: number) => void;
}

const PRESETS: Array<[number, number, string]> = [
  [5, 5, "5×5"],
  [6, 6, "6×6"],
  [8, 8, "8×8"],
  [10, 10, "10×10"],
  [3, 12, "3×12"],
  [5, 8, "5×8"],
];

export function BoardSizePicker({ rows, cols, onChange }: Props) {
  const clamp = (n: number) => Math.min(12, Math.max(3, Math.floor(n)));
  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <h3 className="font-display text-sm font-semibold">Board size</h3>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([r, c, label]) => {
          const active = r === rows && c === cols;
          return (
            <Button
              key={label}
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => onChange(r, c)}
            >{label}</Button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Rows</label>
          <Input
            type="number"
            min={3}
            max={12}
            value={rows}
            onChange={(e) => onChange(clamp(Number(e.target.value || 3)), cols)}
            className="h-8"
          />
        </div>
        <span className="pt-5 text-muted-foreground">×</span>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Columns</label>
          <Input
            type="number"
            min={3}
            max={12}
            value={cols}
            onChange={(e) => onChange(rows, clamp(Number(e.target.value || 3)))}
            className="h-8"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">3 to 12 in either direction. Rectangular boards are encouraged.</p>
    </div>
  );
}

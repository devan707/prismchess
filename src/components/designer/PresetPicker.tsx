import { Button } from "@/components/ui/button";
import { PRESETS } from "@/game/design";

interface Props {
  onApply: (presetId: string) => void;
}

export function PresetPicker({ onApply }: Props) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <h3 className="font-display text-sm font-semibold">Starting layout</h3>
      <p className="text-[11px] text-muted-foreground">Apply a preset, then drag pieces to customize.</p>
      <div className="grid grid-cols-1 gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            size="sm"
            className="justify-start h-auto py-2 text-left"
            onClick={() => onApply(p.id)}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-semibold text-xs">{p.name}</span>
              <span className="text-[10px] text-muted-foreground whitespace-normal">{p.description}</span>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}

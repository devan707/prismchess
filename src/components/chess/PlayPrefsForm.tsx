import type { Difficulty } from "@/game/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PlayPrefs } from "@/lib/play-prefs";

interface Props {
  value: PlayPrefs;
  onChange: (next: PlayPrefs) => void;
  compact?: boolean;
}

/** Shared controls for difficulty + show-move-hints + show-piece-info-window. */
export function PlayPrefsForm({ value, onChange, compact }: Props) {
  const set = <K extends keyof PlayPrefs>(k: K, v: PlayPrefs[K]) => onChange({ ...value, [k]: v });
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <Label className="text-xs text-muted-foreground">Difficulty</Label>
        <Select value={value.difficulty} onValueChange={(v) => set("difficulty", v as Difficulty)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
        <div className="min-w-0">
          <Label className="text-sm">Show move possibilities</Label>
          <p className="text-[11px] text-muted-foreground">Highlight legal squares when you select one of your pieces.</p>
        </div>
        <Switch checked={value.showHints} onCheckedChange={(v) => set("showHints", v)} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
        <div className="min-w-0">
          <Label className="text-sm">Show piece info window</Label>
          <p className="text-[11px] text-muted-foreground">Show the description panel when a piece is selected.</p>
        </div>
        <Switch checked={value.showTips} onCheckedChange={(v) => set("showTips", v)} />
      </div>
    </div>
  );
}

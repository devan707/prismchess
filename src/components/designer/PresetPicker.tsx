import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESETS, type UserPreset } from "@/game/design";
import { Pencil, Save, Trash2, X, Check } from "lucide-react";

interface Props {
  onApply: (presetId: string) => void;
  userPresets: UserPreset[];
  onSaveCurrentAsPreset: (name: string) => void;
  onRenameUserPreset: (id: string, name: string) => void;
  onDeleteUserPreset: (id: string) => void;
}

export function PresetPicker({
  onApply,
  userPresets,
  onSaveCurrentAsPreset,
  onRenameUserPreset,
  onDeleteUserPreset,
}: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startEdit = (p: UserPreset) => { setEditingId(p.id); setEditName(p.name); };
  const commitEdit = () => {
    if (editingId && editName.trim()) onRenameUserPreset(editingId, editName.trim());
    setEditingId(null);
  };

  const saveCurrent = () => {
    const name = newName.trim();
    if (!name) return;
    onSaveCurrentAsPreset(name);
    setNewName("");
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <h3 className="font-display text-sm font-semibold">Starting layout</h3>
      <p className="text-[11px] text-muted-foreground">
        Apply a preset, then drag pieces to customize. Layouts scale symmetrically to your board size.
      </p>
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

      {userPresets.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Your layouts</p>
          {userPresets.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              {editingId === p.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                    className="h-7 text-xs flex-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={commitEdit} title="Save">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)} title="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start flex-1 h-7 text-xs"
                    onClick={() => onApply(`user:${p.id}`)}
                  >
                    {p.name}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(p)} title="Rename">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete layout "${p.name}"?`)) onDeleteUserPreset(p.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Save current as layout</p>
        <div className="flex items-center gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveCurrent(); }}
            placeholder="Layout name"
            className="h-7 text-xs flex-1"
          />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={saveCurrent} disabled={!newName.trim()}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Saves your back rank + pawn row. Only visible to you.
        </p>
      </div>
    </div>
  );
}

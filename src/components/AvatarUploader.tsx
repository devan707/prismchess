import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fileToSquareJpeg, uploadAvatar, type UploadedAvatar } from "@/lib/avatar";

interface Props {
  /** Existing avatar URL to show as preview (signed URL or null). */
  value?: string | null;
  /** Existing storage path (for deletion when replaced). */
  previousPath?: string | null;
  /** Called with the uploaded avatar details once the file is in storage. */
  onUploaded: (uploaded: UploadedAvatar) => void;
  /** Optional clear handler — shown only when value is set. */
  onClear?: () => void;
  size?: number;
}

export function AvatarUploader({ value, previousPath, onUploaded, onClear, size = 96 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error("Please sign in again to upload.");
      const blob = await fileToSquareJpeg(file);
      // Show local preview immediately for snappy feedback.
      const localUrl = URL.createObjectURL(blob);
      setPreview(localUrl);
      const uploaded = await uploadAvatar(userRes.user.id, blob, previousPath ?? null);
      // Swap the local preview for the canonical signed URL.
      URL.revokeObjectURL(localUrl);
      setPreview(uploaded.signedUrl);
      onUploaded(uploaded);
      toast.success("Photo uploaded");
    } catch (e) {
      setPreview(value ?? null);
      toast.error(e instanceof Error ? e.message : "Couldn't upload photo");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
        aria-label="Avatar preview"
      >
        {preview ? (
          <img src={preview} alt="Your avatar" className="w-full h-full object-cover" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (<><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading…</>) : (
            <><Upload className="h-3.5 w-3.5 mr-1" />{preview ? "Replace photo" : "Upload photo"}</>
          )}
        </Button>
        {preview && onClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => { setPreview(null); onClear(); }}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Remove photo
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">JPG, PNG, or WebP. Up to 3 MB. Cropped square.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

import { supabase } from "@/integrations/supabase/client";

export const AVATARS_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3 MB
export const AVATAR_OUTPUT_SIZE = 512; // px, square
const SIGNED_URL_SECONDS = 60 * 60 * 24 * 365 * 5; // ~5 years

export interface UploadedAvatar {
  /** Path inside the bucket, e.g. `<userId>/<ts>.jpg`. Stored on the profile so
   * we can delete the prior file when a user replaces their photo. */
  path: string;
  /** Long-lived signed URL safe to embed in <img src>. Refreshed on next upload. */
  signedUrl: string;
}

/** Read a File into an <img>, crop to a centered square, scale to a fixed size,
 * and re-encode as JPEG. Keeps avatars small and uniform regardless of input. */
export async function fileToSquareJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (jpg, png, or webp).");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Image is too large. Please choose a file under 3 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.floor((img.naturalWidth - side) / 2);
    const sy = Math.floor((img.naturalHeight - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported in this browser.");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Couldn't encode image."))),
        "image/jpeg",
        0.88,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload a processed avatar blob and return its signed URL + storage path.
 * Deletes the previous file (if provided) on success. */
export async function uploadAvatar(
  userId: string,
  blob: Blob,
  previousPath?: string | null,
): Promise<UploadedAvatar> {
  const ts = Date.now();
  const path = `${userId}/${ts}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: signed, error: signErr } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    throw new Error(signErr?.message ?? "Couldn't create avatar link.");
  }

  if (previousPath && previousPath !== path) {
    // Best-effort cleanup of the old file. Ignore failures.
    supabase.storage.from(AVATARS_BUCKET).remove([previousPath]).catch(() => {});
  }

  return { path, signedUrl: signed.signedUrl };
}

/** Re-sign an existing avatar path. Useful if a stored signed URL has expired. */
export async function refreshAvatarSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

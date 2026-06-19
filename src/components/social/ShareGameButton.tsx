import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  /** URL slug under /g/$slug. */
  slug: string;
  /** Game name, used in the share sheet title. */
  name: string;
  description?: string;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Hide the text label, keep just the icon. */
  iconOnly?: boolean;
}

/**
 * Single button that handles both the native Web Share sheet (mobile) and
 * a clipboard-copy fallback (desktop / unsupported browsers).
 */
export function ShareGameButton({
  slug, name, description, size = "sm", variant = "outline", iconOnly,
}: Props) {
  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url =
      typeof window === "undefined"
        ? `/g/${slug}`
        : `${window.location.origin}/g/${slug}`;
    const shareData: ShareData = {
      title: `${name} — Prism Chess`,
      text: description ? `${name}: ${description}` : `Play "${name}" on Prism Chess`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.(shareData) !== false) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // User dismissed the share sheet — fall through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  return (
    <Button size={size} variant={variant} onClick={handleShare} aria-label="Share game">
      <Share2 className={iconOnly ? "h-4 w-4" : "h-3 w-3 mr-1"} />
      {!iconOnly && "Share"}
    </Button>
  );
}

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface Props {
  variant?: "menuitem" | "button";
}

export function NotificationsToggle({ variant = "button" }: Props) {
  const { supported, permission, subscribed, busy, enable, disable, isPreview } =
    usePushNotifications();

  if (!supported) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (subscribed) {
        await disable();
        toast.success("Notifications turned off");
      } else {
        if (isPreview) {
          toast.message("Open the published app to enable notifications", {
            description: "Browser previews don't allow push subscriptions.",
          });
          return;
        }
        if (permission === "denied") {
          toast.error("Notifications are blocked", {
            description: "Allow notifications for this site in your browser settings.",
          });
          return;
        }
        await enable();
        toast.success("Notifications enabled");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update notifications");
    }
  };

  const label = subscribed ? "Turn off notifications" : "Enable notifications";
  const Icon = subscribed ? BellOff : Bell;

  if (variant === "menuitem") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon className="h-4 w-4 mr-2" /> {label}
      </button>
    );
  }

  return (
    <Button size="sm" variant="outline" className="gap-2" onClick={handleClick} disabled={busy}>
      <Icon className="h-4 w-4" /> {label}
    </Button>
  );
}

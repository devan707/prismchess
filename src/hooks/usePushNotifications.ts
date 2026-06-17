import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { savePushSubscription, deletePushSubscription } from "@/lib/push.functions";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

type PermState = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buf;
}

function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** In the Lovable editor preview iframe we don't want to register service
 *  workers (per the PWA skill). Detect those hosts. */
function isPreviewHost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovableproject-dev.com") ||
    h.endsWith(".beta.lovable.dev") ||
    window.self !== window.top
  );
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveFn = useServerFn(savePushSubscription);
  const deleteFn = useServerFn(deletePushSubscription);

  const refresh = useCallback(async () => {
    if (!isSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermState);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = (await reg?.pushManager.getSubscription()) ?? null;
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!isSupported()) throw new Error("Notifications aren't supported on this device.");
    if (isPreviewHost()) {
      throw new Error("Notifications only work on the published app, not the editor preview.");
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermState);
      if (perm !== "granted") return;

      const reg =
        (await navigator.serviceWorker.getRegistration("/push-sw.js")) ??
        (await navigator.serviceWorker.register("/push-sw.js", { scope: "/" }));
      // Make sure it's activated before subscribing.
      if (reg.installing || reg.waiting) {
        await new Promise<void>((resolve) => {
          const sw = reg.installing || reg.waiting;
          if (!sw) return resolve();
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated") resolve();
          });
        });
      }
      const ready = await navigator.serviceWorker.ready;
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      await saveFn({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }, [saveFn]);

  const disable = useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        try {
          await deleteFn({ data: { endpoint: sub.endpoint } });
        } catch (_e) {
          /* ignore */
        }
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [deleteFn]);

  return {
    supported: permission !== "unsupported",
    permission,
    subscribed,
    busy,
    enable,
    disable,
    refresh,
    isPreview: isPreviewHost(),
  };
}

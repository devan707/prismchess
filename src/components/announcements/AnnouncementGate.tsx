import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  getNextUnseenAnnouncement,
  markAnnouncementRead,
  markWelcomed,
} from "@/lib/announcements.functions";
import { WelcomeModal } from "./WelcomeModal";
import { AnnouncementModal, type AnnouncementForModal } from "./AnnouncementModal";

const SESSION_SNOOZE_KEY = "pc:annSnooze";

export function AnnouncementGate() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchNext = useServerFn(getNextUnseenAnnouncement);
  const markRead = useServerFn(markAnnouncementRead);
  const setWelcomed = useServerFn(markWelcomed);

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [ann, setAnn] = useState<AnnouncementForModal | null>(null);

  useEffect(() => {
    if (pathname === "/onboarding" || pathname.startsWith("/auth")) return;
    if (sessionStorage.getItem(SESSION_SNOOZE_KEY) === "1") return;
    let cancelled = false;
    fetchNext({})
      .then((r) => {
        if (cancelled) return;
        if (!r.welcomed) {
          setWelcomeOpen(true);
        } else if (r.announcement) {
          setAnn(r.announcement as AnnouncementForModal);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissWelcome = () => {
    setWelcomeOpen(false);
    sessionStorage.setItem(SESSION_SNOOZE_KEY, "1");
    setWelcomed({}).catch(() => {});
  };

  const dismissAnn = () => {
    const current = ann;
    setAnn(null);
    sessionStorage.setItem(SESSION_SNOOZE_KEY, "1");
    if (current) markRead({ data: { id: current.id } }).catch(() => {});
  };

  return (
    <>
      <WelcomeModal open={welcomeOpen} onDismiss={dismissWelcome} />
      {ann && <AnnouncementModal announcement={ann} open={!welcomeOpen && !!ann} onDismiss={dismissAnn} />}
    </>
  );
}

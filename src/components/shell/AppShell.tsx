import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { BottomTabs } from "./BottomTabs";
import logoUrl from "@/assets/logo.png";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  showPlayCta?: boolean;
  showTopBar?: boolean;
}

export function AppShell({ children, showPlayCta = false, showTopBar = true }: AppShellProps) {
  return (
    <div className="prism-aura min-h-screen text-foreground">
      <div className="prism-aura-bg" aria-hidden />
      {showTopBar && (
        <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/60 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-3 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <img src={logoUrl} alt="Prism Chess" width={44} height={44} className="h-11 w-11" />
              <span className="font-display font-bold text-lg tracking-[0.22em] uppercase text-foreground">
                Prism Chess
              </span>
            </Link>
            <UserMenu />
          </div>
        </header>
      )}

      <main className={`max-w-3xl mx-auto px-3 sm:px-4 pt-3 ${showPlayCta ? "pb-40" : "pb-24"}`}>
        {children}
      </main>

      {showPlayCta && (
        <div className="fixed left-0 right-0 bottom-14 z-30 pointer-events-none">
          <div className="max-w-3xl mx-auto px-0 sm:px-4 pointer-events-auto">
            <Link
              to="/lobby"
              className="prism-border prism-border-hover flex h-14 items-center justify-center gap-2 font-display font-bold text-base tracking-[0.22em] uppercase shadow-lg shadow-black/20 sm:rounded-sm"
            >
              <Play className="h-5 w-5 fill-current" />
              Play
            </Link>
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}

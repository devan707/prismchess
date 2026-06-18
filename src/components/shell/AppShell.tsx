import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/UserMenu";
import { BottomTabs } from "./BottomTabs";
import logoUrl from "@/assets/logo.png";
import type { ReactNode } from "react";

function PrismPlayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="prismPlayGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.13 25)" />
          <stop offset="25%" stopColor="oklch(0.82 0.12 70)" />
          <stop offset="50%" stopColor="oklch(0.84 0.11 150)" />
          <stop offset="75%" stopColor="oklch(0.80 0.12 230)" />
          <stop offset="100%" stopColor="oklch(0.78 0.13 320)" />
        </linearGradient>
      </defs>
      <path d="M8 5v14l11-7z" fill="url(#prismPlayGrad)" />
    </svg>
  );
}

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
              <span className="flex flex-col leading-tight">
                <span className="font-display font-bold text-lg tracking-[0.22em] uppercase text-foreground">
                  Prism Chess
                </span>
                <span className="font-display text-[10px] tracking-[0.28em] uppercase text-foreground/55">
                  Design your own chess
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <AdminBadge />
              <UserMenu />
            </div>
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
              className="prism-border prism-border-hover flex h-14 items-center justify-center gap-2 shadow-lg shadow-black/20 sm:rounded-sm"
            >
              <PrismPlayIcon className="h-6 w-6" />
              <span className="font-display font-bold text-base tracking-[0.22em] uppercase text-white">
                Play
              </span>
            </Link>
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}

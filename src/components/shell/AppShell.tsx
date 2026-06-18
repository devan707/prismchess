import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { BottomTabs } from "./BottomTabs";
import logoUrl from "@/assets/logo.png";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  /** Show the sticky big Play CTA above the bottom nav (Home + Discover) */
  showPlayCta?: boolean;
  /** Show top bar (defaults true). Set false for screens that have their own header. */
  showTopBar?: boolean;
}

export function AppShell({ children, showPlayCta = false, showTopBar = true }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {showTopBar && (
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="max-w-3xl mx-auto px-3 h-12 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 group">
              <img src={logoUrl} alt="Prism Chess" width={28} height={28} className="h-7 w-7" />
              <span className="font-display font-semibold text-sm tracking-tight hidden xs:inline">
                Prism <span className="text-primary">Chess</span>
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
          <div className="max-w-3xl mx-auto px-4 pointer-events-auto">
            <Link to="/lobby" className="block">
              <Button
                size="lg"
                className="w-full h-14 text-base font-bold shadow-lg shadow-primary/20"
              >
                <Play className="h-5 w-5 mr-2 fill-current" />
                Play
              </Button>
            </Link>
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { Home, Swords, Hammer, Compass, Menu } from "lucide-react";

const TABS = [
  { to: "/" as const, label: "Home", icon: Home },
  { to: "/lobby" as const, label: "Play", icon: Swords },
  { to: "/create" as const, label: "Create", icon: Hammer },
  { to: "/discover" as const, label: "Discover", icon: Compass },
  { to: "/more" as const, label: "More", icon: Menu },
];

export function BottomTabs() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-background/70 backdrop-blur-xl">
      <div className="max-w-3xl mx-auto grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="group flex flex-col items-center justify-center py-2.5 gap-0.5 text-muted-foreground data-[status=active]:text-primary transition-colors"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold tracking-wide">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

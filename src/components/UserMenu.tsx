import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogIn, User as UserIcon, LogOut, MessagesSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function UserMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!email) {
    return (
      <Link to="/auth">
        <Button size="sm" variant="outline" className="gap-2">
          <LogIn className="h-4 w-4" /> Sign in
        </Button>
      </Link>
    );
  }

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <UserIcon className="h-4 w-4" />
          <span className="hidden sm:inline max-w-[10ch] truncate">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100]">
        <DropdownMenuLabel className="truncate max-w-[16rem]">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
          <UserIcon className="h-4 w-4 mr-2" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/forum" })}>
          <MessagesSquare className="h-4 w-4 mr-2" /> Community
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/messages/")({
  component: () => (
    <div className="hidden md:flex h-full items-center justify-center text-sm text-muted-foreground p-8 text-center">
      Pick a conversation to start chatting.
    </div>
  ),
});

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/multiplayer")({
  head: () => ({
    meta: [
      { title: "Multiplayer — Prism Chess" },
      { name: "description", content: "Play Prism Chess against other people. Open challenges, custom variants, real-time clocks." },
    ],
  }),
  component: () => <Outlet />,
});

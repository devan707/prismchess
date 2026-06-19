## Update Welcome DM Message

Replace the hardcoded welcome DM body in the `handle_new_user()` trigger function with the new message provided by the user.

### Changes
1. **New migration**: Recreate `public.handle_new_user()` with the updated `welcome_body` text. The new message introduces Prism Chess, explains the early community vibe, outlines current features (AI play, friend challenges, custom pieces/variants), invites the user to the forum, offers a direct line for bugs/ideas, and signs off from Devan / "Random Reason".
2. **No other changes required** — the trigger, RLS policies, and founder logic remain exactly the same.
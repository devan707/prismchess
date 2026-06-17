
-- 1. Promote devan to admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('035eb47e-13fd-4abd-8658-9ad7709cd3c6', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Extend forum_topics with shared design + featured/pinned
ALTER TABLE public.forum_topics
  ADD COLUMN IF NOT EXISTS shared_design jsonb,
  ADD COLUMN IF NOT EXISTS shared_design_name text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- 3. Restrict topic creation to admins/moderators
DROP POLICY IF EXISTS topics_insert_own ON public.forum_topics;
CREATE POLICY topics_insert_admin ON public.forum_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  );

-- 4. Topic suggestions table (anyone authenticated can create their own)
CREATE TABLE IF NOT EXISTS public.topic_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  shared_design jsonb,
  shared_design_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_suggestions TO authenticated;
GRANT ALL ON public.topic_suggestions TO service_role;
ALTER TABLE public.topic_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY suggestions_insert_own ON public.topic_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (suggester_id = auth.uid());
CREATE POLICY suggestions_read_own_or_admin ON public.topic_suggestions
  FOR SELECT TO authenticated
  USING (suggester_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY suggestions_update_admin ON public.topic_suggestions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY suggestions_delete_own_or_admin ON public.topic_suggestions
  FOR DELETE TO authenticated
  USING (suggester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 5. Seed starter topics (authored by admin devan)
INSERT INTO public.forum_topics (title, body, author_id, is_featured, is_pinned)
SELECT '👑 Welcome to Kingdom Chess',
  E'Welcome, challenger.\n\nThis is the community hub for Kingdom Chess. Use it to share variant designs, swap strategy, and report bugs.\n\nA few starter threads:\n• Featured Game — spotlighted variants chosen by the admins.\n• Share Your Custom Games — post your sandbox creations and let others play them.\n\nHave fun, and long live the king!',
  '035eb47e-13fd-4abd-8658-9ad7709cd3c6',
  false, true
WHERE NOT EXISTS (SELECT 1 FROM public.forum_topics WHERE title = '👑 Welcome to Kingdom Chess');

INSERT INTO public.forum_topics (title, body, author_id, is_featured, is_pinned)
SELECT '⭐ Featured Game: Grand Menagerie',
  E'This month''s featured game is **Grand Menagerie** — a 12×12 showcase of every custom piece in Kingdom Chess. Juggernauts anchor the wings, shapeshifter pawns lead the charge, and dragons + archers add bite to the middle game.\n\nLoad it from the home screen and try it against the AI. Share your favorite moments below!\n\n*As more players submit their own designs, we''ll cycle new ones into the spotlight.*',
  '035eb47e-13fd-4abd-8658-9ad7709cd3c6',
  true, true
WHERE NOT EXISTS (SELECT 1 FROM public.forum_topics WHERE title LIKE '%Featured Game: Grand Menagerie%');

INSERT INTO public.forum_topics (title, body, author_id, is_pinned)
SELECT '🎨 Share Your Custom Games',
  E'Built something wild in the sandbox? Post it here!\n\nUse the **Share** button on the play screen to attach your design — other players will be able to load it with one tap. The most interesting submissions may be promoted to the Featured Game spotlight.',
  '035eb47e-13fd-4abd-8658-9ad7709cd3c6',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.forum_topics WHERE title = '🎨 Share Your Custom Games');

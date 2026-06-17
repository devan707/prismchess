
-- ============ FRIENDSHIPS ============
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT friendships_canonical_order CHECK (user_a < user_b)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Friends view own friendships" ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Friends insert own requests" ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND (auth.uid() = user_a OR auth.uid() = user_b));
CREATE POLICY "Friends update own" ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Friends delete own" ON public.friendships FOR DELETE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE TRIGGER friendships_set_updated_at BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX friendships_user_a_idx ON public.friendships(user_a);
CREATE INDEX friendships_user_b_idx ON public.friendships(user_b);

-- ============ BLOCKS ============
CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocks_pair_unique UNIQUE (blocker_id, blocked_id),
  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Blocks view own" ON public.blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY "Blocks insert own" ON public.blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "Blocks delete own" ON public.blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());
CREATE INDEX blocks_blocker_idx ON public.blocks(blocker_id);
CREATE INDEX blocks_blocked_idx ON public.blocks(blocked_id);

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((user_a = LEAST(_a,_b) AND user_b = GREATEST(_a,_b)))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_blocked_either(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  )
$$;

CREATE OR REPLACE FUNCTION public.share_active_match(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.status IN ('open','active')
      AND ((m.host_id = _a AND m.guest_id = _b) OR (m.host_id = _b AND m.guest_id = _a))
  )
$$;

-- ============ DM THREADS / MESSAGES ============
CREATE TABLE public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_threads_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT dm_threads_canonical_order CHECK (user_a < user_b)
);
GRANT SELECT, INSERT, UPDATE ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DM threads view own" ON public.dm_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "DM threads insert own" ON public.dm_threads FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_a OR auth.uid() = user_b)
    AND NOT public.is_blocked_either(user_a, user_b)
    AND (public.are_friends(user_a, user_b) OR public.share_active_match(user_a, user_b)));
CREATE POLICY "DM threads update own" ON public.dm_threads FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
CREATE INDEX dm_threads_user_a_idx ON public.dm_threads(user_a, last_message_at DESC);
CREATE INDEX dm_threads_user_b_idx ON public.dm_threads(user_b, last_message_at DESC);

CREATE TABLE public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.dm_messages TO authenticated;
GRANT ALL ON public.dm_messages TO service_role;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DM msgs view participants" ON public.dm_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dm_threads t WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())));
CREATE POLICY "DM msgs insert as sender" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id
        AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
        AND NOT public.is_blocked_either(t.user_a, t.user_b)
        AND (public.are_friends(t.user_a, t.user_b) OR public.share_active_match(t.user_a, t.user_b))
    )
  );
CREATE POLICY "DM msgs update read" ON public.dm_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dm_threads t WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dm_threads t WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())));
CREATE INDEX dm_messages_thread_idx ON public.dm_messages(thread_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.bump_dm_thread()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.dm_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END $$;
CREATE TRIGGER dm_messages_bump AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_dm_thread();

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

-- ============ MATCH CHAT ============
CREATE TABLE public.match_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.match_chat_messages TO authenticated;
GRANT ALL ON public.match_chat_messages TO service_role;
ALTER TABLE public.match_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Match chat view participants" ON public.match_chat_messages FOR SELECT TO authenticated
  USING (public.is_match_participant(match_id, auth.uid()));
CREATE POLICY "Match chat insert as participant" ON public.match_chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_match_participant(match_id, auth.uid()));
CREATE INDEX match_chat_match_idx ON public.match_chat_messages(match_id, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_chat_messages;

-- ============ PUBLISHED GAMES ============
CREATE TABLE public.published_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  design jsonb NOT NULL,
  tutorial jsonb,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.published_games TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.published_games TO authenticated;
GRANT ALL ON public.published_games TO service_role;
ALTER TABLE public.published_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published games public read" ON public.published_games FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Published games author insert" ON public.published_games FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "Published games author update" ON public.published_games FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Published games author delete" ON public.published_games FOR DELETE TO authenticated USING (author_id = auth.uid());
CREATE TRIGGER published_games_set_updated_at BEFORE UPDATE ON public.published_games
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX published_games_author_idx ON public.published_games(author_id, created_at DESC);
CREATE INDEX published_games_recent_idx ON public.published_games(created_at DESC);

-- ============ GAME LIKES ============
CREATE TABLE public.game_likes (
  game_id uuid NOT NULL REFERENCES public.published_games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);
GRANT SELECT ON public.game_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.game_likes TO authenticated;
GRANT ALL ON public.game_likes TO service_role;
ALTER TABLE public.game_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game likes public read" ON public.game_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Game likes insert own" ON public.game_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Game likes delete own" ON public.game_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_game_like_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.published_games SET like_count = like_count + 1 WHERE id = NEW.game_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.published_games SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.game_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER game_likes_bump AFTER INSERT OR DELETE ON public.game_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_game_like_count();

-- ============ GAME COMMENTS ============
CREATE TABLE public.game_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.published_games(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.game_comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_comments TO authenticated;
GRANT ALL ON public.game_comments TO service_role;
ALTER TABLE public.game_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game comments public read" ON public.game_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Game comments insert own" ON public.game_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "Game comments update own" ON public.game_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Game comments delete own" ON public.game_comments FOR DELETE TO authenticated USING (author_id = auth.uid());
CREATE TRIGGER game_comments_set_updated_at BEFORE UPDATE ON public.game_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX game_comments_game_idx ON public.game_comments(game_id, created_at DESC);
CREATE INDEX game_comments_parent_idx ON public.game_comments(parent_id);

CREATE OR REPLACE FUNCTION public.bump_game_comment_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.published_games SET comment_count = comment_count + 1 WHERE id = NEW.game_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.published_games SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.game_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER game_comments_bump AFTER INSERT OR DELETE ON public.game_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_game_comment_count();
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_comments;

-- ============ REPORTS ============
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user','dm_message','match_message','comment','game')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports view own" ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY "Reports view as admin" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Reports insert own" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE INDEX reports_reporter_idx ON public.reports(reporter_id, created_at DESC);
CREATE INDEX reports_target_idx ON public.reports(target_type, target_id);

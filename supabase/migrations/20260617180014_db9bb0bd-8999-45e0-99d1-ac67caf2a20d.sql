
-- ============ MATCHES ============
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  design jsonb NOT NULL,
  design_name text NOT NULL DEFAULT 'Custom game',
  time_control text NOT NULL CHECK (time_control IN ('10min','30min','3day')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','finished','aborted')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','link')),
  host_color text NOT NULL DEFAULT 'w' CHECK (host_color IN ('w','b')),
  turn text NOT NULL DEFAULT 'w' CHECK (turn IN ('w','b')),
  white_time_ms bigint NOT NULL,
  black_time_ms bigint NOT NULL,
  last_clock_update_at timestamptz,
  result text CHECK (result IN ('w','b','draw')),
  result_reason text CHECK (result_reason IN ('checkmate','resign','timeout','draw_agreed','royal_loss','stalemate','aborted')),
  rated boolean NOT NULL DEFAULT false,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'base64'),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can see open public challenges
CREATE POLICY "View open public challenges"
  ON public.matches FOR SELECT TO authenticated
  USING (status = 'open' AND visibility = 'public');

-- Host or guest can see their own matches at any status (including link-only)
CREATE POLICY "Players view their own matches"
  ON public.matches FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR guest_id = auth.uid());

-- Allow anyone signed in to view a match by its share token — needed for the
-- invite-link landing page before becoming guest. Token is unguessable.
-- We can't filter on a param, so allow SELECT when status='open' for link
-- visibility too (the token in the URL is the actual gatekeeper).
CREATE POLICY "View open link challenges"
  ON public.matches FOR SELECT TO authenticated
  USING (status = 'open' AND visibility = 'link');

CREATE POLICY "Host creates own match"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "Players update their own matches"
  ON public.matches FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR guest_id = auth.uid())
  WITH CHECK (host_id = auth.uid() OR guest_id = auth.uid());

CREATE POLICY "Host deletes own open match"
  ON public.matches FOR DELETE TO authenticated
  USING (host_id = auth.uid() AND status = 'open');

CREATE INDEX matches_lobby_idx ON public.matches (status, visibility, created_at DESC);
CREATE INDEX matches_host_idx ON public.matches (host_id, created_at DESC);
CREATE INDEX matches_guest_idx ON public.matches (guest_id, created_at DESC);
CREATE INDEX matches_share_token_idx ON public.matches (share_token);

CREATE TRIGGER matches_set_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MATCH MOVES ============
CREATE TABLE public.match_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  ply integer NOT NULL,
  move jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time_left_ms bigint NOT NULL,
  played_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, ply)
);

GRANT SELECT, INSERT ON public.match_moves TO authenticated;
GRANT ALL ON public.match_moves TO service_role;

ALTER TABLE public.match_moves ENABLE ROW LEVEL SECURITY;

-- Helper: is the user a participant in this match?
CREATE OR REPLACE FUNCTION public.is_match_participant(_match_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = _match_id
      AND (m.host_id = _user_id OR m.guest_id = _user_id)
  );
$$;

CREATE POLICY "Participants view match moves"
  ON public.match_moves FOR SELECT TO authenticated
  USING (public.is_match_participant(match_id, auth.uid()));

CREATE POLICY "Participants insert match moves"
  ON public.match_moves FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.is_match_participant(match_id, auth.uid())
  );

CREATE INDEX match_moves_match_ply_idx ON public.match_moves (match_id, ply);

-- ============ MATCH EVENTS ============
CREATE TABLE public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('draw_offer','draw_decline','draw_accept','takeback_request','takeback_decline','takeback_accept','resign','chat','system')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.match_events TO authenticated;
GRANT ALL ON public.match_events TO service_role;

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view match events"
  ON public.match_events FOR SELECT TO authenticated
  USING (public.is_match_participant(match_id, auth.uid()));

CREATE POLICY "Participants insert match events"
  ON public.match_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.is_match_participant(match_id, auth.uid())
  );

CREATE INDEX match_events_match_idx ON public.match_events (match_id, created_at);

-- ============ RATINGS (scaffold) ============
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  design_family text NOT NULL DEFAULT 'classic',
  rating integer NOT NULL DEFAULT 1200,
  games_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, design_family)
);

GRANT SELECT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view ratings"
  ON public.ratings FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER ratings_set_updated_at
  BEFORE UPDATE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;

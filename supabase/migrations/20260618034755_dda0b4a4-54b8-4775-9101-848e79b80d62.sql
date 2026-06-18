
CREATE TABLE public.variant_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plays integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_key, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.variant_plays TO authenticated;
GRANT ALL ON public.variant_plays TO service_role;

ALTER TABLE public.variant_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all variant plays"
  ON public.variant_plays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own variant plays"
  ON public.variant_plays FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own variant plays"
  ON public.variant_plays FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX variant_plays_variant_key_idx ON public.variant_plays (variant_key);

CREATE VIEW public.variant_play_stats
  WITH (security_invoker = true)
  AS
  SELECT
    variant_key,
    COUNT(DISTINCT user_id)::int AS unique_players,
    COALESCE(SUM(plays), 0)::int AS total_plays
  FROM public.variant_plays
  GROUP BY variant_key;

GRANT SELECT ON public.variant_play_stats TO anon, authenticated;

-- Allow anon to also read raw rows so the security_invoker view returns data
-- for unauthenticated landing-page visitors. Only the aggregated view is used
-- on the client; raw rows contain no PII beyond a user_id + play count.
CREATE POLICY "Anyone can read variant plays for aggregate stats"
  ON public.variant_plays FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.variant_plays TO anon;

CREATE TRIGGER variant_plays_set_updated_at
  BEFORE UPDATE ON public.variant_plays
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

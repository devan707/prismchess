
CREATE TABLE public.solo_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  design_name TEXT NOT NULL,
  design JSONB NOT NULL,
  difficulty TEXT NOT NULL,
  human_color TEXT NOT NULL CHECK (human_color IN ('w','b')),
  result TEXT NOT NULL CHECK (result IN ('w','b','draw')),
  result_reason TEXT NOT NULL,
  moves JSONB NOT NULL DEFAULT '[]'::jsonb,
  ply_count INT NOT NULL DEFAULT 0,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solo_games TO authenticated;
GRANT ALL ON public.solo_games TO service_role;

ALTER TABLE public.solo_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own solo games"
  ON public.solo_games FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own solo games"
  ON public.solo_games FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own solo games"
  ON public.solo_games FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX solo_games_user_idx ON public.solo_games (user_id, ended_at DESC);


CREATE TABLE public.ai_training_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id text not null,
  difficulty text not null,
  result text not null check (result in ('ai_win','ai_loss','draw')),
  ai_color text not null check (ai_color in ('w','b')),
  move_count int not null default 0,
  moves jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.ai_training_games TO authenticated;
GRANT ALL ON public.ai_training_games TO service_role;
ALTER TABLE public.ai_training_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own training games" ON public.ai_training_games
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own training games" ON public.ai_training_games
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ai_training_games_variant_idx ON public.ai_training_games(variant_id, created_at DESC);

CREATE TABLE public.ai_playbook_stats (
  variant_id text primary key,
  games int not null default 0,
  ai_wins int not null default 0,
  ai_losses int not null default 0,
  ai_draws int not null default 0,
  piece_trade_outcomes jsonb not null default '{}'::jsonb,
  opening_book jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.ai_playbook_stats TO anon, authenticated;
GRANT ALL ON public.ai_playbook_stats TO service_role;
ALTER TABLE public.ai_playbook_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read playbook stats" ON public.ai_playbook_stats
  FOR SELECT TO anon, authenticated USING (true);

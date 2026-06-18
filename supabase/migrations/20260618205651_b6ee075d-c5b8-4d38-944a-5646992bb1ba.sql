
ALTER TABLE public.custom_pieces
  ADD COLUMN IF NOT EXISTS remixed_from_id uuid NULL REFERENCES public.custom_pieces(id) ON DELETE SET NULL;

ALTER TABLE public.published_games
  ADD COLUMN IF NOT EXISTS remixed_from_id uuid NULL REFERENCES public.published_games(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS custom_pieces_remixed_from_idx ON public.custom_pieces (remixed_from_id);
CREATE INDEX IF NOT EXISTS published_games_remixed_from_idx ON public.published_games (remixed_from_id);


CREATE TABLE public.custom_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  def jsonb NOT NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  like_count integer NOT NULL DEFAULT 0,
  play_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_pieces TO authenticated;
GRANT SELECT ON public.custom_pieces TO anon;
GRANT ALL ON public.custom_pieces TO service_role;
ALTER TABLE public.custom_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public pieces are viewable by everyone"
  ON public.custom_pieces FOR SELECT
  USING (visibility = 'public' OR author_id = auth.uid());

CREATE POLICY "Authors can insert their own pieces"
  ON public.custom_pieces FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update their own pieces"
  ON public.custom_pieces FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete their own pieces"
  ON public.custom_pieces FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE TRIGGER custom_pieces_set_updated_at
  BEFORE UPDATE ON public.custom_pieces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX custom_pieces_public_recent_idx
  ON public.custom_pieces (created_at DESC) WHERE visibility = 'public';
CREATE INDEX custom_pieces_public_popular_idx
  ON public.custom_pieces (like_count DESC) WHERE visibility = 'public';
CREATE INDEX custom_pieces_author_idx ON public.custom_pieces (author_id);

CREATE TABLE public.piece_likes (
  piece_id uuid NOT NULL REFERENCES public.custom_pieces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (piece_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.piece_likes TO authenticated;
GRANT ALL ON public.piece_likes TO service_role;
ALTER TABLE public.piece_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
  ON public.piece_likes FOR SELECT USING (true);
CREATE POLICY "Users can like pieces"
  ON public.piece_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unlike their own likes"
  ON public.piece_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_piece_like_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.custom_pieces SET like_count = like_count + 1 WHERE id = NEW.piece_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.custom_pieces SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.piece_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER piece_likes_bump
  AFTER INSERT OR DELETE ON public.piece_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_piece_like_count();

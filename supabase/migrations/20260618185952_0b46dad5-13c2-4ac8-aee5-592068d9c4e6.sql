
CREATE TABLE public.piece_ability_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.custom_pieces(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX piece_ability_requests_status_idx ON public.piece_ability_requests(status, created_at DESC);
CREATE INDEX piece_ability_requests_author_idx ON public.piece_ability_requests(author_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.piece_ability_requests TO authenticated;
GRANT ALL ON public.piece_ability_requests TO service_role;

ALTER TABLE public.piece_ability_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authors can read own requests"
  ON public.piece_ability_requests FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE POLICY "authors can insert own requests"
  ON public.piece_ability_requests FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "admins can update requests"
  ON public.piece_ability_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE TRIGGER piece_ability_requests_set_updated_at
  BEFORE UPDATE ON public.piece_ability_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

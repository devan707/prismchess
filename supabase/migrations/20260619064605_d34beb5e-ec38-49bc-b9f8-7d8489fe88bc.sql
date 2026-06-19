
-- 1) Remove client-direct INSERT policies on match_moves / match_events.
--    All inserts now happen via server functions using supabaseAdmin.
DROP POLICY IF EXISTS "Participants insert match moves" ON public.match_moves;
DROP POLICY IF EXISTS "Participants insert match events" ON public.match_events;

-- 2) Storage SELECT policy for the private piece-images bucket.
--    Owners can read their own files; anyone can read images belonging to a
--    public custom piece.
DROP POLICY IF EXISTS piece_images_select_own ON storage.objects;
CREATE POLICY piece_images_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'piece-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS piece_images_select_public ON storage.objects;
CREATE POLICY piece_images_select_public ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'piece-images'
    AND EXISTS (
      SELECT 1 FROM public.custom_pieces cp
      WHERE cp.image_path = storage.objects.name
        AND cp.visibility = 'public'
        AND cp.is_hidden = false
    )
  );

-- 3) Lock down realtime broadcast/presence channels.
--    The app only uses postgres_changes, which is governed by the source
--    tables' own RLS. Enabling RLS on realtime.messages with no policies
--    denies all broadcast/presence traffic so attackers can't subscribe to
--    private match or DM topics through that surface.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

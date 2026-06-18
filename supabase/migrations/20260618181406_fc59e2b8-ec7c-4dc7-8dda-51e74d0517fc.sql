
-- custom_pieces: image storage path + cached public proxy URL
ALTER TABLE public.custom_pieces ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.custom_pieces ADD COLUMN IF NOT EXISTS image_url text;

-- forum_topics: optional piece reference for showcases/discussions
ALTER TABLE public.forum_topics
  ADD COLUMN IF NOT EXISTS shared_piece_id uuid REFERENCES public.custom_pieces(id) ON DELETE SET NULL;
ALTER TABLE public.forum_topics
  ADD COLUMN IF NOT EXISTS is_showcase boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS forum_topics_showcase_idx
  ON public.forum_topics (last_activity_at DESC) WHERE is_showcase = true;
CREATE INDEX IF NOT EXISTS forum_topics_shared_piece_idx
  ON public.forum_topics (shared_piece_id) WHERE shared_piece_id IS NOT NULL;

-- Allow signed-in users to create showcase topics (existing policy already
-- allows author_id = auth.uid() on insert, so this is unchanged — the
-- admin-only restriction lives in the createTopic server fn, not RLS).

-- ====== STORAGE: piece-images bucket policies ======
-- Bucket is private; reads go through the /api/public/piece-img proxy
-- (uses service role server-side). Writes are scoped to authenticated users
-- and limited to their own folder by user id.

DROP POLICY IF EXISTS "piece_images_insert_own" ON storage.objects;
CREATE POLICY "piece_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'piece-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "piece_images_update_own" ON storage.objects;
CREATE POLICY "piece_images_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'piece-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'piece-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "piece_images_delete_own" ON storage.objects;
CREATE POLICY "piece_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'piece-images' AND (storage.foldername(name))[1] = auth.uid()::text);

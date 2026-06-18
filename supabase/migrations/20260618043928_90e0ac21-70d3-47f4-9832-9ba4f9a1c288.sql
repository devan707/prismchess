-- piece_likes: require auth to read
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.piece_likes;
CREATE POLICY "Authenticated users can view piece likes"
  ON public.piece_likes FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.piece_likes FROM anon;

-- variant_plays: require auth to read
DROP POLICY IF EXISTS "Anyone can read variant plays for aggregate stats" ON public.variant_plays;
DROP POLICY IF EXISTS "Users can read all variant plays" ON public.variant_plays;
CREATE POLICY "Authenticated users can read variant plays"
  ON public.variant_plays FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.variant_plays FROM anon;

-- user_roles: explicit restrictive deny for non-admin inserts/updates/deletes
CREATE POLICY "Only admins can write user_roles"
  ON public.user_roles AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
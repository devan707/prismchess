DROP POLICY IF EXISTS "Friends update own" ON public.friendships;
CREATE POLICY "Friends update own" ON public.friendships
  FOR UPDATE
  USING ((auth.uid() = user_a) OR (auth.uid() = user_b))
  WITH CHECK (
    ((auth.uid() = user_a) OR (auth.uid() = user_b))
    AND requested_by IS NOT NULL
    AND requested_by <> auth.uid()
  );

DROP POLICY IF EXISTS "Anyone signed in can join an open match" ON public.matches;
DROP POLICY IF EXISTS "Players update their own matches" ON public.matches;
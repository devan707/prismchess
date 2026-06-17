
CREATE POLICY "Anyone signed in can join an open match"
  ON public.matches FOR UPDATE TO authenticated
  USING (status = 'open' AND guest_id IS NULL AND host_id <> auth.uid())
  WITH CHECK (guest_id = auth.uid() AND status IN ('open','active'));

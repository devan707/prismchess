
-- 1) Founder flag on profiles (only one allowed)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_only_one_founder ON public.profiles ((1)) WHERE is_founder = true;

-- 2) Relax DM RLS so admins/mods can DM anyone
DROP POLICY IF EXISTS "DM threads insert own" ON public.dm_threads;
CREATE POLICY "DM threads insert own" ON public.dm_threads FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_a OR auth.uid() = user_b)
    AND NOT public.is_blocked_either(user_a, user_b)
    AND (
      public.are_friends(user_a, user_b)
      OR public.share_active_match(user_a, user_b)
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'moderator')
    )
  );

DROP POLICY IF EXISTS "DM msgs insert as sender" ON public.dm_messages;
CREATE POLICY "DM msgs insert as sender" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id
        AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
        AND NOT public.is_blocked_either(t.user_a, t.user_b)
        AND (
          public.are_friends(t.user_a, t.user_b)
          OR public.share_active_match(t.user_a, t.user_b)
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'moderator')
        )
    )
  );

-- 3) Welcome DM from founder on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_name text;
  candidate text;
  suffix int := 0;
  founder_id uuid;
  a uuid;
  b uuid;
  thread_id uuid;
  welcome_body text := E'Hey, welcome to Prism Chess! 👋\n\nI''m so glad you''re here. We''re still an emerging community, and every early player like you helps shape what this becomes — so seriously, thank you for showing up and supporting us.\n\nA few things:\n• Your membership is **free for life** as an early player. That''s our thank-you for being here while we''re small.\n• If you hit a bug, have an idea, or just want to talk variants — reply right here. It comes straight to me.\n• If you end up loving Prism Chess, share it with a friend. Word of mouth is how this place grows.\n\nHave fun out there. ♟️';
BEGIN
  base_name := lower(regexp_replace(coalesce(split_part(NEW.email, '@', 1), 'player'), '[^a-z0-9_]', '', 'g'));
  IF base_name IS NULL OR length(base_name) < 3 THEN
    base_name := 'player';
  END IF;
  candidate := base_name;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    suffix := suffix + 1;
    candidate := base_name || suffix::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, candidate, coalesce(NEW.raw_user_meta_data->>'full_name', candidate));

  -- Send welcome DM from founder, if one is configured and isn't the new user.
  SELECT id INTO founder_id FROM public.profiles WHERE is_founder = true LIMIT 1;
  IF founder_id IS NOT NULL AND founder_id <> NEW.id THEN
    IF founder_id < NEW.id THEN
      a := founder_id; b := NEW.id;
    ELSE
      a := NEW.id; b := founder_id;
    END IF;
    INSERT INTO public.dm_threads (user_a, user_b)
    VALUES (a, b)
    ON CONFLICT (user_a, user_b) DO UPDATE SET last_message_at = now()
    RETURNING id INTO thread_id;
    INSERT INTO public.dm_messages (thread_id, sender_id, body)
    VALUES (thread_id, founder_id, welcome_body);
  END IF;

  RETURN NEW;
END;
$$;

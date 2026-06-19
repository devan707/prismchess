CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  base_name text;
  candidate text;
  suffix int := 0;
  founder_id uuid;
  a uuid;
  b uuid;
  thread_id uuid;
  welcome_body text := $body$Hey, welcome to Prism Chess.

Thanks for being one of the first people here.

This is still a very small community, and honestly that's part of what makes it exciting. You're getting in early while the game, the variants, and the community are still taking shape.

Prism Chess started from a simple idea: chess is fun, but it's also fun to invent new pieces, new rules, and entirely new ways to play. I wanted a place where people could create their own variants, test crazy ideas, and discover games that don't exist anywhere else.

For now, you can play against the AI, challenge friends, create custom pieces, and design your own variants.

If you get a chance, stop by the community forum and introduce yourself. I'd love to hear what brought you here and what kinds of games or pieces you'd like to create.

If you run into bugs, have ideas, or just want to chat about the project, reply to this message. It comes directly to me.

My name is Devan, but around here I go by Random Reason.

Welcome aboard. ♟️$body$;
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
$fn$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a placeholder profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_name text;
  candidate text;
  suffix int := 0;
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
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ USER ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_read_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ FORUM TOPICS ============
CREATE TABLE public.forum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 140),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  reply_count int NOT NULL DEFAULT 0,
  like_count int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_topics TO authenticated;
GRANT ALL ON public.forum_topics TO service_role;
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics_read_authenticated" ON public.forum_topics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "topics_insert_own" ON public.forum_topics
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "topics_update_author_or_admin" ON public.forum_topics
  FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
    WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "topics_delete_author_or_admin" ON public.forum_topics
  FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX forum_topics_recent_idx ON public.forum_topics (last_activity_at DESC);

CREATE TRIGGER topics_set_updated_at BEFORE UPDATE ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FORUM REPLIES ============
CREATE TABLE public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  like_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_replies TO authenticated;
GRANT ALL ON public.forum_replies TO service_role;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replies_read_authenticated" ON public.forum_replies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "replies_insert_own" ON public.forum_replies
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "replies_update_author_or_admin" ON public.forum_replies
  FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
    WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "replies_delete_author_or_admin" ON public.forum_replies
  FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX forum_replies_topic_idx ON public.forum_replies (topic_id, created_at);
CREATE TRIGGER replies_set_updated_at BEFORE UPDATE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reply count + last_activity trigger
CREATE OR REPLACE FUNCTION public.bump_topic_on_reply()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_topics
      SET reply_count = reply_count + 1, last_activity_at = now()
      WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_topics
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER replies_bump_topic
  AFTER INSERT OR DELETE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.bump_topic_on_reply();

-- ============ FORUM LIKES ============
CREATE TABLE public.forum_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('topic', 'reply')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
GRANT SELECT, INSERT, DELETE ON public.forum_likes TO authenticated;
GRANT ALL ON public.forum_likes TO service_role;
ALTER TABLE public.forum_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes_read_authenticated" ON public.forum_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "likes_insert_own" ON public.forum_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "likes_delete_own" ON public.forum_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX forum_likes_target_idx ON public.forum_likes (target_type, target_id);

-- Like count trigger
CREATE OR REPLACE FUNCTION public.bump_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'topic' THEN
      UPDATE public.forum_topics SET like_count = like_count + 1 WHERE id = NEW.target_id;
    ELSE
      UPDATE public.forum_replies SET like_count = like_count + 1 WHERE id = NEW.target_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'topic' THEN
      UPDATE public.forum_topics SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.target_id;
    ELSE
      UPDATE public.forum_replies SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.target_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER likes_bump_count
  AFTER INSERT OR DELETE ON public.forum_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_like_count();

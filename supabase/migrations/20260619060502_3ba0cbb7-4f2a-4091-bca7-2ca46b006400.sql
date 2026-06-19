
-- Announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_href text,
  kind text NOT NULL DEFAULT 'general',
  pinned boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  forum_topic_id uuid REFERENCES public.forum_topics(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authed can read active announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods can insert announcements"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods can update announcements"
  ON public.announcements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods can delete announcements"
  ON public.announcements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reads tracking
CREATE TABLE public.announcement_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);
GRANT SELECT, INSERT, DELETE ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reads"
  ON public.announcement_reads FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Profile: welcomed_at
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;

-- Flag forum topics that are linked from an announcement (used for the badge in forum list).
ALTER TABLE public.forum_topics ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;

-- Seed initial welcome announcement (no forum topic yet; admin can backfill).
INSERT INTO public.announcements (title, body, kind, pinned, active)
VALUES (
  'We''re live — and you''re early.',
  'Prism Chess just opened its doors. Custom pieces, custom variants, AI play, and friend challenges are all here today. Jump into the forum, share what you build, and help steer where this goes next.',
  'welcome',
  true,
  true
);

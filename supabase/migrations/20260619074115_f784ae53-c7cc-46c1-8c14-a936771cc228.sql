-- 1. Profiles: replace broad SELECT policy with own-row policy + admin/mod read policy
DROP POLICY IF EXISTS "profiles_read_public_cols" ON public.profiles;

CREATE POLICY "profiles_read_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_admin_mod_read_all"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- 2. Safe public view exposing only non-sensitive columns
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
  WITH (security_invoker = false) AS
SELECT
  id,
  username,
  display_name,
  avatar,
  avatar_url,
  is_founder,
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- 3. Friendships: fix UPDATE policy applying to public role
DROP POLICY IF EXISTS "Friends update own" ON public.friendships;

CREATE POLICY "Friends update own"
  ON public.friendships
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_a) OR (auth.uid() = user_b))
  WITH CHECK (
    ((auth.uid() = user_a) OR (auth.uid() = user_b))
    AND (requested_by IS NOT NULL)
    AND (requested_by <> auth.uid())
  );
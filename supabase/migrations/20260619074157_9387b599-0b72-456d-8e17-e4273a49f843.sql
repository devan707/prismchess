-- Roll back the view-based approach
DROP VIEW IF EXISTS public.public_profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_mod_read_all" ON public.profiles;

-- Allow row visibility, then gate by column-level GRANTs
CREATE POLICY "profiles_read_public_cols"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Revoke blanket SELECT, then grant only the safe public columns
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, display_name, avatar, avatar_url, is_founder, created_at)
  ON public.profiles TO authenticated;
-- (anon keeps no SELECT; public profile views go through server functions)
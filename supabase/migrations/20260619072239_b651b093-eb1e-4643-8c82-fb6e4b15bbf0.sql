-- 1) Restrict profiles SELECT to public columns for non-owners; use SECURITY DEFINER RPCs for owner/admin reads.
DROP POLICY IF EXISTS "profiles_read_authenticated" ON public.profiles;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, display_name, avatar, avatar_url, is_founder, created_at)
  ON public.profiles TO authenticated;

CREATE POLICY "profiles_read_public_cols"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Owner reads full profile via this RPC (bypasses column-level grants).
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Admin/mod listing with sensitive fields (suspended_until).
CREATE OR REPLACE FUNCTION public.admin_list_users(_q text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  created_at timestamptz,
  suspended_until timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT p.id, p.username, p.display_name, p.created_at, p.suspended_until
    FROM public.profiles p
    WHERE _q IS NULL OR _q = ''
       OR p.username ILIKE '%' || _q || '%'
       OR p.display_name ILIKE '%' || _q || '%'
    ORDER BY p.created_at DESC
    LIMIT 100;
END
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users(text) TO authenticated;

-- 2) Hide unpublished games from public read; preserve author + admin/mod visibility.
DROP POLICY IF EXISTS "Published games public read" ON public.published_games;

CREATE POLICY "Published games public read visible"
  ON public.published_games FOR SELECT
  TO anon, authenticated
  USING (is_hidden = false);

CREATE POLICY "Published games author read own"
  ON public.published_games FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Published games admins read all"
  ON public.published_games FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

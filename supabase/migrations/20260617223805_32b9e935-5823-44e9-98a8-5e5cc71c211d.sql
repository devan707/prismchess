
-- Lock down SECURITY DEFINER helper functions: remove public/anon EXECUTE.
-- These functions are used inside RLS policies (authenticated callers) or as triggers.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_blocked_either(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_match_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.share_active_match(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_blocked_either(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_match_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.share_active_match(uuid, uuid) TO authenticated, service_role;

-- handle_new_user is fired by an auth trigger; no API callers need EXECUTE.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

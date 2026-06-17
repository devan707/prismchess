
REVOKE EXECUTE ON FUNCTION public.is_match_participant(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_match_participant(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_match_participant(uuid, uuid) FROM anon;

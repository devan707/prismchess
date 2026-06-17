
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_topic_on_reply() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_like_count() FROM PUBLIC, anon, authenticated;

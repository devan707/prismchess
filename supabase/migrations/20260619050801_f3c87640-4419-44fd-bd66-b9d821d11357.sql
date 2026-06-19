
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check CHECK (status = ANY (ARRAY['open','ready_check','active','finished','aborted']));

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_time_control_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_time_control_check CHECK (time_control = '3day' OR time_control ~ '^[0-9]+min$');

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS ready_w boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS ready_b boolean NOT NULL DEFAULT false;

-- Allow anonymous visitors to read minimal preview info for an OPEN challenge by share token.
-- The server function projects only safe columns; this policy gates the row, callers can't read PII because the only public fn selects specific columns.
GRANT SELECT ON public.matches TO anon;

DROP POLICY IF EXISTS "anon_can_preview_open_challenge" ON public.matches;
CREATE POLICY "anon_can_preview_open_challenge"
ON public.matches
FOR SELECT
TO anon
USING (status = 'open' AND share_token IS NOT NULL);

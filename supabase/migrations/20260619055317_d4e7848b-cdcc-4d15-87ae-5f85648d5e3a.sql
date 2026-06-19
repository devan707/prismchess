ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_version text,
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_version text,
  ADD COLUMN IF NOT EXISTS age_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_updates_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gameplay_notify_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS avatar_url text;
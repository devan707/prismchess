ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET onboarded = true WHERE created_at < now();
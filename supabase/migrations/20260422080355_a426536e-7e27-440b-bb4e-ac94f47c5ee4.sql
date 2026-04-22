
-- Add interview configuration to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS interview_duration integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS interview_type text NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium';

-- Lightweight validation via trigger (avoids CHECK constraint pitfalls)
CREATE OR REPLACE FUNCTION public.validate_job_interview_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.interview_duration NOT IN (15, 20, 30, 45, 60) THEN
    RAISE EXCEPTION 'interview_duration must be one of 15, 20, 30, 45, 60';
  END IF;
  IF NEW.interview_type NOT IN ('technical', 'hr', 'mixed') THEN
    RAISE EXCEPTION 'interview_type must be technical, hr, or mixed';
  END IF;
  IF NEW.difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'difficulty must be easy, medium, or hard';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_job_interview_config_trg ON public.jobs;
CREATE TRIGGER validate_job_interview_config_trg
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_job_interview_config();

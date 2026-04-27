CREATE OR REPLACE FUNCTION public.validate_job_interview_config()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.interview_duration NOT IN (1, 15, 20, 30, 45, 60) THEN
    RAISE EXCEPTION 'interview_duration must be one of 1, 15, 20, 30, 45, 60';
  END IF;
  IF NEW.interview_type NOT IN ('technical', 'hr', 'mixed') THEN
    RAISE EXCEPTION 'interview_type must be technical, hr, or mixed';
  END IF;
  IF NEW.difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'difficulty must be easy, medium, or hard';
  END IF;
  RETURN NEW;
END;
$function$;
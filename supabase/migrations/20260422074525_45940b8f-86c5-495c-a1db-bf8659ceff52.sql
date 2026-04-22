-- 1. interview_invites
CREATE TABLE public.interview_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  scheduled_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  duration_minutes integer NOT NULL DEFAULT 20,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  email_sent_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invites_token ON public.interview_invites(token);
CREATE INDEX idx_invites_candidate ON public.interview_invites(candidate_id);

ALTER TABLE public.interview_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters manage own invites"
  ON public.interview_invites FOR ALL
  TO authenticated
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

CREATE POLICY "Public lookup by valid token"
  ON public.interview_invites FOR SELECT
  TO anon, authenticated
  USING (token IS NOT NULL AND expires_at > now());

CREATE POLICY "Public mark invite used"
  ON public.interview_invites FOR UPDATE
  TO anon, authenticated
  USING (token IS NOT NULL AND expires_at > now())
  WITH CHECK (token IS NOT NULL);

-- 2. interview_violations
CREATE TABLE public.interview_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL,
  kind text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_violations_interview ON public.interview_violations(interview_id);

ALTER TABLE public.interview_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters view own violations"
  ON public.interview_violations FOR SELECT
  TO authenticated
  USING (auth.uid() = recruiter_id);

CREATE POLICY "Public insert violations with valid candidate"
  ON public.interview_violations FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_id
        AND c.interview_token IS NOT NULL
    )
  );

-- 3. interviews extras
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS hire_decision text;

-- 4. storage bucket for recordings (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-recordings', 'interview-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Recruiters read recordings of their candidates (path structure: {recruiter_id}/{candidate_id}/file.webm)
CREATE POLICY "Recruiters read own recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'interview-recordings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public (candidate via signed upload from edge function) can write — actual writes happen server-side with service role
CREATE POLICY "Service role manages recordings"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'interview-recordings');
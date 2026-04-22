// Public endpoint: candidate fetches sanitized interview context by invite token.
// Accepts either an interview_invites.token (new) or candidates.interview_token (legacy).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token } = await req.json();
    if (!token) return j({ error: "Missing token" }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Try invite token first
    const { data: invite } = await admin
      .from("interview_invites")
      .select("*, candidates(id, name, status, interview_token, jobs(title))")
      .eq("token", token)
      .maybeSingle();

    let candidate: any = null;
    let inviteRow: any = null;
    if (invite) {
      if (new Date(invite.expires_at).getTime() < Date.now()) {
        return j({ error: "This interview link has expired." }, 410);
      }
      candidate = (invite as any).candidates;
      inviteRow = invite;
    } else {
      // Legacy: candidate.interview_token
      const { data: cand } = await admin
        .from("candidates")
        .select("id, name, status, interview_token, jobs(title)")
        .eq("interview_token", token)
        .maybeSingle();
      candidate = cand;
    }

    if (!candidate) return j({ error: "Invalid link" }, 404);

    const { data: existingInterview } = await admin
      .from("interviews")
      .select("id, status")
      .eq("candidate_id", candidate.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return j({
      candidateId: candidate.id,
      candidateName: candidate.name,
      jobTitle: (candidate as any).jobs?.title ?? "the position",
      candidateStatus: candidate.status,
      candidateInterviewToken: candidate.interview_token,
      scheduledAt: inviteRow?.scheduled_at ?? null,
      durationMinutes: inviteRow?.duration_minutes ?? 20,
      alreadyCompleted: existingInterview?.status === "completed",
    });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

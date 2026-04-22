// Public endpoint to log proctoring violations during a candidate interview.
// Authenticated via interview token (invite or legacy candidate token).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token, kind, detail } = await req.json();
    if (!token || !kind) return j({ error: "Missing fields" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve candidate via invite or legacy token
    let candidateId: string | null = null;
    let recruiterId: string | null = null;
    const { data: invite } = await admin.from("interview_invites").select("candidate_id, recruiter_id").eq("token", token).maybeSingle();
    if (invite) { candidateId = invite.candidate_id; recruiterId = invite.recruiter_id; }
    else {
      const { data: cand } = await admin.from("candidates").select("id, recruiter_id").eq("interview_token", token).maybeSingle();
      if (cand) { candidateId = cand.id; recruiterId = cand.recruiter_id; }
    }
    if (!candidateId || !recruiterId) return j({ error: "Invalid token" }, 404);

    const { data: interview } = await admin
      .from("interviews")
      .select("id")
      .eq("candidate_id", candidateId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!interview) return j({ error: "No active interview" }, 404);

    await admin.from("interview_violations").insert({
      interview_id: interview.id,
      candidate_id: candidateId,
      recruiter_id: recruiterId,
      kind: String(kind).slice(0, 64),
      detail: detail ? String(detail).slice(0, 500) : null,
    });
    return j({ ok: true });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

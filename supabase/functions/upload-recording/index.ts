// Public endpoint: candidate uploads webcam recording chunk(s) for their interview.
// Path layout: {recruiter_id}/{candidate_id}/{interview_id}.webm
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return j({ error: "Missing token" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
    if (!interview) return j({ error: "No interview" }, 404);

    const blob = await req.blob();
    if (blob.size === 0) return j({ error: "Empty file" }, 400);

    const path = `${recruiterId}/${candidateId}/${interview.id}.webm`;
    const { error: upErr } = await admin.storage
      .from("interview-recordings")
      .upload(path, blob, { upsert: true, contentType: "video/webm" });
    if (upErr) return j({ error: upErr.message }, 500);

    await admin.from("interviews").update({ recording_url: path }).eq("id", interview.id);
    return j({ ok: true, path });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

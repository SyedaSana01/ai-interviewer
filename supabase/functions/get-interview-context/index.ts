// Public endpoint: candidate fetches sanitized interview context by token.
// Returns only candidate name + job title, not recruiter notes / scores.
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
    const { data } = await admin
      .from("candidates")
      .select("id, name, status, jobs(title)")
      .eq("interview_token", token)
      .single();
    if (!data) return j({ error: "Invalid link" }, 404);

    const { data: existingInterview } = await admin
      .from("interviews")
      .select("id, status")
      .eq("candidate_id", data.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return j({
      candidateName: data.name,
      jobTitle: (data as any).jobs?.title ?? "the position",
      candidateStatus: data.status,
      alreadyCompleted: existingInterview?.status === "completed",
    });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

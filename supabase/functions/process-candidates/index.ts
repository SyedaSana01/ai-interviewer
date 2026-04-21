// Parses resumes + scores against JD using Lovable AI in one batched call per candidate.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CandidateInput {
  resume_text: string;
  resume_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;
    const admin = createClient(supabaseUrl, supabaseService);

    const body = await req.json();
    const jobId = body.jobId as string;
    const candidates: CandidateInput[] = body.candidates ?? [];
    if (!jobId || candidates.length === 0) return json({ error: "Missing jobId or candidates" }, 400);

    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("recruiter_id", userId)
      .single();
    if (jobErr || !job) return json({ error: "Job not found" }, 404);

    const results: any[] = [];

    for (const c of candidates) {
      const truncated = c.resume_text.slice(0, 8000);
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are an expert technical recruiter. Extract candidate info from a resume and score the candidate against a job description. Return only via the provided tool call.",
            },
            {
              role: "user",
              content: `JOB TITLE: ${job.title}\n\nJOB DESCRIPTION:\n${job.description}\n\nRESUME TEXT:\n${truncated}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "evaluate_candidate",
                description: "Extract candidate fields and produce a match score against the job",
                parameters: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Full name; if unknown use 'Unknown Candidate'" },
                    email: { type: "string", description: "Email; if unknown use 'unknown@example.com'" },
                    skills: { type: "array", items: { type: "string" }, description: "Top 5-10 skills" },
                    experience_summary: { type: "string", description: "1-2 sentence summary" },
                    match_score: { type: "integer", minimum: 0, maximum: 100 },
                    match_reasoning: { type: "string", description: "1-2 sentences explaining the score" },
                  },
                  required: ["name", "email", "skills", "experience_summary", "match_score", "match_reasoning"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "evaluate_candidate" } },
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) return json({ error: "Rate limit hit, try again shortly" }, 429);
        if (aiResponse.status === 402) return json({ error: "AI credits exhausted" }, 402);
        const errText = await aiResponse.text();
        console.error("AI error", aiResponse.status, errText);
        continue;
      }
      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) continue;
      const parsed = JSON.parse(toolCall.function.arguments);

      // Auto-shortlist top scorers
      const status = parsed.match_score >= 70 ? "shortlisted" : "rejected";

      const { data: inserted, error: insertErr } = await admin
        .from("candidates")
        .insert({
          job_id: jobId,
          recruiter_id: userId,
          name: parsed.name,
          email: parsed.email,
          resume_url: c.resume_url ?? null,
          resume_text: truncated,
          skills: parsed.skills,
          experience_summary: parsed.experience_summary,
          match_score: parsed.match_score,
          match_reasoning: parsed.match_reasoning,
          status,
        })
        .select()
        .single();

      if (insertErr) {
        console.error("insert err", insertErr);
        continue;
      }
      results.push(inserted);
    }

    return json({ candidates: results });
  } catch (e) {
    console.error("process-candidates error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

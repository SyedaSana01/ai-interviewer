// Conducts the AI interview turn-by-turn.
// Public endpoint: candidate authenticates via interview_token (not Supabase auth).
// Body: { token, action: 'start' | 'answer' | 'end', answer?: string }
// Returns: { question?, finished?, interviewId }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function questionsForDuration(min: number) {
  if (min <= 2) return 3;   // demo mode (1-minute quick interview)
  if (min <= 15) return 4;
  if (min <= 30) return 6;
  if (min <= 45) return 8;
  return 10;
}
function difficultyGuidance(d?: string) {
  if (d === "easy") return "Keep questions BASIC and foundational. Focus on core concepts and simple definitions.";
  if (d === "hard") return "Ask DEEP technical / analytical questions. Push for trade-offs, edge cases, and architectural reasoning.";
  return "Use SCENARIO-BASED questions of moderate complexity. Mix concepts with applied judgement.";
}
function typeGuidance(t?: string) {
  if (t === "technical") return "All questions must be ROLE-SPECIFIC TECHNICAL questions only. No HR/behavioural questions.";
  if (t === "hr") return "Focus on BEHAVIOURAL, motivation, culture-fit and soft-skill questions. Avoid deep technical drilling.";
  return "Mix BEHAVIOURAL, ROLE-SPECIFIC TECHNICAL, and motivation questions in roughly equal parts.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const admin = createClient(supabaseUrl, supabaseService);
    const { token, action, answer } = await req.json();
    if (!token || !action) return json({ error: "Missing fields" }, 400);

    // Resolve candidate from invite token first, then legacy candidate token
    let cand: any = null;
    let inviteDurationMinutes: number | null = null;
    const { data: invite } = await admin
      .from("interview_invites")
      .select("candidate_id, expires_at, used_at, duration_minutes")
      .eq("token", token)
      .maybeSingle();
    if (invite) {
      if (new Date(invite.expires_at).getTime() < Date.now()) {
        return json({ error: "Interview link expired" }, 410);
      }
      const { data: c } = await admin.from("candidates").select("*, jobs(title, description, interview_duration, interview_type, difficulty)").eq("id", invite.candidate_id).single();
      cand = c;
      inviteDurationMinutes = invite.duration_minutes ?? null;
    } else {
      const { data: c } = await admin.from("candidates").select("*, jobs(title, description, interview_duration, interview_type, difficulty)").eq("interview_token", token).maybeSingle();
      cand = c;
    }
    if (!cand) return json({ error: "Invalid interview link" }, 404);
    if (cand.status === "selected" || cand.status === "final_rejected") {
      return json({ error: "Interview no longer available" }, 403);
    }

    // Fetch or create interview
    let { data: interview } = await admin
      .from("interviews")
      .select("*")
      .eq("candidate_id", cand.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!interview && action === "start") {
      const { data: created, error: ce } = await admin
        .from("interviews")
        .insert({ candidate_id: cand.id, recruiter_id: cand.recruiter_id, status: "in_progress" })
        .select()
        .single();
      if (ce) return json({ error: ce.message }, 500);
      interview = created;
    }
    if (!interview) return json({ error: "Interview not started" }, 400);
    if (interview.status === "completed") return json({ error: "Interview already completed" }, 400);

    // Save candidate answer
    if (action === "answer" && answer) {
      await admin.from("interview_messages").insert({
        interview_id: interview.id,
        role: "user",
        content: answer.slice(0, 4000),
      });
    }

    // Load full transcript
    const { data: messages } = await admin
      .from("interview_messages")
      .select("role, content, created_at")
      .eq("interview_id", interview.id)
      .order("created_at");

    const assistantTurns = (messages ?? []).filter((m) => m.role === "assistant").length;

    // Decide: end the interview?
    const job = (cand as any).jobs;
    const maxQuestions = questionsForDuration(job?.interview_duration ?? 20);
    if (action === "end" || assistantTurns >= maxQuestions) {
      await analyzeAndComplete(admin, lovableKey, interview.id, cand, job, messages ?? []);
      return json({ finished: true, interviewId: interview.id });
    }

    // Generate next question
    const isDemo = (job?.interview_duration ?? 20) <= 2;
    const systemPrompt = `You are conducting a structured voice interview for a ${job.title} role.
Job description: ${job.description.slice(0, 1500)}
Candidate background: ${cand.experience_summary ?? "N/A"}
Skills: ${(cand.skills ?? []).join(", ")}

Interview configuration:
- Type: ${job.interview_type ?? "mixed"} — ${typeGuidance(job.interview_type)}
- Difficulty: ${job.difficulty ?? "medium"} — ${difficultyGuidance(job.difficulty)}
- Duration: ~${job.interview_duration ?? 20} minutes (${maxQuestions} questions total)${isDemo ? "\n- DEMO MODE: super short questions (max 1 sentence). Skip filler. Be quick." : ""}

Style — speak like a friendly senior interviewer in a real video call:
- Warm, conversational, natural. ${isDemo ? "Skip greetings filler — get to questions fast." : 'Use light fillers occasionally ("Got it.", "Interesting.", "Thanks for sharing.") before the next question.'}
- ${isDemo ? "Do NOT acknowledge previous answers — go straight to the next question." : "Acknowledge the candidate's previous answer in ONE short sentence when relevant, then ask the next question."}
- Plain spoken English (no markdown, no bullet lists, no numbering). It will be read aloud by TTS.
- Keep it concise: ${isDemo ? "ONE short sentence per turn." : "at most 2–3 short sentences total per turn."}

Rules:
- Ask ONE clear question per turn.
- Build on previous answers when relevant.
- Question ${assistantTurns + 1} of ${maxQuestions}.
- ${assistantTurns === 0 ? (isDemo ? `Open with: "Hi ${cand.name}, let's begin." then your first question on the same line.` : "Open with a warm greeting by name, a one-line intro, then your first question.") : "Do not greet again."}
- Output ONLY what the interviewer would say out loud.`;

    const conv = (messages ?? []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...conv],
      }),
    });
    if (!aiRes.ok) {
      if (aiRes.status === 429) return json({ error: "AI rate limited, please retry" }, 429);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: "AI error" }, 500);
    }
    const aiData = await aiRes.json();
    const question = aiData.choices?.[0]?.message?.content?.trim();
    if (!question) return json({ error: "No question generated" }, 500);

    await admin.from("interview_messages").insert({
      interview_id: interview.id,
      role: "assistant",
      content: question,
    });

    return json({
      question,
      questionNumber: assistantTurns + 1,
      totalQuestions: maxQuestions,
      interviewId: interview.id,
    });
  } catch (e) {
    console.error("interview-turn error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

async function analyzeAndComplete(
  admin: any,
  lovableKey: string,
  interviewId: string,
  cand: any,
  job: any,
  messages: { role: string; content: string }[],
) {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
    .join("\n\n");

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are an expert hiring evaluator. Score the candidate's interview against the role and produce a recommendation. Be honest and concise. Use only the provided tool.",
        },
        {
          role: "user",
          content: `JOB: ${job.title}\n\nJOB DESCRIPTION:\n${job.description.slice(0, 2000)}\n\nCANDIDATE: ${cand.name}\nSKILLS: ${(cand.skills ?? []).join(", ")}\n\nINTERVIEW TRANSCRIPT:\n${transcript}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "score_interview",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "integer", minimum: 0, maximum: 100 },
                communication_score: { type: "integer", minimum: 0, maximum: 100 },
                technical_score: { type: "integer", minimum: 0, maximum: 100 },
                strengths: { type: "string" },
                weaknesses: { type: "string" },
                recommendation: { type: "string", enum: ["suitable", "not_suitable"] },
                hire_decision: { type: "string", enum: ["hire", "maybe", "no_hire"] },
                recommendation_reasoning: { type: "string" },
              },
              required: [
                "overall_score",
                "communication_score",
                "technical_score",
                "strengths",
                "weaknesses",
                "recommendation",
                "hire_decision",
                "recommendation_reasoning",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "score_interview" } },
    }),
  });
  let scored: any = {
    overall_score: 0,
    communication_score: 0,
    technical_score: 0,
    strengths: "Analysis unavailable.",
    weaknesses: "Analysis unavailable.",
    recommendation: "not_suitable",
    hire_decision: "no_hire",
    recommendation_reasoning: "Could not generate analysis.",
  };
  if (aiRes.ok) {
    const aiData = await aiRes.json();
    const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (tc) {
      try { scored = JSON.parse(tc.function.arguments); } catch {/* keep defaults */}
    }
  }

  await admin.from("interviews").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    ...scored,
  }).eq("id", interviewId);

  await admin.from("candidates").update({ status: "interviewed" }).eq("id", cand.id);
}

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Public endpoint: terminate an in-progress interview due to a proctoring violation.
// Authenticates via interview token (invite or legacy candidate token).
// Side effects:
//   1. Logs a violation row
//   2. Marks the interview status = 'terminated' with a recommendation = 'not_suitable' / hire_decision = 'no_hire'
//   3. Marks the candidate status = 'final_rejected' (Disqualified)
//   4. Notifies the recruiter via Resend (best-effort; never blocks termination)
// Body: { token: string, kind: string, detail?: string }
// Returns: { ok: true, message: string }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendViaResend, TEST_RECIPIENT } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REASON_LABEL: Record<string, string> = {
  tab_switch: "Tab/window switching detected",
  window_blur: "Interview window lost focus",
  camera_off: "Camera turned OFF during interview",
  mic_off: "Microphone muted during interview",
  long_silence: "Extended inactivity / no response",
  no_face: "No face detected in webcam frame",
  manual: "Manually terminated",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token, kind, detail } = await req.json();
    if (!token || !kind) return j({ error: "Missing fields" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve candidate via invite or legacy token
    let candidateId: string | null = null;
    let recruiterId: string | null = null;
    const { data: invite } = await admin
      .from("interview_invites")
      .select("candidate_id, recruiter_id")
      .eq("token", token)
      .maybeSingle();
    if (invite) {
      candidateId = invite.candidate_id;
      recruiterId = invite.recruiter_id;
    } else {
      const { data: cand } = await admin
        .from("candidates")
        .select("id, recruiter_id")
        .eq("interview_token", token)
        .maybeSingle();
      if (cand) { candidateId = cand.id; recruiterId = cand.recruiter_id; }
    }
    if (!candidateId || !recruiterId) return j({ error: "Invalid token" }, 404);

    // Load candidate + job for the recruiter email
    const { data: cand } = await admin
      .from("candidates")
      .select("id, name, email, status, jobs(id, title)")
      .eq("id", candidateId)
      .single();

    const reasonLabel = REASON_LABEL[kind] ?? kind;

    // Find the latest interview (may be null if user never clicked "Start")
    const { data: interview } = await admin
      .from("interviews")
      .select("id, status")
      .eq("candidate_id", candidateId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (interview) {
      // Log violation tied to interview
      await admin.from("interview_violations").insert({
        interview_id: interview.id,
        candidate_id: candidateId,
        recruiter_id: recruiterId,
        kind: String(kind).slice(0, 64),
        detail: (detail ? String(detail) : reasonLabel).slice(0, 500),
      });

      if (interview.status !== "terminated") {
        await admin.from("interviews").update({
          status: "terminated",
          completed_at: new Date().toISOString(),
          overall_score: 0,
          communication_score: 0,
          technical_score: 0,
          strengths: "—",
          weaknesses: `Interview terminated due to malpractice: ${reasonLabel}`,
          recommendation: "not_suitable",
          hire_decision: "no_hire",
          recommendation_reasoning: `Disqualified — ${reasonLabel}. Detail: ${detail ?? "n/a"}`,
        }).eq("id", interview.id);
      }
    }

    // Mark candidate as disqualified (final_rejected — closest existing enum value)
    await admin.from("candidates").update({ status: "final_rejected" }).eq("id", candidateId);

    // Notify recruiter (best-effort)
    try {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const job = (cand as any)?.jobs;
      const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;color:#0f172a;background:#ffffff">
        <div style="background:#fef3c7;padding:10px 16px;font-size:12px;border-radius:0 0 8px 8px;text-align:center">
          ⚠️ TEST MODE
        </div>
        <div style="padding:32px 28px">
          <div style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;padding:24px;border-radius:12px;margin-bottom:24px">
            <div style="font-size:13px;opacity:0.9;margin-bottom:6px">Interview Terminated</div>
            <h1 style="margin:0;font-size:22px;font-weight:600">${cand?.name ?? "Candidate"} — Disqualified</h1>
          </div>
          <p style="font-size:15px;line-height:1.6">A candidate was automatically disqualified during their AI interview.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8fafc;border-radius:10px">
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b">👤 Candidate</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500">${cand?.name ?? "—"} (${cand?.email ?? "—"})</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">💼 Role</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500;border-top:1px solid #e2e8f0">${job?.title ?? "—"}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">🚨 Reason</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:600;color:#b91c1c;border-top:1px solid #e2e8f0">${reasonLabel}</td></tr>
            ${detail ? `<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">📝 Detail</td><td style="padding:12px 16px;font-size:13px;text-align:right;color:#475569;border-top:1px solid #e2e8f0">${String(detail).slice(0, 200)}</td></tr>` : ""}
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">⏱ Time</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500;border-top:1px solid #e2e8f0">${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}</td></tr>
          </table>
          <p style="font-size:13px;color:#475569;line-height:1.6">Status has been set to <strong style="color:#b91c1c">Disqualified</strong>. The candidate cannot retry this interview.</p>
          <p style="font-size:12px;color:#94a3b8;margin-top:32px;text-align:center">Powered by HireFlow · Proctoring System</p>
        </div>
      </div>`;
      await sendViaResend({
        resendKey, lovableKey,
        subject: `🚨 Interview disqualified — ${cand?.name ?? "Candidate"} (${job?.title ?? "Role"})`,
        html,
      });
    } catch (e) {
      console.warn("recruiter notify failed", e);
    }

    return j({
      ok: true,
      message: "Interview terminated due to malpractice detection.",
      reason: reasonLabel,
      testRecipient: TEST_RECIPIENT,
    });
  } catch (e) {
    console.error("terminate-interview error", e);
    return j({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Bulk-send interview invites to all shortlisted candidates for a job.
// In TEST MODE all emails are routed to TEST_RECIPIENT.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { inviteHtml, sendViaResend, TEST_RECIPIENT } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, supabaseService);
    const { jobId, appUrl } = await req.json() as { jobId: string; appUrl: string };

    const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (!job || job.recruiter_id !== userData.user.id) return json({ error: "Job not found" }, 404);

    const { data: candidates } = await admin
      .from("candidates")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "shortlisted");

    if (!candidates || candidates.length === 0) {
      return json({ ok: true, count: 0, sent: 0, failed: 0, invites: [], note: "No shortlisted candidates to invite." });
    }

    const jobDuration = (job as any).interview_duration ?? 20;
    const jobType = (job as any).interview_type ?? "mixed";
    const jobDifficulty = (job as any).difficulty ?? "medium";

    let sent = 0;
    let failed = 0;
    const invites: { name: string; email: string; url: string; sent: boolean; error?: string }[] = [];
    for (const c of candidates) {
      try {
        const { data: invite, error: ie } = await admin.from("interview_invites").insert({
          candidate_id: c.id,
          job_id: jobId,
          recruiter_id: userData.user.id,
          email_sent_to: TEST_RECIPIENT,
          duration_minutes: jobDuration,
        }).select().single();
        if (ie || !invite) {
          failed++;
          invites.push({ name: c.name, email: c.email, url: "", sent: false, error: ie?.message ?? "invite create failed" });
          continue;
        }

        const interviewUrl = `${appUrl}/interview/${invite.token}`;
        const html = inviteHtml({
          name: c.name,
          jobTitle: job.title,
          interviewUrl,
          scheduledAt: invite.scheduled_at,
          durationMinutes: invite.duration_minutes,
          originalEmail: c.email,
          interviewType: jobType,
          difficulty: jobDifficulty,
        });

        const result = await sendViaResend({
          resendKey, lovableKey,
          subject: `AI Interview Invitation – ${job.title}`,
          html,
        });
        const wasSent = !!result.sent;
        if (wasSent) {
          sent++;
          await admin.from("candidates").update({ status: "interview_sent" }).eq("id", c.id);
        } else {
          failed++;
        }
        invites.push({
          name: c.name, email: c.email, url: interviewUrl, sent: wasSent,
          error: wasSent ? undefined : (result.note ?? "email not sent"),
        });
      } catch (e) {
        console.error("invite failed for", c.id, e);
        failed++;
        invites.push({ name: c.name, email: c.email, url: "", sent: false, error: e instanceof Error ? e.message : "exception" });
      }
    }

    return json({ ok: true, count: candidates.length, sent, failed, testRecipient: TEST_RECIPIENT, invites });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

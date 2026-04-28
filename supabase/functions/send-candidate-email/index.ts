// Sends emails to candidates: interview invite, selected, rejected.
// Uses Resend in TEST MODE — all emails are forced to TEST_RECIPIENT.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { inviteHtml, sendViaResend, TEST_RECIPIENT } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EmailKind = "interview_invite" | "selected" | "rejected";

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
    const { candidateId, kind, appUrl, sendToSelf } = await req.json() as {
      candidateId: string; kind: EmailKind; appUrl: string; sendToSelf?: boolean;
    };
    const recipient = sendToSelf === false ? undefined : TEST_RECIPIENT; // undefined = use candidate.email below

    const { data: cand } = await admin
      .from("candidates")
      .select("*, jobs(title, recruiter_id)")
      .eq("id", candidateId)
      .single();
    if (!cand || (cand as any).recruiter_id !== userData.user.id) return json({ error: "Not found" }, 404);

    const jobTitle = (cand as any).jobs.title;
    let subject = "";
    let html = "";

    if (kind === "interview_invite") {
      // Single-candidate invite: create an invite token and email
      const { data: invite } = await admin.from("interview_invites").insert({
        candidate_id: cand.id,
        job_id: cand.job_id,
        recruiter_id: userData.user.id,
        email_sent_to: TEST_RECIPIENT,
      }).select().single();
      const interviewUrl = `${appUrl}/interview/${invite!.token}`;
      subject = `AI Interview Invitation – ${jobTitle}`;
      html = inviteHtml({ name: cand.name, jobTitle, interviewUrl, scheduledAt: invite!.scheduled_at, durationMinutes: invite!.duration_minutes, originalEmail: cand.email });
      await admin.from("candidates").update({ status: "interview_sent" }).eq("id", candidateId);
    } else if (kind === "selected") {
      subject = `Great news about ${jobTitle}`;
      html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
        <p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:12px">⚠️ TEST MODE — original recipient: ${cand.email}</p>
        <h2>Congratulations, ${cand.name}!</h2>
        <p>You have been <strong>selected</strong> for the <strong>${jobTitle}</strong> role.</p>
        <p>Our team will be in touch shortly with next steps.</p>
      </div>`;
      await admin.from("candidates").update({ status: "selected" }).eq("id", candidateId);
    } else {
      subject = `Update on your ${jobTitle} application`;
      html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
        <p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:12px">⚠️ TEST MODE — original recipient: ${cand.email}</p>
        <h2>Hello ${cand.name},</h2>
        <p>Thank you for your interest in the <strong>${jobTitle}</strong> role.</p>
        <p>After careful consideration, we will not be moving forward at this time. We wish you the very best in your job search.</p>
      </div>`;
      await admin.from("candidates").update({ status: "final_rejected" }).eq("id", candidateId);
    }

    const toAddress = recipient ?? cand.email;
    const sendResult = await sendViaResend({ resendKey, lovableKey, subject, html, to: toAddress });
    const inviteUrl = kind === "interview_invite"
      ? `${appUrl}/interview/${(await admin.from("interview_invites").select("token").eq("candidate_id", cand.id).order("created_at", { ascending: false }).limit(1).single()).data?.token}`
      : undefined;
    return json({ ok: true, ...sendResult, inviteUrl });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});


function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

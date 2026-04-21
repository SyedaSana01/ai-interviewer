// Sends emails to candidates: interview invite, selected, rejected.
// Uses Lovable's email API (requires email domain configured in Cloud → Emails).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, supabaseService);
    const { candidateId, kind, appUrl } = await req.json() as {
      candidateId: string;
      kind: EmailKind;
      appUrl: string;
    };

    const { data: cand } = await admin
      .from("candidates")
      .select("*, jobs(title, recruiter_id)")
      .eq("id", candidateId)
      .single();
    if (!cand || (cand as any).recruiter_id !== userData.user.id) return json({ error: "Not found" }, 404);

    const jobTitle = (cand as any).jobs.title;
    const interviewUrl = `${appUrl}/interview/${cand.interview_token}`;

    let subject = "";
    let html = "";

    if (kind === "interview_invite") {
      subject = `You're shortlisted for ${jobTitle}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h2 style="margin:0 0 16px">Congratulations, ${cand.name}!</h2>
          <p>You have been shortlisted for the <strong>${jobTitle}</strong> position.</p>
          <p>Please complete your AI-conducted voice interview at the link below. It will take about 10–15 minutes and you can do it from any device with a microphone.</p>
          <p style="margin:24px 0">
            <a href="${interviewUrl}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Start Interview</a>
          </p>
          <p style="font-size:12px;color:#666">Or copy this link: ${interviewUrl}</p>
        </div>`;
      await admin.from("candidates").update({ status: "interview_sent" }).eq("id", candidateId);
    } else if (kind === "selected") {
      subject = `Great news about ${jobTitle}`;
      html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2>Congratulations, ${cand.name}!</h2>
        <p>We're delighted to let you know you have been <strong>selected</strong> for the <strong>${jobTitle}</strong> role.</p>
        <p>Our team will be in touch shortly with next steps.</p>
      </div>`;
      await admin.from("candidates").update({ status: "selected" }).eq("id", candidateId);
    } else {
      subject = `Update on your ${jobTitle} application`;
      html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2>Hello ${cand.name},</h2>
        <p>Thank you for your time and effort throughout the process for the <strong>${jobTitle}</strong> role.</p>
        <p>After careful consideration, we will not be moving forward at this time. We wish you the very best in your job search.</p>
      </div>`;
      await admin.from("candidates").update({ status: "final_rejected" }).eq("id", candidateId);
    }

    if (!lovableKey) {
      return json({ ok: true, simulated: true, note: "Email simulated (no email infra). Update status persisted." });
    }

    // Try sending via Lovable email API if available; fall back to simulated success.
    try {
      const sendRes = await fetch("https://api.lovable.dev/v1/email/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: cand.email, subject, html }),
      });
      if (!sendRes.ok) {
        const t = await sendRes.text();
        console.warn("Email send failed (likely no email domain configured):", sendRes.status, t);
        return json({ ok: true, simulated: true, note: "Email could not be delivered. Configure an email domain in Cloud → Emails to enable real delivery." });
      }
      return json({ ok: true, sent: true });
    } catch (e) {
      console.warn("Email send threw", e);
      return json({ ok: true, simulated: true });
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

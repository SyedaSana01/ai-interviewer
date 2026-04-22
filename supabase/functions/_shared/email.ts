// Shared email helpers used by send-candidate-email and send-interview-invites.
// deno-lint-ignore-file no-explicit-any

export const TEST_RECIPIENT = "syedasuhasana0504@gmail.com";
export const FROM_ADDRESS = "HireFlow <onboarding@resend.dev>";

export function inviteHtml(opts: {
  name: string; jobTitle: string; interviewUrl: string;
  scheduledAt: string; durationMinutes: number; originalEmail: string;
  interviewType?: string; difficulty?: string;
}) {
  const start = new Date(opts.scheduledAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
  const typeLabel = ({ technical: "Technical", hr: "HR / Behavioural", mixed: "Mixed (technical + HR)" } as Record<string, string>)[opts.interviewType ?? "mixed"] ?? "Mixed";
  const diffLabel = ({ easy: "Easy", medium: "Medium", hard: "Hard" } as Record<string, string>)[opts.difficulty ?? "medium"] ?? "Medium";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;color:#0f172a;background:#ffffff">
    <div style="background:#fef3c7;padding:10px 16px;font-size:12px;border-radius:0 0 8px 8px;text-align:center">
      ⚠️ TEST MODE — original recipient: <strong>${opts.originalEmail}</strong>
    </div>
    <div style="padding:32px 28px">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:24px;border-radius:12px;margin-bottom:24px">
        <div style="font-size:13px;opacity:0.9;margin-bottom:6px">AI Interview Invitation</div>
        <h1 style="margin:0;font-size:22px;font-weight:600">${opts.jobTitle}</h1>
      </div>

      <p style="font-size:15px;line-height:1.6">Hi <strong>${opts.name}</strong>,</p>
      <p style="font-size:15px;line-height:1.6">You're invited to interview for the <strong>${opts.jobTitle}</strong> role. The interview is conducted by our AI and proctored by webcam — please complete it from a quiet location.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8fafc;border-radius:10px">
        <tr><td style="padding:12px 16px;font-size:13px;color:#64748b">📅 Start time</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500">${start}</td></tr>
        <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">⏱ Duration</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500;border-top:1px solid #e2e8f0">~${opts.durationMinutes} minutes</td></tr>
        <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">🎯 Type</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500;border-top:1px solid #e2e8f0">${typeLabel}</td></tr>
        <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">📊 Difficulty</td><td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:500;border-top:1px solid #e2e8f0">${diffLabel}</td></tr>
      </table>

      <div style="text-align:center;margin:28px 0">
        <a href="${opts.interviewUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">🔗 Join AI Interview</a>
      </div>
      <p style="font-size:11px;color:#94a3b8;text-align:center;word-break:break-all">${opts.interviewUrl}</p>

      <div style="background:#fef9c3;border-left:4px solid #eab308;padding:16px 18px;border-radius:6px;margin-top:24px">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px">📜 Interview Rules</div>
        <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#475569">
          <li>Join on time — the link expires in 7 days</li>
          <li>Ensure stable internet connection</li>
          <li>Keep your <strong>camera ON</strong> throughout</li>
          <li>No external help (no notes, AI, or other people)</li>
          <li>Stay in a quiet environment</li>
        </ul>
      </div>

      <p style="font-size:12px;color:#94a3b8;margin-top:32px;text-align:center">Powered by HireFlow</p>
    </div>
  </div>`;
}

export async function sendViaResend(opts: {
  resendKey?: string; lovableKey?: string; subject: string; html: string;
}): Promise<{ sent?: boolean; simulated?: boolean; testRecipient?: string; note?: string }> {
  if (!opts.resendKey) {
    return { simulated: true, note: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.lovableKey}`,
        "X-Connection-Api-Key": opts.resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [TEST_RECIPIENT],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn("Resend send failed", res.status, txt);
      return { simulated: true, note: `Resend error ${res.status}` };
    }
    return { sent: true, testRecipient: TEST_RECIPIENT };
  } catch (e) {
    console.warn("Resend send threw", e);
    return { simulated: true, note: "Resend exception" };
  }
}

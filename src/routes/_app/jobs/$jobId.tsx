import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractResumeText } from "@/lib/resumeParser";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowLeft, Upload, Mail, Loader2, FileText, Eye, Send, Info, Download, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { CandidateDrawer } from "@/components/CandidateDrawer";
import { exportCandidatesXlsx } from "@/lib/exportCandidates";
import type { Database } from "@/integrations/supabase/types";

type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
type Job = Database["public"]["Tables"]["jobs"]["Row"];

export const Route = createFileRoute("/_app/jobs/$jobId")({
  component: JobDetail,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "interview_sent", label: "Interview sent" },
  { key: "interviewed", label: "Interviewed" },
  { key: "selected", label: "Selected" },
  { key: "rejected", label: "Rejected" },
] as const;

function JobDetail() {
  const { jobId } = Route.useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filter, setFilter] = useState<typeof FILTERS[number]["key"]>("all");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jobRes, candRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).single(),
      supabase.from("candidates").select("*").eq("job_id", jobId).order("match_score", { ascending: false, nullsFirst: false }),
    ]);
    setJob(jobRes.data);
    setCandidates(candRes.data ?? []);
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all"
    ? candidates
    : filter === "rejected"
      ? candidates.filter((c) => c.status === "rejected" || c.status === "final_rejected")
      : candidates.filter((c) => c.status === filter);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const candidatesPayload: { resume_text: string; resume_url: string | null }[] = [];
      let i = 0;
      for (const file of Array.from(files)) {
        try {
          const text = await extractResumeText(file);
          if (text.length < 50) {
            toast.warning(`${file.name}: too little text extracted, skipping`);
            i++; setProgress({ done: i, total: files.length });
            continue;
          }
          // Upload to storage
          const path = `${u.user.id}/${jobId}/${Date.now()}-${file.name}`;
          const { error: upErr } = await supabase.storage.from("resumes").upload(path, file);
          let resume_url: string | null = null;
          if (!upErr) resume_url = path;
          candidatesPayload.push({ resume_text: text, resume_url });
        } catch (e) {
          toast.error(`${file.name}: ${e instanceof Error ? e.message : "parse failed"}`);
        }
        i++; setProgress({ done: i, total: files.length });
      }

      if (candidatesPayload.length === 0) { toast.error("No resumes processed"); return; }

      toast.info(`Analyzing ${candidatesPayload.length} resume(s) with AI…`);
      const { data, error } = await supabase.functions.invoke("process-candidates", {
        body: { jobId, candidates: candidatesPayload },
      });
      if (error) throw error;
      toast.success(`Analyzed ${data.candidates.length} candidate(s)`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setUploading(false); setProgress(null);
    }
  };

  const [sendToSelf, setSendToSelf] = useState(true);

  const sendInvite = async (candidateId: string) => {
    toast.info("Sending interview invite…");
    const { data, error } = await supabase.functions.invoke("send-candidate-email", {
      body: { candidateId, kind: "interview_invite", appUrl: window.location.origin, sendToSelf },
    });
    if (error) { toast.error(`❌ ${error.message}`); return; }
    if (data?.sent) {
      toast.success(`✅ Email sent to ${data.recipient}`);
    } else if (data?.inviteUrl) {
      try { await navigator.clipboard.writeText(data.inviteUrl); } catch { /* ignore */ }
      toast.warning(`❌ Email failed${data?.note ? ` (${data.note})` : ""} — link copied.`, { duration: 7000 });
      setInviteLinks([{ name: "Candidate", email: "", url: data.inviteUrl, sent: false, error: data?.note }]);
    } else {
      toast.warning(data?.note || "Invite simulated.");
    }
    load();
  };

  const [bulkSending, setBulkSending] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<{ name: string; email: string; url: string; sent: boolean; error?: string }[]>([]);
  const sendBulkInvites = async () => {
    const shortlistedCount = candidates.filter((c) => c.status === "shortlisted").length;
    if (shortlistedCount === 0) { toast.error("No shortlisted candidates to invite."); return; }
    setBulkSending(true);
    setInviteLinks([]);
    toast.info(`Sending ${shortlistedCount} invite(s)…`);
    const { data, error } = await supabase.functions.invoke("send-interview-invites", {
      body: { jobId, appUrl: window.location.origin, sendToSelf },
    });
    setBulkSending(false);
    if (error) { toast.error(`❌ ${error.message}`); return; }
    const list = (data?.invites ?? []) as typeof inviteLinks;
    setInviteLinks(list);
    if (data?.sent > 0) {
      const target = sendToSelf ? `TEST MODE → ${data.testRecipient}` : "candidate emails";
      toast.success(`✅ Sent ${data.sent}/${data.count} invite(s) (${target})`);
    }
    if (data?.failed > 0) toast.warning(`⚠️ ${data.failed} email(s) failed — links shown below.`);
    load();
  };

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    catch { toast.error("Copy failed"); }
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const n = await exportCandidatesXlsx({ jobId, filename: `${job?.title?.replace(/\s+/g, "_") ?? "job"}-candidates.xlsx` });
      toast.success(`Exported ${n} candidate(s) to Excel`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally { setExporting(false); }
  };

  if (!job) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link to="/jobs" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> All jobs
      </Link>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          {job.role_type && <p className="text-sm text-muted-foreground mt-1">{job.role_type}</p>}
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <span className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading
              ? `Processing ${progress?.done ?? 0}/${progress?.total ?? 0}…`
              : "Upload resumes"}
          </span>
        </label>
      </div>

      <details className="mt-4 mb-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer">View job description</summary>
        <p className="mt-2 whitespace-pre-wrap">{job.description}</p>
      </details>

      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium">
          ⏱ {(job as any).interview_duration ?? 20} min
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium capitalize">
          🎯 {(job as any).interview_type ?? "mixed"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium capitalize">
          📊 {(job as any).difficulty ?? "medium"}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
        <div className="flex items-start gap-2 text-sm">
          <Info className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
          <span className="text-amber-900 dark:text-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
        <div className="flex items-start gap-2 text-sm">
          <Info className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
          <span className="text-amber-900 dark:text-amber-200">
            <strong>Send invites to:</strong>
          </span>
          <div className="inline-flex rounded-md border border-amber-300 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setSendToSelf(true)}
              className={`px-3 py-1 ${sendToSelf ? "bg-amber-600 text-white" : "bg-white text-amber-900 hover:bg-amber-100"}`}
            >
              My email (Test)
            </button>
            <button
              type="button"
              onClick={() => setSendToSelf(false)}
              className={`px-3 py-1 ${!sendToSelf ? "bg-amber-600 text-white" : "bg-white text-amber-900 hover:bg-amber-100"}`}
            >
              Candidate email
            </button>
          </div>
          <span className="text-xs text-amber-800/80">
            {sendToSelf
              ? "→ syedasuhasana0504@gmail.com"
              : "→ real candidate (may fail in Resend test mode)"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Excel report
          </Button>
          <Button size="sm" onClick={() => sendBulkInvites()} disabled={bulkSending}>
            {bulkSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Invites
          </Button>
        </div>
      </div>

      {inviteLinks.length > 0 && (
        <div className="mb-6 rounded-lg border bg-card shadow-[var(--shadow-soft)] overflow-hidden">
          <div className="px-4 py-3 border-b bg-secondary/40 flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Interview links (fallback)
            </div>
            <button onClick={() => setInviteLinks([])} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
          </div>
          <ul className="divide-y text-sm">
            {inviteLinks.map((inv, i) => (
              <li key={i} className="px-4 py-2 flex items-center gap-3">
                {inv.sent
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{inv.name} <span className="text-xs text-muted-foreground">{inv.email}</span></div>
                  {inv.url && <div className="text-xs text-muted-foreground truncate font-mono">{inv.url}</div>}
                  {!inv.sent && inv.error && <div className="text-xs text-amber-700">⚠ {inv.error}</div>}
                </div>
                {inv.url && (
                  <Button size="sm" variant="outline" onClick={() => copyLink(inv.url)}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b">
        {FILTERS.map((f) => {
          const count = f.key === "all"
            ? candidates.length
            : f.key === "rejected"
              ? candidates.filter((c) => c.status === "rejected" || c.status === "final_rejected").length
              : candidates.filter((c) => c.status === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                filter === f.key ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label} <span className="ml-1 text-xs opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center shadow-[var(--shadow-soft)]">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold">No candidates yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Upload PDF/DOCX resumes to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-[var(--shadow-soft)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Candidate</th>
                <th className="text-left px-4 py-3 font-medium">Match</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-[image:var(--gradient-accent)]"
                          style={{ width: `${c.match_score ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums">{c.match_score ?? "—"}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {c.status === "shortlisted" && (
                        <Button size="sm" variant="ghost" onClick={() => sendInvite(c.id)}>
                          <Mail className="w-3.5 h-3.5 mr-1" /> Invite
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setSelectedCandidateId(c.id)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CandidateDrawer
        candidateId={selectedCandidateId}
        open={!!selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
        onChanged={load}
      />
    </div>
  );
}

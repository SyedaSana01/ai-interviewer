import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Mail, ThumbsUp, ThumbsDown, Sparkles, Loader2, ShieldAlert, Video } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
type Interview = Database["public"]["Tables"]["interviews"]["Row"];
type Violation = Database["public"]["Tables"]["interview_violations"]["Row"];

interface Props {
  candidateId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function CandidateDrawer({ candidateId, open, onClose, onChanged }: Props) {
  const [cand, setCand] = useState<Candidate | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!candidateId) return;
    (async () => {
      const { data } = await supabase.from("candidates").select("*").eq("id", candidateId).single();
      setCand(data);
      const { data: iv } = await supabase
        .from("interviews")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setInterview(iv);
      if (iv?.id) {
        const { data: vs } = await supabase
          .from("interview_violations")
          .select("*")
          .eq("interview_id", iv.id)
          .order("created_at");
        setViolations(vs ?? []);
      } else {
        setViolations([]);
      }
      if (iv?.recording_url) {
        const { data: signed } = await supabase.storage
          .from("interview-recordings")
          .createSignedUrl(iv.recording_url, 3600);
        setRecordingUrl(signed?.signedUrl ?? null);
      } else {
        setRecordingUrl(null);
      }
    })();
  }, [candidateId]);

  const action = async (kind: "interview_invite" | "selected" | "rejected") => {
    if (!cand) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-candidate-email", {
        body: { candidateId: cand.id, kind, appUrl: window.location.origin },
      });
      if (error) throw error;
      if (data?.sent) toast.success(`Email sent (TEST MODE → ${data.testRecipient})`);
      else toast.warning(data?.note || "Email simulated.");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  if (!cand) return null;

  const decisionBadge = (d: string | null) => {
    if (d === "hire") return { label: "✅ HIRE", className: "bg-success/15 border-success/40 text-success" };
    if (d === "maybe") return { label: "🤔 MAYBE", className: "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400" };
    return { label: "❌ NO HIRE", className: "bg-destructive/15 border-destructive/40 text-destructive" };
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{cand.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-3">
            <StatusBadge status={cand.status} />
            <span className="text-sm text-muted-foreground">{cand.email}</span>
          </div>

          <div className="rounded-lg border p-4 bg-secondary/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">AI Match Score</span>
              <span className="text-2xl font-semibold tabular-nums">{cand.match_score ?? "—"}%</span>
            </div>
            {cand.match_reasoning && <p className="text-sm text-muted-foreground mt-2">{cand.match_reasoning}</p>}
          </div>

          {cand.skills && cand.skills.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {cand.skills.map((s) => <span key={s} className="text-xs px-2 py-1 rounded-md bg-secondary">{s}</span>)}
              </div>
            </div>
          )}

          {cand.experience_summary && (
            <div>
              <h4 className="text-sm font-medium mb-2">Experience</h4>
              <p className="text-sm text-muted-foreground">{cand.experience_summary}</p>
            </div>
          )}

          {interview ? (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <h4 className="font-medium">AI Interview Report</h4>
                <span className="text-xs text-muted-foreground ml-auto">Recruiter only</span>
              </div>

              {interview.status !== "completed" ? (
                <p className="text-sm text-muted-foreground">Interview in progress…</p>
              ) : (
                <>
                  {(() => { const d = decisionBadge(interview.hire_decision); return (
                    <div className={`rounded-md border p-3 text-center font-semibold ${d.className}`}>{d.label}</div>
                  ); })()}

                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Overall" value={interview.overall_score} />
                    <Stat label="Communication" value={interview.communication_score} />
                    <Stat label="Technical" value={interview.technical_score} />
                  </div>

                  {interview.strengths && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Strengths</div>
                      <p className="text-sm">{interview.strengths}</p>
                    </div>
                  )}
                  {interview.weaknesses && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Weaknesses</div>
                      <p className="text-sm">{interview.weaknesses}</p>
                    </div>
                  )}
                  {interview.recommendation_reasoning && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reasoning</div>
                      <p className="text-sm text-muted-foreground">{interview.recommendation_reasoning}</p>
                    </div>
                  )}
                </>
              )}

              {violations.length > 0 && (
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-medium">Proctoring violations ({violations.length})</span>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    {violations.slice(0, 8).map((v) => (
                      <li key={v.id}>
                        <span className="font-mono">{v.kind}</span>
                        {v.detail && <span className="opacity-70"> — {v.detail}</span>}
                      </li>
                    ))}
                    {violations.length > 8 && <li className="opacity-60">+{violations.length - 8} more</li>}
                  </ul>
                </div>
              )}

              {recordingUrl && (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <Video className="w-4 h-4" /> Webcam recording
                  </div>
                  <video src={recordingUrl} controls className="w-full rounded-md border bg-black" />
                </div>
              )}
            </div>
          ) : (
            cand.status !== "shortlisted" && cand.status !== "rejected" && (
              <p className="text-sm text-muted-foreground">No interview yet.</p>
            )
          )}

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {cand.status === "shortlisted" && (
              <Button onClick={() => action("interview_invite")} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Send interview invite
              </Button>
            )}
            {cand.status === "interviewed" && (
              <>
                <Button onClick={() => action("selected")} disabled={busy} className="bg-success hover:bg-success/90">
                  <ThumbsUp className="w-4 h-4 mr-2" /> Select candidate
                </Button>
                <Button variant="destructive" onClick={() => action("rejected")} disabled={busy}>
                  <ThumbsDown className="w-4 h-4 mr-2" /> Reject candidate
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-secondary/50 p-3 text-center">
      <div className="text-2xl font-semibold tabular-nums">{value ?? "—"}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

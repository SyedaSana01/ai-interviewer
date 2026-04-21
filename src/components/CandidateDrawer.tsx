import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Mail, ThumbsUp, ThumbsDown, Sparkles, Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
type Interview = Database["public"]["Tables"]["interviews"]["Row"];

interface Props {
  candidateId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function CandidateDrawer({ candidateId, open, onClose, onChanged }: Props) {
  const [cand, setCand] = useState<Candidate | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
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
      if (data?.simulated) toast.warning("Email simulated (set up an email domain in Cloud → Emails for real delivery). Status updated.");
      else toast.success("Email sent");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  if (!cand) return null;

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
            {cand.match_reasoning && (
              <p className="text-sm text-muted-foreground mt-2">{cand.match_reasoning}</p>
            )}
          </div>

          {cand.skills && cand.skills.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {cand.skills.map((s) => (
                  <span key={s} className="text-xs px-2 py-1 rounded-md bg-secondary">{s}</span>
                ))}
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
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <h4 className="font-medium">AI Interview Report</h4>
                <span className="text-xs text-muted-foreground ml-auto">Recruiter only</span>
              </div>
              {interview.status !== "completed" ? (
                <p className="text-sm text-muted-foreground">Interview in progress…</p>
              ) : (
                <div className="space-y-4">
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
                  <div className={`rounded-md p-3 ${interview.recommendation === "suitable" ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"}`}>
                    <div className="font-medium text-sm">
                      {interview.recommendation === "suitable" ? "✅ Suitable for the role" : "⚠️ Not suitable for the role"}
                    </div>
                    {interview.recommendation_reasoning && (
                      <p className="text-xs text-muted-foreground mt-1">{interview.recommendation_reasoning}</p>
                    )}
                  </div>
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

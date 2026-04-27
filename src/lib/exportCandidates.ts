// Excel report export for candidates (uses xlsx).
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface ExportRow {
  Name: string;
  Email: string;
  Role: string;
  "Match Score": number | string;
  "Interview Score": number | string;
  Communication: number | string;
  Technical: number | string;
  Decision: string;
  Status: string;
}

function decisionLabel(d: string | null) {
  if (d === "hire") return "✅ Hire";
  if (d === "maybe") return "🤔 Maybe";
  if (d === "no_hire") return "❌ Reject";
  return "—";
}

export async function exportCandidatesXlsx(opts: {
  jobId?: string;
  filename?: string;
  scope?: "all" | "selected";
}) {
  const { jobId, scope } = opts;
  let query = supabase
    .from("candidates")
    .select("id, name, email, status, match_score, job_id, jobs(title)");
  if (jobId) query = query.eq("job_id", jobId);
  if (scope === "selected") query = query.eq("status", "selected");
  const { data: candidates, error } = await query;
  if (error || !candidates || candidates.length === 0) {
    throw new Error(candidates && candidates.length === 0 ? "No candidates to export." : (error?.message || "Failed"));
  }

  const candidateIds = candidates.map((c: any) => c.id).filter(Boolean);
  
  // Fetch latest interview per candidate
  const interviewMap = new Map<string, any>();
  const { data: interviews } = await supabase
    .from("interviews")
    .select("candidate_id, overall_score, communication_score, technical_score, hire_decision, started_at")
    .in("candidate_id", candidateIds as string[]);
    
  (interviews ?? []).forEach((iv: any) => {
    const prev = interviewMap.get(iv.candidate_id);
    // Keep most recent
    if (!prev || new Date(iv.started_at).getTime() > new Date(prev.started_at).getTime()) {
      interviewMap.set(iv.candidate_id, iv);
    }
  });

  const rows: ExportRow[] = candidates.map((c: any) => {
    const iv = interviewMap.get(c.id);
    return {
      Name: c.name,
      Email: c.email,
      Role: c.jobs?.title ?? "—",
      "Match Score": c.match_score ?? "—",
      "Interview Score": iv?.overall_score ?? "—",
      Communication: iv?.communication_score ?? "—",
      Technical: iv?.technical_score ?? "—",
      Decision: decisionLabel(iv?.hire_decision ?? null),
      Status: c.status,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto column widths
  const colKeys = Object.keys(rows[0]);
  ws["!cols"] = colKeys.map((k) => ({
    wch: Math.max(k.length, ...rows.map((r: any) => String(r[k] ?? "").length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");

  const filename = opts.filename ?? `candidates-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  return rows.length;
}

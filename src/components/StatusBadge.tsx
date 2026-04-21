import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["candidate_status"];

const styles: Record<Status, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
  shortlisted: { label: "Shortlisted", cls: "bg-success/15 text-[oklch(0.45_0.16_150)]" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive" },
  interview_sent: { label: "Interview sent", cls: "bg-accent/15 text-accent" },
  interviewed: { label: "Interviewed", cls: "bg-primary/15 text-primary" },
  selected: { label: "Selected", cls: "bg-success text-primary-foreground" },
  final_rejected: { label: "Not selected", cls: "bg-destructive text-destructive-foreground" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = styles[status] ?? styles.pending;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

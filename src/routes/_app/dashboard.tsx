import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Users, CheckCircle2, Mic, Download, Trophy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCandidatesXlsx } from "@/lib/exportCandidates";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — HireFlow" }] }),
});

interface SelectedRow {
  id: string;
  name: string;
  email: string;
  match_score: number | null;
  status: string;
  jobs: { title: string } | null;
  interviews: { overall_score: number | null; hire_decision: string | null }[];
}

function Dashboard() {
  const [stats, setStats] = useState({ jobs: 0, candidates: 0, shortlisted: 0, interviewed: 0 });
  const [recent, setRecent] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [selected, setSelected] = useState<SelectedRow[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const [jobs, candidates, shortlisted, interviewed, recentJobs, sel] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "shortlisted"),
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "interviewed"),
        supabase.from("jobs").select("id, title, created_at").order("created_at", { ascending: false }).limit(5),
        supabase
          .from("candidates")
          .select("id, name, email, match_score, status, jobs(title), interviews(overall_score, hire_decision)")
          .eq("status", "selected")
          .order("match_score", { ascending: false, nullsFirst: false })
          .limit(20),
      ]);
      setStats({
        jobs: jobs.count ?? 0,
        candidates: candidates.count ?? 0,
        shortlisted: shortlisted.count ?? 0,
        interviewed: interviewed.count ?? 0,
      });
      setRecent(recentJobs.data ?? []);
      setSelected((sel.data as any) ?? []);
    })();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const n = await exportCandidatesXlsx({ scope: "selected", filename: `selected-candidates-${new Date().toISOString().slice(0, 10)}.xlsx` });
      toast.success(`Exported ${n} selected candidate(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally { setExporting(false); }
  };

  const cards = [
    { label: "Open jobs", value: stats.jobs, icon: Briefcase },
    { label: "Total candidates", value: stats.candidates, icon: Users },
    { label: "Shortlisted", value: stats.shortlisted, icon: CheckCircle2 },
    { label: "Interviewed", value: stats.interviewed, icon: Mic },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your hiring pipeline.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5 shadow-[var(--shadow-soft)]">
            <c.icon className="w-5 h-5 text-accent mb-3" />
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Selected Candidates */}
      <div className="rounded-xl border bg-card shadow-[var(--shadow-soft)] mb-8">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-success" />
            <h2 className="font-semibold">Selected Candidates</h2>
            <span className="text-xs text-muted-foreground">({selected.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || selected.length === 0}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Excel report
          </Button>
        </div>
        {selected.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No selected candidates yet. After interviews, mark candidates as "Select" to add them here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Match</th>
                <th className="text-left px-4 py-3 font-medium">Interview</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {selected.map((c) => {
                const iv = c.interviews?.[0];
                return (
                  <tr key={c.id} className="hover:bg-secondary/30">
                    <td className="px-6 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.jobs?.title ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{c.match_score ?? "—"}%</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{iv?.overall_score ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-xs font-medium">
                        ✅ Selected
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border bg-card shadow-[var(--shadow-soft)]">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Recent jobs</h2>
          <Link to="/jobs" className="text-sm text-accent">View all →</Link>
        </div>
        <div className="divide-y">
          {recent.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No jobs yet. <Link to="/jobs" className="text-accent">Create your first job →</Link>
            </div>
          ) : (
            recent.map((j) => (
              <Link
                key={j.id}
                to="/jobs/$jobId"
                params={{ jobId: j.id }}
                className="flex items-center justify-between px-6 py-3 hover:bg-secondary/50 transition-colors"
              >
                <span className="font-medium">{j.title}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

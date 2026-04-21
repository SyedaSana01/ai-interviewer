import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Users, CheckCircle2, Mic } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — HireFlow" }] }),
});

function Dashboard() {
  const [stats, setStats] = useState({ jobs: 0, candidates: 0, shortlisted: 0, interviewed: 0 });
  const [recent, setRecent] = useState<{ id: string; title: string; created_at: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [jobs, candidates, shortlisted, interviewed, recentJobs] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "shortlisted"),
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "interviewed"),
        supabase.from("jobs").select("id, title, created_at").order("created_at", { ascending: false }).limit(5),
      ]);
      setStats({
        jobs: jobs.count ?? 0,
        candidates: candidates.count ?? 0,
        shortlisted: shortlisted.count ?? 0,
        interviewed: interviewed.count ?? 0,
      });
      setRecent(recentJobs.data ?? []);
    })();
  }, []);

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

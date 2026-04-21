import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, FileText, Mail, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "HireFlow — AI-powered hiring automation" },
      {
        name: "description",
        content:
          "Automate resume screening, AI voice interviews, and candidate decisions. The AI recruiter assistant for modern teams.",
      },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[image:var(--gradient-accent)] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-semibold tracking-tight">HireFlow</span>
          </Link>
          <Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[image:var(--gradient-hero)] opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.7_0.18_30/0.4),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-6 py-28 text-primary-foreground">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-medium border border-white/20">
              <Sparkles className="w-3.5 h-3.5" /> AI Recruiter Assistant
            </span>
            <h1 className="mt-6 text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Hire 10× faster.<br />
              <span className="text-accent">From JD to offer, automated.</span>
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-xl">
              Upload resumes, let AI shortlist candidates, conduct voice interviews, and recommend who to hire — all
              from a single dashboard.
            </p>
            <div className="mt-10 flex gap-3">
              <Button size="lg" variant="secondary" onClick={() => navigate({ to: "/auth" })}>
                Start hiring free <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { icon: FileText, title: "AI Resume Screening", body: "Parse & rank candidates against any JD." },
            { icon: Users, title: "Smart Tracker", body: "One dashboard for every candidate, every stage." },
            { icon: Bot, title: "AI Voice Interviews", body: "Candidates speak. AI asks. We score." },
            { icon: Mail, title: "Auto Emails", body: "Invites & decisions sent automatically." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-[var(--shadow-soft)]">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

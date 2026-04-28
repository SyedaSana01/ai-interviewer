import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_app/jobs/")({
  component: JobsList,
  head: () => ({ meta: [{ title: "Jobs — HireFlow" }] }),
});

function JobsList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<{ id: string; title: string; role_type: string | null; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roleType, setRoleType] = useState("");
  const [duration, setDuration] = useState("30");
  const [interviewType, setInterviewType] = useState("mixed");
  const [difficulty, setDifficulty] = useState("medium");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("jobs")
      .select("id, title, role_type, created_at")
      .order("created_at", { ascending: false });
    setJobs(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          title,
          description,
          role_type: roleType || null,
          recruiter_id: u.user.id,
          interview_duration: parseInt(duration, 10),
          interview_type: interviewType,
          difficulty,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Job created");
      setOpen(false);
      setTitle(""); setDescription(""); setRoleType("");
      setDuration("30"); setInterviewType("mixed"); setDifficulty("medium");
      navigate({ to: "/jobs/$jobId", params: { jobId: data.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setCreating(false); }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">Create roles and start screening candidates.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New job</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create job</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Job title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Senior Frontend Engineer" />
              </div>
              <div className="space-y-1.5">
                <Label>Role type (optional)</Label>
                <Input value={roleType} onChange={(e) => setRoleType(e.target.value)} placeholder="Full-time, Remote" />
              </div>
              <div className="space-y-1.5">
                <Label>Job description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={6}
                  placeholder="Describe the role, requirements, and ideal candidate..."
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Duration</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">⚡ 1 min (quick)</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={interviewType} onValueChange={setInterviewType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Creating…" : "Create job"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center shadow-[var(--shadow-soft)]">
          <Briefcase className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold">No jobs yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first job to start screening candidates.</p>
          <Button className="mt-6" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New job
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((j) => (
            <Link
              key={j.id}
              to="/jobs/$jobId"
              params={{ jobId: j.id }}
              className="rounded-xl border bg-card p-5 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-elev)] transition-all"
            >
              <h3 className="font-semibold">{j.title}</h3>
              {j.role_type && <p className="text-xs text-muted-foreground mt-1">{j.role_type}</p>}
              <p className="text-xs text-muted-foreground mt-3">
                Created {new Date(j.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

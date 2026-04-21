import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Sparkles, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/interview/$token")({
  component: InterviewPage,
  head: () => ({ meta: [{ title: "AI Interview — HireFlow" }] }),
});

interface Ctx {
  candidateName: string;
  jobTitle: string;
  alreadyCompleted: boolean;
}

function InterviewPage() {
  const { token } = Route.useParams();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(6);
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);

  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const supportsSpeech = typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-interview-context", { body: { token } });
      if (error || !data || data.error) {
        toast.error("This interview link is invalid or expired.");
      } else {
        setCtx(data);
      }
      setLoading(false);
    })();
  }, [token]);

  // Speak question via SpeechSynthesis
  useEffect(() => {
    if (question && typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(question);
      u.rate = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }, [question]);

  const startInterview = async () => {
    setStarted(true);
    setThinking(true);
    const { data, error } = await supabase.functions.invoke("interview-turn", { body: { token, action: "start" } });
    setThinking(false);
    if (error || data?.error) { toast.error(data?.error || "Failed to start"); return; }
    setQuestion(data.question);
    setQuestionNumber(data.questionNumber);
    setTotalQuestions(data.totalQuestions);
  };

  const submitAnswer = async () => {
    if (!answer.trim()) { toast.error("Please give an answer."); return; }
    stopListening();
    setThinking(true);
    const { data, error } = await supabase.functions.invoke("interview-turn", {
      body: { token, action: "answer", answer },
    });
    setThinking(false);
    setAnswer("");
    if (error || data?.error) { toast.error(data?.error || "Failed"); return; }
    if (data.finished) { setFinished(true); return; }
    setQuestion(data.question);
    setQuestionNumber(data.questionNumber);
  };

  const endInterview = async () => {
    setThinking(true);
    await supabase.functions.invoke("interview-turn", { body: { token, action: "end" } });
    setThinking(false);
    setFinished(true);
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += transcript + " ";
        else interim += transcript;
      }
      setAnswer((finalText + interim).trim());
    };
    r.onerror = (e: any) => {
      console.warn("speech error", e);
      setListening(false);
    };
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
    setListening(true);
  };
  const stopListening = () => {
    recogRef.current?.stop();
    setListening(false);
  };

  if (loading) return <Loading text="Loading interview…" />;
  if (!ctx) return <CenteredCard title="Invalid interview link" body="This link may have expired or never existed." />;
  if (ctx.alreadyCompleted || finished)
    return (
      <CenteredCard
        icon={<CheckCircle2 className="w-12 h-12 text-success mb-4" />}
        title="Interview complete"
        body="Thank you for your time. The recruiter will review your interview and be in touch."
      />
    );

  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)] text-primary-foreground">
      <Toaster richColors position="top-right" />
      <div className="max-w-2xl mx-auto p-6 md:p-12 min-h-screen flex flex-col">
        <div className="flex items-center gap-2 mb-12">
          <div className="w-8 h-8 rounded-lg bg-[image:var(--gradient-accent)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent-foreground" />
          </div>
          <span className="font-semibold">HireFlow</span>
        </div>

        {!started ? (
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-4xl font-bold tracking-tight">Hi {ctx.candidateName} 👋</h1>
            <p className="mt-4 text-lg text-white/80">
              You're about to interview for the <strong>{ctx.jobTitle}</strong> role.
              <br />Our AI will ask you {totalQuestions} questions. You can speak or type your answers.
            </p>
            <div className="mt-8 rounded-xl bg-white/5 backdrop-blur border border-white/20 p-5 text-sm text-white/80 space-y-2">
              <p>📍 Find a quiet place — this takes about 10–15 minutes.</p>
              <p>🎙️ {supportsSpeech ? "Voice transcription is supported in this browser." : "Voice unavailable here — typing will work."}</p>
              <p>🔒 Your answers are private to the hiring team.</p>
            </div>
            <Button size="lg" className="mt-10 self-start bg-accent hover:bg-accent/90" onClick={startInterview}>
              Start interview
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="text-xs uppercase tracking-wider text-white/60 mb-3">
              Question {questionNumber} of {totalQuestions}
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur border border-white/20 p-6 mb-6 min-h-[120px]">
              {thinking && !question ? (
                <div className="flex items-center gap-2 text-white/70"><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</div>
              ) : (
                <p className="text-lg leading-relaxed">{question}</p>
              )}
            </div>

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={listening ? "Listening… speak your answer" : "Type your answer or click the mic to speak"}
              className="flex-1 min-h-[160px] rounded-xl bg-white/5 backdrop-blur border border-white/20 p-4 text-white placeholder:text-white/40 outline-none focus:border-accent resize-none"
              disabled={thinking}
            />

            <div className="mt-4 flex flex-wrap gap-2 items-center">
              {supportsSpeech && (
                listening ? (
                  <Button onClick={stopListening} variant="secondary">
                    <MicOff className="w-4 h-4 mr-2" /> Stop recording
                  </Button>
                ) : (
                  <Button onClick={startListening} variant="secondary">
                    <Mic className="w-4 h-4 mr-2" /> Speak answer
                  </Button>
                )
              )}
              <Button onClick={submitAnswer} disabled={thinking || !answer.trim()} className="bg-accent hover:bg-accent/90 ml-auto">
                {thinking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {questionNumber >= totalQuestions ? "Submit & finish" : "Submit answer"}
              </Button>
              <Button variant="ghost" onClick={endInterview} disabled={thinking} className="text-white/70 hover:text-white hover:bg-white/10">
                End early
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">{text}</div>;
}
function CenteredCard({ icon, title, body }: { icon?: React.ReactNode; title: string; body: string }) {
  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)] flex items-center justify-center p-6">
      <div className="bg-card rounded-xl p-10 max-w-md text-center shadow-[var(--shadow-elev)]">
        {icon && <div className="flex justify-center">{icon}</div>}
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

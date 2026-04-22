import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Sparkles, CheckCircle2, Loader2, Camera, ShieldAlert, Video } from "lucide-react";

export const Route = createFileRoute("/interview/$token")({
  component: InterviewPage,
  head: () => ({ meta: [{ title: "AI Interview — HireFlow" }] }),
});

interface Ctx {
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  candidateInterviewToken: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  alreadyCompleted: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function InterviewPage() {
  const { token } = Route.useParams();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [permsGranted, setPermsGranted] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(6);
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const supportsSpeech = typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastSpeechAtRef = useRef<number>(Date.now());
  const violationCountRef = useRef<number>(0);

  // ---- Load context
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-interview-context", { body: { token } });
      if (error || !data || data.error) {
        toast.error(data?.error || "This interview link is invalid or expired.");
      } else {
        setCtx(data);
      }
      setLoading(false);
    })();
  }, [token]);

  // ---- Speak question
  useEffect(() => {
    if (question && typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(question);
      u.rate = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }, [question]);

  const showWarning = useCallback((msg: string) => {
    setWarning(msg);
    violationCountRef.current += 1;
    setTimeout(() => setWarning((w) => (w === msg ? null : w)), 4000);
  }, []);

  const logViolation = useCallback(async (kind: string, detail?: string) => {
    try {
      await supabase.functions.invoke("log-violation", { body: { token, kind, detail } });
    } catch (e) { console.warn("log-violation failed", e); }
  }, [token]);

  // ---- Request camera + mic
  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setPermsGranted(true);
    } catch (e) {
      toast.error("Camera & microphone access is required for this interview.");
      console.error(e);
    }
  };

  // ---- Tab/visibility, blur, camera-off, silence detection
  useEffect(() => {
    if (!started || finished) return;

    const onVis = () => {
      if (document.hidden) {
        showWarning("⚠️ Tab switching detected — please stay on this page.");
        logViolation("tab_switch", "document hidden");
      }
    };
    const onBlur = () => {
      showWarning("⚠️ Window lost focus — please return to the interview.");
      logViolation("window_blur");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);

    // camera-off detection
    const cameraInterval = setInterval(() => {
      const track = streamRef.current?.getVideoTracks()?.[0];
      if (!track || track.readyState !== "live" || track.muted || !track.enabled) {
        showWarning("⚠️ Camera is off — please enable it to continue.");
        logViolation("camera_off");
      }
    }, 5000);

    // long silence detection (no answer typed/spoken in 90s)
    const silenceInterval = setInterval(() => {
      const since = Date.now() - lastSpeechAtRef.current;
      if (since > 90_000) {
        showWarning("⚠️ Long silence detected — please answer or click Skip.");
        logViolation("long_silence", `${Math.round(since / 1000)}s`);
        lastSpeechAtRef.current = Date.now();
      }
    }, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      clearInterval(cameraInterval);
      clearInterval(silenceInterval);
    };
  }, [started, finished, showWarning, logViolation]);

  useEffect(() => { if (answer.trim().length > 0) lastSpeechAtRef.current = Date.now(); }, [answer]);

  // ---- Start recording
  const startRecording = () => {
    if (!streamRef.current) return;
    try {
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(2000); // chunk every 2s
      recorderRef.current = rec;
    } catch (e) {
      console.warn("MediaRecorder failed", e);
    }
  };

  const stopRecordingAndUpload = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    return new Promise<void>((resolve) => {
      rec.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const url = `${SUPABASE_URL}/functions/v1/upload-recording?token=${encodeURIComponent(token)}`;
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "video/webm", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            body: blob,
          });
        } catch (e) { console.warn("recording upload failed", e); }
        finally { resolve(); }
      };
      rec.stop();
    });
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // ---- Interview API
  const startInterview = async () => {
    setStarted(true);
    setThinking(true);
    startRecording();
    const { data, error } = await supabase.functions.invoke("interview-turn", { body: { token, action: "start" } });
    setThinking(false);
    if (error || data?.error) { toast.error(data?.error || "Failed to start"); return; }
    setQuestion(data.question);
    setQuestionNumber(data.questionNumber);
    setTotalQuestions(data.totalQuestions);
    lastSpeechAtRef.current = Date.now();
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
    if (data.finished) { await finishInterview(); return; }
    setQuestion(data.question);
    setQuestionNumber(data.questionNumber);
    lastSpeechAtRef.current = Date.now();
  };

  const finishInterview = async () => {
    setThinking(true);
    await stopRecordingAndUpload();
    cleanupStream();
    setThinking(false);
    setFinished(true);
  };

  const endInterview = async () => {
    setThinking(true);
    await supabase.functions.invoke("interview-turn", { body: { token, action: "end" } });
    await finishInterview();
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
      lastSpeechAtRef.current = Date.now();
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
    setListening(true);
  };
  const stopListening = () => { recogRef.current?.stop(); setListening(false); };

  // ---- Cleanup
  useEffect(() => () => { cleanupStream(); }, []);

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
      <div className="max-w-4xl mx-auto p-6 md:p-10 min-h-screen flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[image:var(--gradient-accent)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent-foreground" />
          </div>
          <span className="font-semibold">HireFlow</span>
        </div>

        {!started ? (
          <PreInterviewScreen
            ctx={ctx}
            permsGranted={permsGranted}
            onRequestPerms={requestPermissions}
            onStart={startInterview}
            videoRef={videoRef}
            supportsSpeech={!!supportsSpeech}
            totalQuestions={totalQuestions}
          />
        ) : (
          <InterviewActive
            ctx={ctx}
            videoRef={videoRef}
            warning={warning}
            question={question}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            thinking={thinking}
            answer={answer}
            setAnswer={setAnswer}
            listening={listening}
            startListening={startListening}
            stopListening={stopListening}
            submitAnswer={submitAnswer}
            endInterview={endInterview}
            supportsSpeech={!!supportsSpeech}
          />
        )}
      </div>
    </div>
  );
}

function PreInterviewScreen({ ctx, permsGranted, onRequestPerms, onStart, videoRef, supportsSpeech, totalQuestions }: {
  ctx: Ctx; permsGranted: boolean; onRequestPerms: () => void; onStart: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>; supportsSpeech: boolean; totalQuestions: number;
}) {
  const start = ctx.scheduledAt ? new Date(ctx.scheduledAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "Available now";
  return (
    <div className="grid md:grid-cols-2 gap-6 flex-1">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Hi {ctx.candidateName} 👋</h1>
        <p className="mt-3 text-lg text-white/80">Interview for <strong>{ctx.jobTitle}</strong></p>
        <div className="mt-6 space-y-2 text-sm text-white/80">
          <div>📅 <strong>Start:</strong> {start}</div>
          <div>⏱ <strong>Duration:</strong> ~{ctx.durationMinutes} min ({totalQuestions} questions)</div>
        </div>

        <div className="mt-6 rounded-xl bg-white/5 backdrop-blur border border-white/20 p-5 text-sm text-white/85 space-y-2">
          <div className="font-semibold text-white">📜 Rules</div>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>Keep your <strong>camera ON</strong> for the entire interview</li>
            <li>Do not switch tabs or leave this window</li>
            <li>No external help — no notes, AI, or other people</li>
            <li>Stay in a quiet environment</li>
            <li>{supportsSpeech ? "You may speak or type your answers" : "You will type your answers (voice not supported in this browser)"}</li>
          </ul>
          <div className="text-xs text-white/60 pt-2">Your webcam is recorded for the recruiter to review.</div>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="aspect-video bg-black/40 rounded-xl border border-white/20 overflow-hidden relative">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          {!permsGranted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3">
              <Camera className="w-12 h-12" />
              <p className="text-sm">Camera preview will appear here</p>
            </div>
          )}
        </div>
        {!permsGranted ? (
          <Button size="lg" className="mt-5 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={onRequestPerms}>
            <Camera className="w-4 h-4 mr-2" /> Enable Camera & Microphone
          </Button>
        ) : (
          <Button size="lg" className="mt-5 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={onStart}>
            🎙️ Start Interview
          </Button>
        )}
      </div>
    </div>
  );
}

function InterviewActive(props: {
  ctx: Ctx;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  warning: string | null;
  question: string | null;
  questionNumber: number;
  totalQuestions: number;
  thinking: boolean;
  answer: string;
  setAnswer: (s: string) => void;
  listening: boolean;
  startListening: () => void;
  stopListening: () => void;
  submitAnswer: () => void;
  endInterview: () => void;
  supportsSpeech: boolean;
}) {
  const { videoRef, warning, question, questionNumber, totalQuestions, thinking, answer, setAnswer,
    listening, startListening, stopListening, submitAnswer, endInterview, supportsSpeech } = props;
  return (
    <div className="flex-1 grid md:grid-cols-[1fr_240px] gap-6">
      <div className="flex flex-col">
        {warning && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-destructive/20 border border-destructive/40 px-4 py-2.5 text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{warning}</span>
          </div>
        )}
        <div className="text-xs uppercase tracking-wider text-white/60 mb-3">
          Question {questionNumber} of {totalQuestions}
        </div>
        <div className="rounded-xl bg-white/10 backdrop-blur border border-white/20 p-6 mb-4 min-h-[120px]">
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
              <Button onClick={stopListening} variant="secondary"><MicOff className="w-4 h-4 mr-2" /> Stop</Button>
            ) : (
              <Button onClick={startListening} variant="secondary"><Mic className="w-4 h-4 mr-2" /> Speak</Button>
            )
          )}
          <Button onClick={submitAnswer} disabled={thinking || !answer.trim()} className="bg-accent hover:bg-accent/90 text-accent-foreground ml-auto">
            {thinking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {questionNumber >= totalQuestions ? "Submit & finish" : "Submit answer"}
          </Button>
          <Button variant="ghost" onClick={endInterview} disabled={thinking} className="text-white/70 hover:text-white hover:bg-white/10">
            End early
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="aspect-video bg-black/40 rounded-xl border border-white/20 overflow-hidden relative">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground px-2 py-1 rounded-md text-[10px] font-semibold">
            <Video className="w-3 h-3" /> REC
          </div>
        </div>
        <div className="text-xs text-white/60 text-center">Camera must remain on throughout</div>
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

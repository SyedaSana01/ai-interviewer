import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Sparkles, CheckCircle2, Loader2, Camera, ShieldAlert,
  Send, RotateCcw, Volume2, CameraOff, Wifi, ShieldCheck, MessageSquare,
} from "lucide-react";

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
  interviewType: string;
  difficulty: string;
  alreadyCompleted: boolean;
}

const TYPE_LABEL: Record<string, string> = { technical: "Technical", hr: "HR / Behavioural", mixed: "Mixed" };
const DIFF_LABEL: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

// Strict mode: ANY violation immediately terminates. Kept for completeness/UX labels.
const VIOLATION_LABEL: Record<string, string> = {
  tab_switch: "Tab/window switching detected",
  window_blur: "Interview window lost focus",
  camera_off: "Camera was turned off",
  mic_off: "Microphone was muted",
  long_silence: "Long inactivity / no response",
  no_face: "No face detected on camera",
  manual: "Manually ended",
};

function fmtTime(sec: number) {
  const m = Math.max(0, Math.floor(sec / 60));
  const s = Math.max(0, sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [integrity, setIntegrity] = useState(100);

  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const supportsSpeech = typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const supportsTTS = typeof window !== "undefined" && "speechSynthesis" in window;

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastSpeechAtRef = useRef<number>(Date.now());

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

  // ---- Speak question via TTS (best-effort; UI still works without audio)
  useEffect(() => {
    if (!question || !supportsTTS) return;
    const u = new SpeechSynthesisUtterance(question);
    u.rate = 0.97;
    u.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(v => /en-(US|GB|AU)/i.test(v.lang) && /Samantha|Jenny|Aria|Sonia|Libby|Natasha|Google US English|Google UK English Female/i.test(v.name))
      ?? voices.find(v => /en-(US|GB|AU)/i.test(v.lang) && /female/i.test(v.name))
      ?? voices.find(v => /en-(US|GB|AU)/i.test(v.lang))
      ?? voices.find(v => /en/i.test(v.lang));
    if (preferred) u.voice = preferred;
    u.onstart = () => setAiSpeaking(true);
    u.onend = () => setAiSpeaking(false);
    u.onerror = () => setAiSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return () => { window.speechSynthesis.cancel(); setAiSpeaking(false); };
  }, [question, supportsTTS]);

  const showWarning = useCallback((msg: string) => {
    setWarning(msg);
    setTimeout(() => setWarning((w) => (w === msg ? null : w)), 4000);
  }, []);

  const logViolation = useCallback(async (kind: string, detail?: string) => {
    setIntegrity((s) => Math.max(0, s - (PENALTY[kind] ?? 5)));
    try {
      await supabase.functions.invoke("log-violation", { body: { token, kind, detail } });
    } catch (e) { console.warn("log-violation failed", e); }
  }, [token]);

  // ---- Camera + mic permissions
  const attachStream = (s: MediaStream) => {
    streamRef.current = s;
    [videoRef.current, previewVideoRef.current].forEach((el) => {
      if (el) {
        el.srcObject = s;
        el.play().catch(() => {});
      }
    });
    setCamActive(s.getVideoTracks().some(t => t.enabled && t.readyState === "live"));
    setMicActive(s.getAudioTracks().some(t => t.enabled && t.readyState === "live"));
  };

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      attachStream(stream);
      setPermsGranted(true);
    } catch (e) {
      toast.error("Camera & microphone access is required for this interview.");
      console.error(e);
    }
  };

  useEffect(() => {
    if (started && streamRef.current && previewVideoRef.current) {
      previewVideoRef.current.srcObject = streamRef.current;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [started]);

  // ---- Proctoring: tab/visibility, blur, camera-off, silence
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

    let cameraOffStreak = 0;
    const cameraInterval = setInterval(() => {
      const vTrack = streamRef.current?.getVideoTracks()?.[0];
      const aTrack = streamRef.current?.getAudioTracks()?.[0];
      const camOk = !!vTrack && vTrack.readyState === "live" && !vTrack.muted && vTrack.enabled;
      const micOk = !!aTrack && aTrack.readyState === "live" && aTrack.enabled;
      setCamActive(camOk);
      setMicActive(micOk);
      if (!camOk) {
        cameraOffStreak += 1;
        showWarning("⚠️ Camera is off — please enable it to continue.");
        // Penalize once per ~10s of camera-off
        if (cameraOffStreak === 1 || cameraOffStreak % 2 === 0) logViolation("camera_off");
      } else {
        cameraOffStreak = 0;
      }
    }, 5000);

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

  // ---- Recording
  const startRecording = () => {
    if (!streamRef.current) return;
    try {
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(2000);
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

  // ---- Interview flow
  const startInterview = async () => {
    setStarted(true);
    setThinking(true);
    startRecording();
    if (ctx) setSecondsLeft(ctx.durationMinutes * 60);
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

  const endInterview = useCallback(async () => {
    setThinking(true);
    await supabase.functions.invoke("interview-turn", { body: { token, action: "end" } });
    await finishInterview();
  }, [token]);

  // ---- Countdown
  useEffect(() => {
    if (!started || finished || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      toast.info("Time is up — submitting your interview.");
      endInterview();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [started, finished, secondsLeft, endInterview]);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    let finalText = answer ? answer + " " : "";
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

  const retryAnswer = () => {
    stopListening();
    setAnswer("");
    setTimeout(() => startListening(), 150);
  };

  const replayQuestion = () => {
    if (!question || !supportsTTS) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(question);
    u.onstart = () => setAiSpeaking(true);
    u.onend = () => setAiSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  useEffect(() => () => { cleanupStream(); window.speechSynthesis?.cancel(); }, []);

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
      <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[image:var(--gradient-accent)] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-semibold">HireFlow</span>
          </div>
          {started && (
            <ProctorBar camActive={camActive} micActive={micActive} secondsLeft={secondsLeft} integrity={integrity} />
          )}
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
            previewVideoRef={previewVideoRef}
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
            retryAnswer={retryAnswer}
            replayQuestion={replayQuestion}
            supportsSpeech={!!supportsSpeech}
            supportsTTS={supportsTTS}
            aiSpeaking={aiSpeaking}
            camActive={camActive}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Pre-interview Screen
// ============================================================================
function PreInterviewScreen({ ctx, permsGranted, onRequestPerms, onStart, videoRef, supportsSpeech, totalQuestions }: {
  ctx: Ctx; permsGranted: boolean; onRequestPerms: () => void; onStart: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>; supportsSpeech: boolean; totalQuestions: number;
}) {
  const start = ctx.scheduledAt ? new Date(ctx.scheduledAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "Available now";
  const isDemo = ctx.durationMinutes <= 2;
  return (
    <div className="grid md:grid-cols-2 gap-6 flex-1">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Hi {ctx.candidateName} 👋</h1>
        <p className="mt-3 text-lg text-white/80">Interview for <strong>{ctx.jobTitle}</strong></p>
        {isDemo && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent/20 border border-accent/40 px-3 py-1 text-xs font-semibold text-accent">
            ⚡ Quick Demo Interview · 1 min
          </div>
        )}
        <div className="mt-6 space-y-2 text-sm text-white/80">
          <div>📅 <strong>Start:</strong> {start}</div>
          <div>⏱ <strong>Duration:</strong> ~{ctx.durationMinutes} min ({totalQuestions} questions)</div>
          <div>🎯 <strong>Type:</strong> {TYPE_LABEL[ctx.interviewType] ?? "Mixed"}</div>
          <div>📊 <strong>Difficulty:</strong> {DIFF_LABEL[ctx.difficulty] ?? "Medium"}</div>
        </div>

        <div className="mt-6 rounded-xl bg-white/5 backdrop-blur border border-white/20 p-5 text-sm text-white/85 space-y-2">
          <div className="font-semibold text-white">📜 Rules</div>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>Keep your <strong>camera ON</strong> for the entire interview</li>
            <li>Do not switch tabs or leave this window</li>
            <li>No external help — no notes, AI, or other people</li>
            <li>Stay in a quiet environment</li>
            <li>{supportsSpeech ? "Speak your answers — we'll show a live transcript" : "You will type your answers (voice not supported in this browser)"}</li>
          </ul>
          <div className="text-xs text-white/60 pt-2">Your webcam is recorded for the recruiter to review.</div>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="aspect-video bg-black/40 rounded-xl border border-white/20 overflow-hidden relative">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
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

// ============================================================================
// Active Interview — clean text-based interviewer card (no avatar)
// ============================================================================
function InterviewActive(props: {
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;
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
  retryAnswer: () => void;
  replayQuestion: () => void;
  supportsSpeech: boolean;
  supportsTTS: boolean;
  aiSpeaking: boolean;
  camActive: boolean;
}) {
  const { previewVideoRef, warning, question, questionNumber, totalQuestions, thinking, answer, setAnswer,
    listening, startListening, stopListening, submitAnswer, endInterview, retryAnswer, replayQuestion,
    supportsSpeech, supportsTTS, aiSpeaking, camActive } = props;

  return (
    <div className="flex-1 flex flex-col gap-4 relative">
      {warning && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/20 border border-destructive/40 px-4 py-2.5 text-sm animate-fade-in">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      <div className="grid md:grid-cols-[1.1fr_1fr] gap-4 flex-1 min-h-0">
        {/* AI Interviewer card — clean text-based, no avatar */}
        <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/20 flex flex-col min-h-[360px] relative overflow-hidden p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="text-[10px] font-bold uppercase tracking-wider bg-black/30 text-white/90 px-2 py-1 rounded">
              Question {questionNumber} of {totalQuestions}
            </div>
            <div className="flex items-center gap-1.5 bg-black/30 text-white/90 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
              <Wifi className="w-3 h-3 text-success" /> Live
            </div>
          </div>

          {/* Speaking indicator (replaces avatar) */}
          <div className="flex flex-col items-center justify-center mb-6">
            <SpeakingPulse speaking={aiSpeaking} />
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${aiSpeaking ? "bg-accent animate-pulse" : "bg-white/40"}`} />
              {aiSpeaking ? "Sarah is speaking…" : "Sarah · AI Interviewer"}
            </div>
          </div>

          {/* Question text */}
          <div className="flex-1 flex items-start">
            <div className="w-full rounded-xl bg-black/20 border border-white/10 p-5">
              {thinking && !question ? (
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                </div>
              ) : question ? (
                <>
                  <div className="flex items-start gap-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    <MessageSquare className="w-3 h-3 mt-0.5" /> Question
                  </div>
                  <p className="text-base md:text-lg text-white leading-relaxed">{question}</p>
                </>
              ) : null}
            </div>
          </div>

          {question && supportsTTS && (
            <button
              onClick={replayQuestion}
              className="mt-3 self-start inline-flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white"
            >
              <Volume2 className="w-3 h-3" /> Replay question
            </button>
          )}
        </div>

        {/* Live Transcript Panel */}
        <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/20 p-5 flex flex-col min-h-[360px]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${listening ? "bg-destructive animate-pulse" : "bg-white/40"}`} />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-white/80">
                {listening ? "Listening…" : "Your answer"}
              </h2>
            </div>
            <span className="text-xs text-white/50">{answer.length} chars</span>
          </div>

          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={listening
              ? "Speak naturally — your words will appear here…"
              : supportsSpeech
                ? "Click the mic to speak, or type your answer here."
                : "Type your answer here."}
            className="flex-1 min-h-[160px] rounded-xl bg-black/20 border border-white/10 p-4 text-white placeholder:text-white/40 outline-none focus:border-accent resize-none text-sm leading-relaxed"
            disabled={thinking}
          />

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {supportsSpeech && (
              listening ? (
                <Button onClick={stopListening} variant="secondary" size="sm">
                  <MicOff className="w-4 h-4 mr-2" /> Stop
                </Button>
              ) : (
                <Button onClick={startListening} variant="secondary" size="sm">
                  <Mic className="w-4 h-4 mr-2" /> Speak
                </Button>
              )
            )}
            {supportsSpeech && answer && (
              <Button onClick={retryAnswer} variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10">
                <RotateCcw className="w-4 h-4 mr-2" /> Retry
              </Button>
            )}
            <Button
              onClick={submitAnswer}
              disabled={thinking || !answer.trim()}
              className="bg-accent hover:bg-accent/90 text-accent-foreground ml-auto"
              size="sm"
            >
              {thinking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              {questionNumber >= totalQuestions ? "Submit & finish" : "Send answer"}
            </Button>
          </div>
          <Button variant="ghost" onClick={endInterview} disabled={thinking} className="mt-2 text-xs text-white/50 hover:text-white hover:bg-white/10 self-end h-7">
            End interview early
          </Button>
        </div>
      </div>

      {/* Floating candidate camera */}
      <div className="fixed bottom-4 right-4 w-44 md:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/30 shadow-[var(--shadow-elev)] bg-black z-50">
        <video ref={previewVideoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-destructive/90 text-destructive-foreground px-1.5 py-0.5 rounded text-[10px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> REC
        </div>
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] text-white">
          <span className="bg-black/60 px-1.5 py-0.5 rounded">You</span>
          {!camActive && (
            <span className="bg-destructive/90 px-1.5 py-0.5 rounded flex items-center gap-1">
              <CameraOff className="w-3 h-3" /> off
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Speaking pulse — clean SVG audio bars (replaces broken avatar)
// ============================================================================
function SpeakingPulse({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Pulsing rings */}
      <div className={`absolute w-32 h-32 rounded-full border-2 border-accent/30 ${speaking ? "animate-ping" : ""}`} />
      <div className={`absolute w-24 h-24 rounded-full border-2 border-accent/40 ${speaking ? "animate-pulse" : ""}`} />
      {/* Center disc with audio bars */}
      <div className="relative w-20 h-20 rounded-full bg-[image:var(--gradient-accent)] flex items-center justify-center shadow-[var(--shadow-elev)]">
        <div className="flex items-end gap-1 h-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1.5 bg-accent-foreground rounded-full origin-bottom"
              style={{
                height: speaking ? `${30 + Math.sin((Date.now() / 200) + i) * 30 + 30}%` : "30%",
                animation: speaking ? `pulseBar 0.6s ease-in-out ${i * 0.08}s infinite alternate` : "none",
              }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes pulseBar {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Top proctoring status bar
// ============================================================================
function ProctorBar({ camActive, micActive, secondsLeft, integrity }: {
  camActive: boolean; micActive: boolean; secondsLeft: number | null; integrity: number;
}) {
  const lowTime = secondsLeft !== null && secondsLeft <= 60;
  const integrityColor =
    integrity >= 80 ? "bg-success/20 text-success-foreground border-success/30"
    : integrity >= 50 ? "bg-amber-500/20 text-amber-100 border-amber-500/40"
    : "bg-destructive/20 text-white border-destructive/40";
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${integrityColor}`} title="Integrity score — starts at 100, deducted on proctoring violations">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span className="font-mono font-semibold tabular-nums">{integrity}%</span>
      </div>
      <StatusPill ok={camActive} okLabel="Camera ON" badLabel="Camera OFF" Icon={camActive ? Camera : CameraOff} />
      <StatusPill ok={micActive} okLabel="Mic ON" badLabel="Mic OFF" Icon={micActive ? Mic : MicOff} />
      {secondsLeft !== null && (
        <div className={`font-mono font-semibold tabular-nums px-3 py-1 rounded-md ${lowTime ? "bg-destructive/30 text-white animate-pulse" : "bg-white/10 text-white/90"}`}>
          ⏱ {fmtTime(secondsLeft)}
        </div>
      )}
    </div>
  );
}

function StatusPill({ ok, okLabel, badLabel, Icon }: { ok: boolean; okLabel: string; badLabel: string; Icon: any }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${ok ? "bg-success/20 text-success-foreground border border-success/30" : "bg-destructive/20 text-white border border-destructive/40"}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{ok ? okLabel : badLabel}</span>
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

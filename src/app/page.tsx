'use client';

/**
 * K-SHAPED ECONOMY — VIDEO STUDIO
 * Prepares the voiceover, builds the frame-accurate timeline, previews the
 * video in real time, and renders the final YouTube-ready MP4 to disk,
 * frame by frame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import {
  AudioLines, Play, Pause, RotateCcw, Download, Clapperboard, ShieldCheck,
  Sparkles, Gauge, FileVideo, Image as ImageIcon, Copy, CheckCircle2, Loader2,
  Volume2, MonitorPlay, Wand2,
} from 'lucide-react';

import { drawFrame, drawIdleFrame } from '@/lib/engine/director';
import { renderVideo, pickSaveTarget, probeCapabilities, EncoderStats, CapabilityReport } from '@/lib/engine/encode';
import { prepareProject, PreparedProject, PipelineProgress, VoiceSettings } from '@/lib/engine/pipeline';
import { buildTimeline } from '@/lib/engine/timeline';
import { renderMix } from '@/lib/engine/audio';
import { drawThumbnail } from '@/lib/engine/thumbnail';
import { pickShortMoments, renderShort } from '@/lib/engine/shorts';
import {
  TITLE_OPTIONS, DESCRIPTION_BODY, DESCRIPTION_TAIL, KEY_SOURCES_LINE, TAGS, PINNED_COMMENT,
  NEXT_VIDEO_DEFAULT, VIDEO_TITLE,
} from '@/lib/engine/script-data';

type Phase = 'setup' | 'tts' | 'decode' | 'timeline' | 'mix' | 'ready' | 'rendering' | 'done';

const VOICES = [
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew — deep, warm, premium (recommended)' },
  { id: 'en-US-ChristopherMultilingualNeural', label: 'Christopher — documentary narrator' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian — confident, energetic' },
  { id: 'en-US-GuyMultilingualNeural', label: 'Guy — classic news anchor' },
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava — warm, premium female' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma — bright, friendly female' },
  { id: 'en-GB-RyanMultilingualNeural', label: 'Ryan — British, assured' },
  { id: 'en-GB-SoniaMultilingualNeural', label: 'Sonia — British, polished' },
];

const RESOLUTIONS = [
  { id: '1080p', label: '1080p — Full HD (recommended)', w: 1920, h: 1080 },
  { id: '720p', label: '720p — Lite (slower laptops)', w: 1280, h: 720 },
];

const FPS_OPTIONS = [
  { id: '30', label: '30 fps — standard' },
  { id: '24', label: '24 fps — cinematic' },
  { id: '60', label: '60 fps — ultra smooth (slower)' },
];

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function fmtEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function StudioPage() {
  const { toast } = useToast();

  // ── settings ──
  const [voice, setVoice] = useState<VoiceSettings>({ voice: 'en-US-AndrewMultilingualNeural', rate: -4, pitch: 0 });
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState('30');
  const [captions, setCaptions] = useState<'karaoke' | 'simple' | 'off'>('karaoke');
  const [bgmVolume, setBgmVolume] = useState(0.55);
  const [channelName, setChannelName] = useState('The Data Desk');
  const [nextVideoTitle, setNextVideoTitle] = useState(NEXT_VIDEO_DEFAULT);
  const [watermark, setWatermark] = useState(true);
  const [progressBar, setProgressBar] = useState(true);

  // ── pipeline state ──
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [prepared, setPrepared] = useState<PreparedProject | null>(null);
  const [renderStats, setRenderStats] = useState<EncoderStats | null>(null);
  const [caps, setCaps] = useState<CapabilityReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  // v5 (audit P1-1): true once the bundled Fraunces/Inter faces are loaded —
  // canvas text only uses @font-face families AFTER they finish loading, so
  // every draw before that silently falls back to Georgia/Segoe. The idle
  // loop, preview and the render itself all wait on this flag.
  const [fontsReady, setFontsReady] = useState(false);
  const [mixDirty, setMixDirty] = useState(false);
  const [fpsDirty, setFpsDirty] = useState(false);
  const [previewVoiceKey, setPreviewVoiceKey] = useState<string | null>(null);
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const [shortIdx, setShortIdx] = useState(0); // v3 (panel P2-1): Shorts picker

  // ── preview player ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [previewT, setPreviewT] = useState(0);
  const tRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const lastDrawnRef = useRef(-1);
  const wakeLockRef = useRef<any>(null);

  const renderOptions = useMemo(
    () => ({ captions, channelName, nextVideoTitle, watermark, progressBar }),
    [captions, channelName, nextVideoTitle, watermark, progressBar]
  );

  const addLog = useCallback((msg: string) => {
    setLogs((l) => [...l.slice(-80), `${new Date().toLocaleTimeString()} · ${msg}`]);
  }, []);

  // capability probe + idle canvas
  useEffect(() => {
    probeCapabilities(addLog).then(setCaps).catch(() => setCaps(null));
  }, [addLog]);

  // v5 (audit P1-1): load the bundled OFL faces BEFORE any canvas text is
  // drawn. document.fonts.load() resolves per face+weight; the explicit
  // 12px probe strings force the exact @font-face entries in globals.css
  // (400/600/700 × Fraunces + Inter). Headless/SSR-safe: only browsers
  // with document.fonts take this path; the flag stays false until then.
  useEffect(() => {
    let alive = true;
    const faces = [
      '400 12px "Fraunces"', '600 12px "Fraunces"', '700 12px "Fraunces"',
      '400 12px "Inter"', '600 12px "Inter"', '700 12px "Inter"',
    ];
    const go = async () => {
      try {
        if (typeof document !== 'undefined' && (document as any).fonts) {
          await Promise.all(faces.map((f) => (document as any).fonts.load(f, 'Kk0¾$%·—’')));
          await (document as any).fonts.ready;
        }
      } catch {
        // a failed load falls back to the system stack — never block the app
      }
      if (alive) setFontsReady(true);
    };
    go();
    return () => { alive = false; };
  }, []);

  // idle animation before timeline exists — waits for the bundled faces
  useEffect(() => {
    if (prepared || phase === 'rendering' || !fontsReady) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const c = canvasRef.current;
      if (c && lastDrawnRef.current !== -2) {
        const ctx = c.getContext('2d');
        if (ctx) drawIdleFrame(ctx, performance.now(), channelName || 'The Data Desk');
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [prepared, phase, channelName, fontsReady]);

  // ── prepare: TTS → timeline → mix ──
  const prepare = useCallback(async () => {
    if (phase !== 'setup' && phase !== 'ready' && phase !== 'done') return;
    setPhase('tts');
    setPrepared(null);
    setRenderStats(null);
    try {
      const p = await prepareProject(
        voice,
        { bgmVolume, voVolume: 0.95, fps: Number(fps) },
        (pr) => {
          setProgress(pr);
          setPhase(pr.phase as Phase);
        }
      );
      setPrepared(p);
      setMixDirty(false);
      setFpsDirty(false);
      tRef.current = 0;
      setPreviewT(0);
      toast({
        title: 'Project ready',
        description: `Runtime ${(p.timeline.durationMs / 60000).toFixed(1)} min · ${p.timeline.totalFrames.toLocaleString()} frames`,
      });
    } catch (e) {
      setPhase('setup');
      toast({
        title: 'Preparation failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, [phase, voice, bgmVolume, fps, toast]);

  // rebuild timeline/mix after setting changes (no new TTS)
  const rebuild = useCallback(async () => {
    if (!prepared) return;
    setPhase('mix');
    try {
      const timeline = buildTimeline(prepared.manifest, Number(fps));
      const mixBuffer = await renderMix({
        timeline,
        voBuffers: prepared.voBuffers,
        bgmVolume,
        voVolume: 0.95,
      });
      setPrepared({ ...prepared, timeline, mixBuffer });
      setMixDirty(false);
      setFpsDirty(false);
      toast({ title: 'Updated', description: 'Timeline and mix rebuilt with your new settings.' });
    } catch (e) {
      toast({ title: 'Rebuild failed', description: String(e), variant: 'destructive' });
    } finally {
      setPhase('ready');
    }
  }, [prepared, fps, bgmVolume, toast]);

  // mark dirty when settings that need re-mix change
  useEffect(() => {
    if (prepared) setMixDirty(true);
  }, [bgmVolume]);
  useEffect(() => {
    if (prepared) setFpsDirty(true);
  }, [fps]);

  // ── preview drawing ──
  const drawAt = useCallback(
    (tMs: number) => {
      const c = canvasRef.current;
      if (!c || !prepared) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      drawFrame(ctx, prepared.timeline, tMs, renderOptions);
      lastDrawnRef.current = tMs;
    },
    [prepared, renderOptions]
  );

  // canvas resolution follows settings
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const res = RESOLUTIONS.find((r) => r.id === resolution)!;
    if (c.width !== res.w) {
      c.width = res.w;
      c.height = res.h;
      lastDrawnRef.current = -1;
    }
  }, [resolution]);

  // redraw current frame when options change
  useEffect(() => {
    if (prepared && !playing && tRef.current > 0) {
      lastDrawnRef.current = -1;
      drawAt(tRef.current);
    }
  }, [renderOptions, prepared, playing, drawAt]);

  // preview loop
  const stopAudio = useCallback(() => {
    try {
      srcRef.current?.stop();
    } catch {}
    srcRef.current = null;
  }, []);

  const startAudioAt = useCallback(
    (tMs: number) => {
      if (!prepared) return;
      stopAudio();
      const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      const ac: AudioContext = acRef.current ?? (acRef.current = new AC() as AudioContext);
      void ac.resume();
      const src = ac.createBufferSource();
      src.buffer = prepared.mixBuffer;
      src.connect(ac.destination);
      src.start(0, Math.max(0, tMs / 1000));
      srcRef.current = src;
    },
    [prepared, stopAudio]
  );

  const togglePlay = useCallback(() => {
    if (!prepared) return;
    if (playing) {
      stopAudio();
      setPlaying(false);
      return;
    }
    if (tRef.current >= prepared.timeline.durationMs - 100) tRef.current = 0;
    setPlaying(true);
    startAudioAt(tRef.current);
  }, [playing, prepared, startAudioAt, stopAudio]);

  useEffect(() => {
    if (!playing || !prepared) return;
    let last = performance.now();
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      const dt = now - last;
      last = now;
      tRef.current += dt;
      if (tRef.current >= prepared.timeline.durationMs) {
        tRef.current = prepared.timeline.durationMs;
        setPlaying(false);
        stopAudio();
      }
      drawAt(tRef.current);
      setPreviewT(tRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, prepared, drawAt, stopAudio]);

  const seek = useCallback(
    (tMs: number) => {
      tRef.current = Math.max(0, Math.min(tMs, prepared?.timeline.durationMs ?? 0));
      setPreviewT(tRef.current);
      drawAt(tRef.current);
      if (playing) startAudioAt(tRef.current);
    },
    [prepared, playing, drawAt, startAudioAt]
  );

  // ── render ──
  const doRender = useCallback(
    async (testMode: boolean) => {
      if (!prepared) return;
      // v5 (audit P1-1): never encode a frame before the bundled faces are
      // live — a render that starts early bakes the Georgia fallback into
      // 33,000 frames. fontsReady flips within ~100ms of page load.
      if (!fontsReady) {
        try {
          await (document as any).fonts?.ready;
        } catch {}
      }
      const res = RESOLUTIONS.find((r) => r.id === resolution)!;
      const canvas = canvasRef.current!;
      const prevW = canvas.width;
      const prevH = canvas.height;
      canvas.width = res.w;
      canvas.height = res.h;

      let timeline = prepared.timeline;
      if (testMode) {
        timeline = { ...prepared.timeline, durationMs: 6000, totalFrames: Math.ceil(6 * timeline.fps) };
      }

      const writable = await pickSaveTarget(
        testMode ? 'k-economy-test-render.mp4' : `k-shaped-economy-${resolution}-${fps}fps.mp4`
      );
      if (writable === null) {
        addLog('save dialog unavailable or cancelled — rendering in memory; the file will download automatically');
      }

      stopAudio();
      setPlaying(false);
      setPhase('rendering');
      setRenderStats(null);
      addLog(
        `render started · ${res.w}×${res.h} @ ${fps}fps · ${timeline.totalFrames.toLocaleString()} frames${testMode ? ' · TEST MODE (6s)' : ''}`
      );

      try {
        // keep the screen awake
        try {
          wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
        } catch {}

        await renderVideo({
          timeline,
          mixBuffer: prepared.mixBuffer,
          canvas,
          options: renderOptions,
          writable,
          audioDurationMs: testMode ? 6500 : undefined,
          onProgress: (s) => setRenderStats(s),
          onLog: addLog,
        });
        setPhase('done');
        toast({
          title: testMode ? 'Test render complete' : 'Your video is ready 🎬',
          description: 'The MP4 has been saved to the location you chose. Upload it straight to YouTube.',
        });
      } catch (e) {
        setPhase('ready');
        toast({
          title: 'Render failed',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        try {
          wakeLockRef.current?.release?.();
        } catch {}
        wakeLockRef.current = null;
        canvas.width = prevW;
        canvas.height = prevH;
        lastDrawnRef.current = -1;
        if (prepared) drawAt(Math.min(tRef.current, prepared.timeline.durationMs - 1));
      }
    },
    [prepared, resolution, fps, renderOptions, stopAudio, toast, addLog, drawAt, fontsReady]
  );

  // ── thumbnail ── (panel P0-1: exports all three Test & Compare variants;
  // v2's punchline words rendered as a gold blob + clipped at the edge)
  const downloadThumbnail = useCallback(() => {
    const variants: Array<{ v: 0 | 1 | 2; name: string }> = [
      { v: 0, name: 'A' },
      { v: 1, name: 'B' },
      { v: 2, name: 'C' },
    ];
    variants.forEach(({ v, name }) => {
      const c = document.createElement('canvas');
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext('2d')!;
      drawThumbnail(ctx, 1280, 720, v);
      c.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `k-shaped-economy-thumb-${name}-1280x720.png`;
        // stagger downloads so the browser treats each as user-initiated
        setTimeout(() => {
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        }, v * 350);
      }, 'image/png');
    });
    toast({
      title: 'Thumbnails saved (A · B · C)',
      description: 'Three 1280×720 variants for YouTube Test & Compare — check each at 120px before committing.',
    });
  }, [toast]);

  // ── Shorts 9:16 ── (panel P2-1: the highest-leverage growth surface)
  const shortsList = useMemo(
    () => (prepared ? pickShortMoments(prepared.timeline) : []),
    [prepared]
  );
  const doRenderShort = useCallback(async () => {
    if (!prepared || !shortsList.length) return;
    const spec = shortsList[Math.min(shortIdx, shortsList.length - 1)];
    const canvas = canvasRef.current!;
    const prevW = canvas.width;
    const prevH = canvas.height;
    canvas.width = 1080;
    canvas.height = 1920;

    const writable = await pickSaveTarget(
      `k-economy-short-${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.mp4`
    );
    if (writable === null) {
      addLog('save dialog unavailable or cancelled — rendering the Short in memory; it will download automatically');
    }

    stopAudio();
    setPlaying(false);
    setPhase('rendering');
    setRenderStats(null);
    addLog(`Short render started · 1080×1920 @ ${prepared.timeline.fps}fps · “${spec.title}”`);

    try {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
      } catch {}
      await renderShort({
        timeline: prepared.timeline,
        mixBuffer: prepared.mixBuffer,
        spec,
        options: renderOptions,
        canvas,
        writable,
        onProgress: (s) => setRenderStats(s as unknown as EncoderStats),
        onLog: addLog,
      });
      setPhase('done');
      toast({
        title: 'Short ready 📱',
        description: 'The 9:16 MP4 has been saved — upload it as a YouTube Short.',
      });
    } catch (e) {
      setPhase('ready');
      toast({
        title: 'Short render failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      try {
        wakeLockRef.current?.release?.();
      } catch {}
      wakeLockRef.current = null;
      canvas.width = prevW;
      canvas.height = prevH;
      lastDrawnRef.current = -1;
      if (prepared) drawAt(Math.min(tRef.current, prepared.timeline.durationMs - 1));
    }
  }, [prepared, shortsList, shortIdx, renderOptions, stopAudio, toast, addLog, drawAt]);

  // ── voice preview ──
  const previewVoice = useCallback(async () => {
    if (voicePreviewLoading) return;
    setVoicePreviewLoading(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              id: 'sample',
              text:
                'Markets are near record highs — and consumer confidence just had its worst spring since 2022. Here is the honest, data-backed reason both are true at once.',
            },
          ],
          voice: voice.voice,
          rate: voice.rate,
          pitch: voice.pitch,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'preview failed');
      const key = data.results[0].key as string;
      setPreviewVoiceKey(key);
      await new Promise<void>((resolve) => {
        const audio = new Audio();
        audio.src = `/api/tts/file/${key}`;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        void audio.play();
      });
    } catch (e) {
      toast({ title: 'Voice preview failed', description: String(e), variant: 'destructive' });
    } finally {
      setVoicePreviewLoading(false);
    }
  }, [voice, voicePreviewLoading, toast]);

  // ── upload kit text ──
  const chaptersText = useMemo(() => {
    if (!prepared) return '';
    return prepared.timeline.chapters
      .map((c) => {
        const s = Math.floor(c.startMs / 1000);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ${c.title}`;
      })
      .join('\n');
  }, [prepared]);

  const descriptionText = useMemo(() => {
    if (!chaptersText) return '';
    return `${DESCRIPTION_BODY}\n\n⏱️ CHAPTERS\n${chaptersText}\n\n📊 KEY SOURCES (full list in the pinned comment)\n${KEY_SOURCES_LINE}\n${DESCRIPTION_TAIL}`;
  }, [chaptersText]);

  const copy = useCallback(
    (text: string, what: string) => {
      void navigator.clipboard.writeText(text).then(() =>
        toast({ title: `${what} copied`, description: 'Paste it straight into YouTube Studio.' })
      );
    },
    [toast]
  );

  const busy = ['tts', 'decode', 'timeline', 'mix'].includes(phase);
  const rendering = phase === 'rendering';
  const runtimeMin = prepared ? (prepared.timeline.durationMs / 60000).toFixed(1) : '—';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F2]">
      {/* ── header ── */}
      <header className="border-b border-[#E9E4D6] bg-[#FDFCF8]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F7EFD7] border border-[#C9A227]/60 flex items-center justify-center">
            <span className="font-serif text-[#A8841B] text-xl font-bold leading-none mt-0.5">K</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-[#26262E] text-base sm:text-lg leading-tight truncate">
              K-Shaped Economy — Video Studio
            </h1>
            <p className="text-xs sm:text-[13px] text-[#8A8577] truncate">
              {VIDEO_TITLE}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Badge variant="outline" className="border-[#C9A227]/50 text-[#A8841B] bg-[#F7EFD7]">
              <Sparkles className="w-3 h-3 mr-1" /> Light · Premium · Stick-man
            </Badge>
            {caps && (
              <Badge variant="outline" className={caps.webcodecs ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-amber-300 text-amber-700 bg-amber-50'}>
                {caps.webcodecs ? 'WebCodecs ready' : 'Fallback mode'}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[400px_1fr] gap-6 items-start">
        {/* ── left: control panel ── */}
        <div className="space-y-4">
          {/* voice */}
          <Card className="border-[#E9E4D6] shadow-sm bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] flex items-center gap-2 text-[#26262E]">
                <AudioLines className="w-4 h-4 text-[#A8841B]" /> 1 · Premium voiceover
                <span className="ml-auto text-[11px] font-normal text-[#8A8577]">free · human-like neural</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Narrator voice</Label>
                <Select value={voice.voice} onValueChange={(v) => setVoice((s) => ({ ...s, voice: v }))}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] flex justify-between">
                  Speaking pace
                  <span className="text-[#8A8577] font-normal">
                    {voice.rate > 0 ? '+' : ''}
                    {voice.rate}% {voice.rate <= -6 ? '(measured)' : voice.rate >= 0 ? '(brisk)' : '(natural)'}
                  </span>
                </Label>
                <Slider
                  value={[voice.rate]}
                  min={-10}
                  max={6}
                  step={1}
                  onValueChange={([v]) => setVoice((s) => ({ ...s, rate: v }))}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-[#E9E4D6]"
                onClick={previewVoice}
                disabled={voicePreviewLoading || busy || rendering}
              >
                {voicePreviewLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Volume2 className="w-4 h-4 mr-2" />
                )}
                Hear this voice
              </Button>
            </CardContent>
          </Card>

          {/* look & feel */}
          <Card className="border-[#E9E4D6] shadow-sm bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] flex items-center gap-2 text-[#26262E]">
                <MonitorPlay className="w-4 h-4 text-[#A8841B]" /> 2 · Look & sound
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Resolution</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="bg-white text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Frame rate</Label>
                  <Select value={fps} onValueChange={setFps}>
                    <SelectTrigger className="bg-white text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FPS_OPTIONS.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] flex justify-between">
                  Background score <span className="text-[#8A8577] font-normal">{Math.round(bgmVolume * 100)}%</span>
                </Label>
                <Slider value={[bgmVolume]} min={0} max={1} step={0.05} onValueChange={([v]) => setBgmVolume(v)} />
                <p className="text-[11px] text-[#8A8577]">Original composition — auto-ducked under the voice.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Captions</Label>
                <Select value={captions} onValueChange={(v: any) => setCaptions(v)}>
                  <SelectTrigger className="bg-white text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="karaoke">Karaoke — words light up as spoken</SelectItem>
                    <SelectItem value="simple">Simple — plain subtitle</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Channel name (intro & watermark)</Label>
                <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Next video title (end screen)</Label>
                <Input value={nextVideoTitle} onChange={(e) => setNextVideoTitle(e.target.value)} className="bg-white text-[13px]" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Watermark + progress bar</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={watermark} onCheckedChange={setWatermark} />
                  <Switch checked={progressBar} onCheckedChange={setProgressBar} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* build & render */}
          <Card className="border-[#E9E4D6] shadow-sm bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] flex items-center gap-2 text-[#26262E]">
                <Clapperboard className="w-4 h-4 text-[#A8841B]" /> 3 · Build & render
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {busy && progress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[12px] text-[#55555F]">
                    <span className="capitalize">{progress.phase === 'tts' ? 'voiceover' : progress.phase}</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="h-1.5 bg-[#F1EBDC]" />
                  <p className="text-[11px] text-[#8A8577]">{progress.detail}</p>
                </div>
              )}
              {(mixDirty || fpsDirty) && prepared && !rendering && (
                <Button variant="outline" className="w-full border-amber-300 text-amber-800 bg-amber-50" onClick={rebuild}>
                  <Wand2 className="w-4 h-4 mr-2" /> Apply setting changes ({fpsDirty ? 'fps' : 'audio'})
                </Button>
              )}
              <Button
                className="w-full bg-[#A8841B] hover:bg-[#8f6f16] text-white"
                size="lg"
                onClick={prepare}
                disabled={busy || rendering}
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {prepared ? 'Re-prepare project' : 'Prepare project (voice + timeline + score)'}
              </Button>

              {prepared && !rendering && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="border-[#E9E4D6]" onClick={() => doRender(true)} disabled={busy}>
                    <Gauge className="w-4 h-4 mr-1.5" /> Test render · 6s
                  </Button>
                  <Button variant="outline" className="border-[#E9E4D6]" onClick={downloadThumbnail}>
                    <ImageIcon className="w-4 h-4 mr-1.5" /> Thumbnail
                  </Button>
                </div>
              )}

              {prepared && !rendering && (
                <Button
                  className="w-full bg-[#0E8074] hover:bg-[#0b6a60] text-white"
                  size="lg"
                  onClick={() => doRender(false)}
                  disabled={busy}
                >
                  <FileVideo className="w-4 h-4 mr-2" /> Render full MP4 — {runtimeMin} min · {prepared.timeline.totalFrames.toLocaleString()} frames
                </Button>
              )}

              {/* v3 (panel P2-1): Shorts 9:16 export — same engine, vertical cut */}
              {prepared && !rendering && shortsList.length > 0 && (
                <div className="space-y-2 rounded-xl border border-[#E9E4D6] bg-[#FDFCF8] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[#26262E]">Shorts · 9:16 cuts (1080×1920)</span>
                    <Badge variant="outline" className="border-[#C9A227]/50 text-[#A8841B] bg-[#F7EFD7]">
                      {shortsList.length} moments
                    </Badge>
                  </div>
                  <select
                    className="w-full rounded-lg border border-[#E9E4D6] bg-white px-3 py-2 text-[13px] text-[#26262E]"
                    value={shortIdx}
                    onChange={(e) => setShortIdx(Number(e.target.value))}
                  >
                    {shortsList.map((s, i) => (
                      <option key={i} value={i}>
                        {s.title} · ~{Math.round(Math.min(s.durMs, prepared.timeline.durationMs - s.startMs) / 1000)}s
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    className="w-full border-[#0E8074]/40 text-[#0E8074] hover:bg-[#DDF0EA]"
                    onClick={doRenderShort}
                    disabled={busy}
                  >
                    <MonitorPlay className="w-4 h-4 mr-1.5" /> Export this Short
                  </Button>
                  <p className="text-[11px] text-[#8A8577]">
                    Same engine, vertical composition: title band, centered crop, vertical karaoke captions clear of the
                    Shorts overlay zone. ~2–4 min per Short on the 8 GB laptop.
                  </p>
                </div>
              )}

              {rendering && renderStats && (
                <div className="space-y-2 rounded-xl border border-[#E9E4D6] bg-[#FDFCF8] p-3">
                  <div className="flex justify-between text-[12px]">
                    <span className="font-medium text-[#26262E]">{renderStats.sceneLabel}</span>
                    <span className="text-[#8A8577]">
                      {renderStats.frame.toLocaleString()} / {renderStats.totalFrames.toLocaleString()} frames
                    </span>
                  </div>
                  <Progress value={(renderStats.frame / renderStats.totalFrames) * 100} className="h-2 bg-[#F1EBDC]" />
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-[#55555F]">
                    <div><span className="block font-semibold text-[#26262E]">{renderStats.fps.toFixed(1)}</span> fps</div>
                    <div><span className="block font-semibold text-[#26262E]">{fmtEta(renderStats.etaMs)}</span> left</div>
                    <div><span className="block font-semibold text-[#26262E]">{(renderStats.bytes / 1e6).toFixed(0)} MB</span> written</div>
                  </div>
                  <p className="text-[11px] text-[#8A8577]">
                    Keep this tab visible and your laptop plugged in — the file streams to disk as it renders.
                  </p>
                </div>
              )}

              {phase === 'done' && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-[13px]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>MP4 saved to your chosen folder — ready to upload to YouTube.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── right: preview + kit ── */}
        <div className="space-y-4">
          <Card className="border-[#E9E4D6] shadow-sm bg-white overflow-hidden">
            <div className="bg-[#1c1c22] p-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-[11px] text-white/50 font-mono">preview · 16:9 · what you see is what renders</span>
            </div>
            <div className="relative bg-[#F1EBDC]">
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                className="w-full aspect-video block"
              />
              {!prepared && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white/85 backdrop-blur rounded-xl px-5 py-3 text-[13px] text-[#55555F] border border-[#E9E4D6]">
                    Prepare the project to preview the full video here
                  </div>
                </div>
              )}
            </div>
            {prepared && (
              <div className="p-3 border-t border-[#E9E4D6] space-y-3">
                <div className="flex items-center gap-3">
                  <Button
                    size="icon"
                    className="bg-[#0E8074] hover:bg-[#0b6a60] text-white rounded-full h-10 w-10"
                    onClick={togglePlay}
                  >
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </Button>
                  <Button size="icon" variant="outline" className="rounded-full border-[#E9E4D6]" onClick={() => seek(0)}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <div className="flex-1">
                    <input
                      type="range"
                      min={0}
                      max={prepared.timeline.durationMs}
                      step={100}
                      value={previewT}
                      onChange={(e) => seek(Number(e.target.value))}
                      className="w-full accent-[#A8841B]"
                    />
                  </div>
                  <span className="text-[12px] font-mono text-[#55555F] w-[92px] text-right">
                    {fmtTime(previewT)} / {fmtTime(prepared.timeline.durationMs)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prepared.timeline.chapters.map((c) => (
                    <button
                      key={c.index}
                      onClick={() => seek(c.startMs + 40)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        previewT >= c.startMs && previewT < c.endMs
                          ? 'bg-[#F7EFD7] border-[#C9A227] text-[#A8841B] font-medium'
                          : 'bg-white border-[#E9E4D6] text-[#8A8577] hover:border-[#C9A227]/60'
                      }`}
                    >
                      {c.index + 1}. {c.title.length > 34 ? c.title.slice(0, 33) + '…' : c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* upload kit */}
          <Card className="border-[#E9E4D6] shadow-sm bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] flex items-center gap-2 text-[#26262E]">
                <Download className="w-4 h-4 text-[#A8841B]" /> Upload kit
                <span className="ml-auto text-[11px] font-normal text-[#8A8577]">
                  {prepared ? 'timestamps from your actual render' : 'prepare project first'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="titles" className="border-[#E9E4D6]">
                  <AccordionTrigger className="text-[13px] py-2.5">Title options (test #1 first)</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    {TITLE_OPTIONS.map((t, i) => (
                      <div key={i} className="flex items-start gap-2 text-[13px]">
                        <Badge className="bg-[#F7EFD7] text-[#A8841B] border border-[#C9A227]/50 shrink-0 mt-0.5">
                          {i === 0 ? 'primary' : `alt ${i}`}
                        </Badge>
                        <span className="text-[#26262E] flex-1">{t}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(t, 'Title')}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="desc" className="border-[#E9E4D6]">
                  <AccordionTrigger className="text-[13px] py-2.5">Description (auto-timed chapters)</AccordionTrigger>
                  <AccordionContent>
                    <ScrollArea className="h-64 rounded-lg border border-[#E9E4D6] bg-[#FDFCF8] p-3">
                      <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#55555F] font-sans">
                        {descriptionText || 'Prepare the project to generate real chapter timestamps.'}
                      </pre>
                    </ScrollArea>
                    <Button size="sm" variant="outline" className="mt-2 border-[#E9E4D6]" onClick={() => copy(descriptionText, 'Description')} disabled={!prepared}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy description
                    </Button>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="tags" className="border-[#E9E4D6]">
                  <AccordionTrigger className="text-[13px] py-2.5">Tags & pinned comment</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {TAGS.map((t) => (
                        <Badge key={t} variant="outline" className="border-[#E9E4D6] text-[#55555F] font-normal">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="border-[#E9E4D6]" onClick={() => copy(TAGS.join(', '), 'Tags')}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy tags
                    </Button>
                    <Separator className="bg-[#E9E4D6]" />
                    <div className="text-[12px] text-[#55555F] leading-relaxed bg-[#FDFCF8] rounded-lg border border-[#E9E4D6] p-3">
                      {PINNED_COMMENT}
                    </div>
                    <Button size="sm" variant="outline" className="border-[#E9E4D6]" onClick={() => copy(PINNED_COMMENT, 'Pinned comment')}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy pinned comment
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* notes */}
          <Card className="border-[#E9E4D6] shadow-sm bg-white">
            <CardContent className="pt-4 space-y-2 text-[12px] text-[#55555F] leading-relaxed">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0E8074] shrink-0 mt-0.5" />
                <p>
                  Everything is original: the stick-man animation, every chart, the procedural score, and the
                  voice are generated on your machine. No copyrighted assets — fully monetizable.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Gauge className="w-4 h-4 text-[#A8841B] shrink-0 mt-0.5" />
                <p>
                  8 GB RAM friendly: frames render one at a time and stream straight to disk. If your laptop
                  struggles, use the 720p preset or run the 6-second test render first.
                </p>
              </div>
              <ScrollArea className="h-28 rounded-lg border border-[#E9E4D6] bg-[#FDFCF8] mt-1">
                <pre className="text-[10.5px] leading-relaxed p-2.5 text-[#8A8577] font-mono whitespace-pre-wrap">
                  {logs.length ? logs.join('\n') : 'engine log — will appear here'}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-[#E9E4D6] bg-[#FDFCF8] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8A8577]">
          <span>K-Shaped Economy Video Studio · renders locally · your script, your video</span>
          <span>Not financial advice — the disclaimer is in the video itself.</span>
        </div>
      </footer>
    </div>
  );
}

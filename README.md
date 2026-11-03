# 🎬 K-Shaped Economy — Video Studio

Renders your complete YouTube script — **"Why Does Everyone Feel Broke When the Stock Market Is at Record Highs?"** — as a premium, light-themed stick-man explainer video, **frame by frame**, and saves a YouTube-ready MP4 straight to your laptop.

- **~19–21 minutes** of finished video (35,000+ frames at 1080p/30)
- **Human-like neural voiceover** (free Microsoft Edge voices — Andrew by default)
- **Original score** composed by code (royalty-free, fully monetizable) with automatic ducking under the voice
- **Karaoke captions** synced word-by-word to the voice
- **Light "Morning Ivory" design** — warm ivory, gold, teal & coral. No dark theme anywhere.
- Chapter cards, animated charts, the signature 3-D "K", progress bar, end screen, and a **thumbnail generator**
- Built for an **8 GB office laptop**: frames render one at a time and stream directly to disk

---

## 1 · One-time setup on your Dell laptop (Windows, 8 GB RAM — fine)

You only need **Node.js** and **Chrome or Edge**. Nothing else.

1. Install **Node.js LTS** from <https://nodejs.org> (just click Next through the installer).
2. Copy this project folder anywhere, e.g. `C:\k-video-studio`.
3. Open **Command Prompt** in that folder (type `cmd` in the folder's address bar and press Enter) and run:

   ```
   npm install
   ```

   *(This takes a few minutes, once. If Windows Firewall asks about Node.js, allow it — it's only talking to your own machine.)*

4. Start the studio:

   ```
   npm run dev
   ```

5. Open **http://localhost:3000** in **Chrome or Edge** (WebCodecs video encoding needs a Chromium browser — both are preinstalled on your Dell).

> ⚡ If your network blocks the voice service (some office firewalls do), run it from a home / phone-hotspot network for the voice step. Once generated, the voice lines are cached on disk — the video itself renders 100% offline.

## 2 · Making the video (3 clicks)

| Step | What you click | What happens | Time |
|---|---|---|---|
| 1 | **Prepare project** | Generates all 151 voice clips (cached — re-runs are instant), measures them, builds the frame-accurate timeline, composes the score and mixes the audio | ~2–4 min first time |
| 2 | *(optional)* **▶ Play** in the preview | Watch the whole video before committing | real time |
| 3 | **Render full MP4** → choose where to save | Renders **frame by frame** and streams the MP4 to that folder | **30–90 min** — let it run |

Then **upload the MP4 to YouTube**. Use the **Upload kit** panel (description, chapters, tags, pinned comment — chapter timestamps are computed from your actual render) and the **Thumbnail** button (1280×720 PNG, built exactly to the script's thumbnail spec).

### Tips for the render

- **Keep the tab visible** and the laptop plugged in. The studio grabs a screen wake-lock automatically, but Windows sleep will pause it — set *Power Options → Screen off = Never* for the session if you walk away.
- Watch the live progress: current scene, frame counter, render fps, ETA, MB written.
- **Run "Test render · 6s" first** if you want to confirm everything works before the full render.
- On a very tired laptop, switch **Resolution → 720p** in *Look & sound* — the render roughly doubles in speed and YouTube still looks fine.

## 3 · Make it yours

Everything is editable in the left panel, no code:

- **Voice** — 8 premium narrators (Andrew recommended) + a *Hear this voice* preview button
- **Speaking pace** — `-10%` (measured) to `+6%` (brisk); slower pace = longer video
- **Score volume**, **captions** (karaoke / simple / off), **watermark**, **progress bar**
- **Channel name** (intro + watermark + end screen) and **next video title**
- Changing pace or voice → click **Prepare project** again (voice re-generates only for new settings)

## 4 · Troubleshooting

| Symptom | Fix |
|---|---|
| "voice generation failed" | Your network is blocking the speech service. Try another network (home/phone hotspot). Already-generated lines stay cached. |
| "This browser cannot encode video" | Use **Chrome or Edge**, latest version. Not Firefox/Safari. |
| Render seems paused | The tab was hidden — bring it to the front. Chrome throttles hidden tabs. |
| Laptop feels slow during render | Close other apps; switch to 720p; keep the charger plugged in. |
| I closed the tab mid-render | Just render again — the voice is cached, only the video re-renders. |
| Want the exact 20:53 runtime from the script | Set speaking pace to about **-8%** and re-prepare — Andrew's natural pace runs ~1.5 min faster. |

## 5 · What's inside (for the curious)

```
src/app/page.tsx              ← the Studio UI (Next.js + shadcn/ui)
src/app/api/tts/…             ← free neural voiceover service (Edge TTS) + disk cache
src/lib/engine/script-data.ts ← your entire v5 script, structured into 55 beats
src/lib/engine/director.ts    ← draws any frame at any time (the "camera")
src/lib/engine/scenes-*       ← 28 scene types: stick-man stages, charts, big text…
src/lib/engine/stickman.ts    ← the host: skeleton, gestures, walk cycle, expressions
src/lib/engine/charts.ts      ← animated line charts, pies, gauges, counters
src/lib/engine/audio.ts       ← the score: pure-JS DSP composer + mixer with ducking
src/lib/engine/encode.ts      ← WebCodecs H.264 + MP4 muxing, streamed to disk
src/lib/engine/timeline.ts    ← audio-driven, frame-accurate edit decision list
```

**Every visual and every sound is generated by code** — stick man, charts, score, captions. Zero copyrighted assets: the video is fully monetizable from day one.

## 6 · The P2 upgrade — the moat (soundfont score · native Shorts · analytics loop)

Three compounding investments, all free and offline:

### 6.1 · Real instruments under the same score (P2-1)

The underscore is now **score-as-data** (`src/lib/engine/score.ts`) — one source of
truth for three renderers. The shipped bed is rendered through **GeneralUser GS**
(real sampled strings, piano, bass, kit) by the engine's own SoundFont 2 player
(`src/lib/engine/sf2.ts`, zero dependencies), level-matched loop-for-loop against
the DSP bed it replaces (0.00 dB worst-case). Your own K-motif chimes, risers,
whooshes and dings stay hand-drawn DSP on top — same notes, real instruments.

```bash
# one-time (or after any score.ts edit) — renders in ~2 s on the 8 GB Dell:
node scripts/render-bed.mjs            # downloads GeneralUser GS if missing
```

- `public/beds/sf2-<mood>-<v>.wav` — the beds the mix loads automatically
- `public/beds/midi/*.mid` — the same loops as MIDI, for FluidSynth or any DAW
  (`fluidsynth -ni -F bed.wav GeneralUser_GS.sf2 bed-sparse-v0.mid`)
- no soundfont handy? The mix silently falls back to the DSP bed — the repo
  renders identically either way, because the beds are committed.

### 6.2 · Native 9:16 Shorts (P2-2)

The six strongest beats now **compose natively for the phone** — no more
16:9 cropping. One layout grammar across all six (title band → centered hero
→ karaoke captions at 62% height → presenter zone), each scene re-choreographed:
the diverging K at optical centre, the SEVEN-companies statement auto-fitted,
the margin wall stacked full-width, PARADOX struck through, the coin-flip gauge
at hero scale, the gas pump with both households beneath. The crop path survives
only as a fallback for off-script spans.

### 6.3 · The analytics loop (P2-3)

Every upload becomes a measured experiment:

```bash
# a few days after publishing, export from YouTube Studio:
#   Analytics → Engagement → Audience retention        (retention.csv)
#   Content → ⋮ → Test & compare                        (thumbs.csv)
node scripts/ingest-analytics.mjs retention.csv thumbs.csv
```

The script maps the retention curve onto your actual beats (same timeline code
the render uses), flags every cliff ≥ 2.5%/min, and records the thumbnail race
into `src/lib/engine/analytics-data.json`. The Studio then shows the measured
drop-off on load — so the next script edit starts from evidence, not vibes.

---

*Not financial advice — the disclaimer is in the video itself, exactly as your script specifies.*

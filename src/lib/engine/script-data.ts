/**
 * THE SCRIPT — "Why Does Everyone Feel Broke When the Stock Market Is at Record Highs?"
 * The complete v5 script, structured as chapters → beats. Every beat carries the exact
 * voiceover text plus the on-screen scene direction from the script.
 */

export interface BeatSpec {
  /** Voiceover text (verbatim from the v5 script) */
  vo: string;
  /** ms of silence after this beat */
  pauseAfter?: number;
  /** scene props; `sceneKey` groups consecutive beats into one continuous scene */
  scene: { type: string; sceneKey: string; [k: string]: unknown };
  /** v8 (panel P0-4): per-beat vocal direction. Maps to TTS rate/pitch
   *  offsets so a 20-minute narration stops being one flat read:
   *  calm = −6% rate, reveal = −10% + pitch −2Hz (slow, low, held),
   *  urgent = +6% rate (the cold open, the paradox), quote = pitch +3Hz
   *  (lighter, for quoted characters). Default: the base voice settings. */
  voStyle?: 'calm' | 'neutral' | 'urgent' | 'reveal' | 'quote';
  /** v8: a completely different Edge voice for this beat (quoted
   *  economists get their own voices — the debate becomes a real
   *  two-voice argument instead of one narrator quoting himself). */
  voice?: string;
  /** v8 (panel P0-5): duck the BGM to near-silence just before this beat's
   *  payoff line. Used twice in the whole film (the twist, the paradox
   *  strike) — scarcity is what makes it work. */
  dropOut?: boolean;
}

export interface ChapterSpec {
  id: string;
  title: string;
  beats: BeatSpec[];
}

const P = (type: string, sceneKey: string, props: Record<string, unknown> = {}) => ({
  type,
  sceneKey,
  ...props,
});

export const SCRIPT: ChapterSpec[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch1',
    title: 'The two numbers that don’t add up',
    beats: [
      {
        // v4 (audit P0-6): the video now OPENS on the signature moment — the
        // K draws itself while the cold-open line plays (first hard visual
        // payoff at 0:00, not 1:10). `opening: true` suppresses the arm
        // labels and the K-name caption so the naming beat lands later with
        // full impact, and holds the twist chip on screen from this first
        // scene (audit P0-6, items 1 and 4).
        // v8 (panel P0-6): the channel promise is now SPOKEN INSIDE the cold
        // open ("the full range of the data — never just the best headline")
        // and the dedicated 8-second branding beat is cut. Retention data:
        // 55% of viewers are lost in the first 60s and a self-referential
        // beat at 0:14–0:22 is a known dip on new channels. Data now starts
        // at ~0:12 instead of ~0:25. The sting scene type survives for
        // channels that want it — it's just not in THIS edit.
        vo:
          "If the market's near record highs right now — and you still feel like you're falling behind — you're not losing your mind. Here's the honest, data-backed reason both are true at once — the full range of the data, never just the best headline.",
        pauseAfter: 600,
        voStyle: 'urgent',
        scene: P('divergeK', 'c1-k-open', {
          twistChip: true,
          opening: true,
        }),
      },
      {
        // v2 (PATCH 8): the v1 edit parked a 28-second self-introduction here
        // as its own chapter at the 80-second mark — the single biggest
        // retention cliff in the video. v8: REMOVED entirely — the promise
        // now rides the cold open above, one sentence, no separate scene.
        // The channelIntro scene drawer stays available for future edits.
        vo:
          // v9 (report P0-4): beats 2-3 MERGED \u2014 the cold open already
          // teased both numbers; 36 seconds of restatement was the panel's
          // #1 ch1 retention leak. One 'vs' frame carries both sides.
          // v9 (report P0-4): tightened.
          'Over the past year, the S&P 500 is up about 18%, the Nasdaq over 20. Now the other number: this spring only 16% of Americans called the economy good \u2014 and 72 economists put recession odds at 1 in 4.',
        pauseAfter: 650,
        scene: P('splitNumbers', 'c1-market', {
          mode: 'vs',
          cornerNote: 'data as of mid-July 2026 \u00b7 sources for every stat linked below',
          stats: [
            { big: '+18%', label: 'S&P 500 · past year', tone: 'up' },
            { big: '+20%', label: 'Nasdaq · past year', tone: 'up' },
            { big: 'RECORD', label: 'corporate profit margins', tone: 'gold' },
          ],
        }),
      },
      {
        vo: 'Same country. Same year. Two completely different stories.',
        pauseAfter: 550,
        voStyle: 'reveal',
        scene: P('splitNumbers', 'c1-market', {
          mode: 'vs-punch',
          cornerNote: 'data as of mid-July 2026 \u00b7 sources for every stat linked below',
          // PANEL-10 (D-03): was `stats: []` — truthy-but-empty, so the
          // market panel rendered as a BARE CARD for the whole punch beat
          // (`s.stats || fallback` never engaged). The punch beat now ships
          // the same three stats as the vs beat: the payoff line lands over
          // fully-populated panels, and the engine-side fallback guard
          // (scenes-host) covers any future beat that forgets.
          stats: [
            { big: '+18%', label: 'S&P 500 · past year', tone: 'up' },
            { big: '+20%', label: 'Nasdaq · past year', tone: 'up' },
            { big: 'RECORD', label: 'corporate profit margins', tone: 'gold' },
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Economists have a name for this \u2014 the K-shaped economy. If you\u2019ve got money in the market, this isn\u2019t trivia: there\u2019s a twist later that applies to your portfolio. Let\u2019s walk the real data \u2014 all of it, not just the best headline.',
        pauseAfter: 800,
        voStyle: 'calm',
        scene: P('divergeK', 'c1-k', {
          twistChip: true,
          // v4 (audit P0-6): the naming beat — the same K the video opened
          // on, now completing with its labels: THE MARKET / THE MOOD.
          // v3 (panel P1-6): hostSide removed — divergeKScene always stages
          // the host on the left; the prop shipped unread
        }),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // v2 (PATCH 8): the standalone "What this channel is about" chapter was
  // REMOVED — a 28-second self-introduction at the 80-second mark is the
  // most expensive 28 seconds in a 20-minute render on a new channel. The
  // promise now lives in one 8-second sentence at ~0:12 (see ch1) and in the
  // closing recap, where it belongs.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch3',
    title: 'The market: record highs (and what’s hiding in them)',
    beats: [
      {
        vo: 'Let\u2019s start where the good news is loudest: the market.',
        pauseAfter: 400,
        scene: P('host', 'c3-lead', {
          stage: 'chartstand',
          gesture: 'present',
          expression: 'warm',
          entrance: 'walk',
        }),
      },
      {
        vo:
          'Over the trailing twelve months, the S&P 500 is up 18.4%. The Nasdaq\u2019s up 22%. The Nasdaq-100 — the 100 biggest non-financial companies — is up close to 24%.',
        pauseAfter: 550,
        scene: P('chartTwin', 'c3-twin', {
          source: 'Investing.com',
          charts: [
            {
              title: 'S&P 500 · 12 months',
              badge: '+18.4%',
              points: [
                [0, 100], [3, 101.5], [5, 102], [7, 100], [9, 98.4], [11, 100.6],
                [13, 103], [16, 105.5], [19, 108], [22, 110.5], [25, 112.4],
                [28, 114], [31, 116], [34, 117.2], [37, 118.8], [40, 118.4],
              ],
            },
            {
              title: 'Nasdaq Composite · 12 months',
              badge: '+22%',
              points: [
                [0, 100], [3, 102], [5, 103], [7, 101], [9, 97.5], [11, 100.5],
                [13, 104], [16, 107], [19, 110.5], [22, 114], [25, 117],
                [28, 119.5], [31, 121.5], [34, 123], [37, 124.5], [40, 122],
              ],
            },
          ],
          extraBadge: { big: '+24%', label: 'Nasdaq-100 · 12 months' },
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'And that last one had a wild ride: it fell hard into the low-23,000s in March on a tariff-driven selloff, then ripped more than 30% off that low in about ten weeks \u2014 crossing 30,000 for the first time ever in June. Both indexes sit within a few percent of this summer\u2019s fresh all-time highs.',
        pauseAfter: 600,
        scene: P('chartJourney', 'c3-ndq', {
          title: 'Nasdaq-100 · the ride to a record',
          source: 'Investing.com',
          yFormat: 'ndx',
          points: [
            [0, 26800], [2, 27000], [4, 26600], [6, 26100], [8, 24800], [10, 23300],
            [11, 23150], [12, 23600], [13, 24400], [14, 25200], [15, 26100],
            [16, 27000], [17, 27900], [18, 28800], [19, 29600], [20, 30150],
            [22, 30900], [24, 31700], [26, 32400], [28, 33000], [30, 33450],
            [32, 33200], [34, 32900], [36, 32650], [38, 32300], [40, 32420],
          ],
          annotations: [
            { at: 11, label: 'low-23,000s · March', tone: 'down', dy: 40 },
            // v10 (panel CHART-2): dy −46 → +56 — the pill drew ABOVE the
            // point where the line rises steeply through it ("callout
            // overlaps the line itself", vision-verified); below-right is
            // open water inside the peak band.
            { at: 20, label: 'crosses 30,000 · June — first time ever', tone: 'gold', dy: 56 },
            { at: 30, label: '+30% off the low in ~10 weeks', tone: 'up', dy: -70 },
          ],
          peakBand: { from: 26, to: 40, label: 'all-time-high zone' },
        }),
      },
      {
        vo: 'So yes — “record highs” isn\u2019t hype. It\u2019s accurate.',
        pauseAfter: 650,
        scene: P('stampCard', 'c3-stamp', {
          stamp: 'RECORD HIGHS',
          sub: 'not hype — accurate',
          expression: 'nod',
        }),
      },
      {
        vo:
          'Here\u2019s what most coverage leaves out, though: how concentrated those gains are. Heading into this year, the ten largest companies in the S&P 500 made up around 38% of the entire index\u2019s value.',
        pauseAfter: 550,
        scene: P('pieChart', 'c3-pie', {
          title: 'Who owns the index?',
          source: 'S&P Dow Jones Indices / Goldman Sachs',
          // v9 (report D-05): donut:true — the solid pie printed '38%' across
          // the gray 62% wedge (mixed metaphor: center-numbers belong to the
          // donut form). Same flag the c7 chart already used.
          donut: true,
          slices: [
            { label: '10 largest companies', value: 38, tone: 'gold' },
            { label: 'the other 490', value: 62, tone: 'muted' },
          ],
          centerBig: '38%',
        }),
      },
      {
        vo:
          'Picture the S&P 500 as five hundred companies splitting one bonus pool — ten of them are walking away with almost four dollars out of every ten.',
        pauseAfter: 450,
        scene: P('dotGrid', 'c3-dots', {
          total: 500,
          highlight: 10,
          caption: 'almost 4 dollars out of every 10',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'That same top ten accounted for roughly 31% of total earnings \u2014 and the Magnificent Seven are projected by Goldman Sachs to drive close to 46% of all S&P 500 earnings growth this year.',
        pauseAfter: 550,
        scene: P('magChips', 'c3-mag', {
          source: 'S&P Dow Jones Indices / Goldman Sachs',
          chips: ['Nvidia', 'Microsoft', 'Apple', 'Alphabet', 'Amazon', 'Meta', 'Tesla'],
          stats: [
            { big: '31%', label: 'of total earnings · top ten' },
            { big: '46%', label: 'of earnings growth this year · the Magnificent Seven', tone: 'gold' },
          ],
        }),
      },
      {
        vo: 'Seven companies. Out of five hundred.',
        pauseAfter: 900,
        scene: P('bigText', 'c3-bigtext', {
          lines: ['SEVEN COMPANIES.', 'OUT OF FIVE HUNDRED.'],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'But here\u2019s the twist almost nobody\u2019s covering: 2026 broke that pattern. The Russell 2000 \u2014 small caps \u2014 is having its best year since 2003, up roughly 20% as of mid-July, ahead of the S&P\u2019s 11% and the Magnificent Seven\u2019s 4%. \u201cThe market\u201d hasn\u2019t meant \u201cseven tech stocks\u201d \u2014 keep that in mind, it matters later.',
        pauseAfter: 800,
        scene: P('barsCompare', 'c3-russell', {
          title: '2026 year-to-date · as of mid-July',
          source: '24/7 Wall St.',
          bars: [
            { label: 'Russell 2000 · small caps', value: 20, tag: 'best year since 2003', tone: 'gold' },
            { label: 'S&P 500', value: 11, tone: 'up' },
            { label: 'Magnificent Seven', value: 4, tone: 'muted' },
          ],
          rememberChip: 'keep this in mind — it matters later',
        }),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch4',
    title: 'Consumer sentiment: crash, then partial recovery',
    beats: [
      // v9 (report P0-4): the c4-flip host-lead beat is folded into the
      // Gallup beat's opening line \u2014 the chapter card already sells the
      // turn; a 9-second host beat restating it was pure overhead.
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Now the other side of the K. Gallup has tracked the mood since 1996 \u2014 and this May its index cratered to negative 45, its worst since 2022, with only 16% rating the economy good. Most coverage missed what came next: a climb back to around negative 33 \u2014 real ground clawed back.',
        pauseAfter: 600,
        scene: P('chartJourney', 'c4-gallup', {
          title: 'Gallup Economic Confidence Index',
          source: 'Gallup',
          yFormat: 'eci',
          points: [
            [0, -18], [2, -22], [4, -28], [6, -34], [8, -39], [10, -43],
            [11, -45], [12, -44], [13, -41], [14, -37], [15, -33], [16, -35],
          ],
          annotations: [
            { at: 11, label: '−45 · worst since Oct 2022', tone: 'down', dy: 42 },
            { at: 15, label: 'climbed back to \u221233 \u00b7 June\u2013July', tone: 'up', dy: 46 },
          ],
          extraStats: [
            { big: '16%', label: 'rated the economy \u201cgood\u201d \u2014 one in six' },
            { big: '\u221233', label: 'clawed back from \u221245', tone: 'up' },
          ],
        }),
      },
      {
        // v9 (report P0-4): the full-screen number moment that breaks the
        // chart run \u2014 the beat's two facts (cause: gas prices; state:
        // still bad) land as TYPE, not as a third identical chart.
        vo:
          'What crashed it was the gas-price spike tied to the Iran conflict \u2014 and what\u2019s driven the recovery is those same prices easing. But clawed-back ground is not fine: negative 33 is still worse than nearly every reading of the last four years.',
        pauseAfter: 650,
        voStyle: 'reveal',
        scene: P('bigText', 'c4-number', {
          lines: ['FROM -45 TO -33', 'STILL A BAD NUMBER'],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Same story at the University of Michigan: an all-time low in May, a five-month high by July \u2014 but still down about 12% from a year earlier. One honest caveat: most interviews wrapped before Iran tensions reignited, so the mood by the time you watch may already be softer.',
        pauseAfter: 600,
        scene: P('chartJourney', 'c4-umich', {
          title: 'University of Michigan · Consumer Sentiment',
          source: 'University of Michigan',
          yFormat: 'index',
          points: [
            [0, 61.5], [2, 60], [4, 58.5], [6, 56], [8, 54.5], [10, 53],
            [11, 52.2], [12, 54], [13, 56.5], [14, 58.4], [15, 60.1],
          ],
          annotations: [
            { at: 11, label: 'all-time low · May', tone: 'down', dy: 44 },
            { at: 15, label: 'five-month high · July', tone: 'up', dy: -48 },
          ],
          extraStats: [
            { big: '−12%', label: 'still down vs. a year earlier', tone: 'down' },
          ],
          chips: ['most interviews wrapped before Iran tensions reignited'],
        }),
      },
      // v9 (report P0-4): the Conference Board chartJourney beat is CUT —
      // the fifth chart in one chapter. Its facts move to the trio beat
      // (the trio's third mini-card IS the Conference Board arc).
      {
        vo:
          // v9 (report P0-4): tightened.
          'And the Conference Board \u2014 a third survey, a third organization \u2014 traced the same arc. Three surveys, three methodologies, one shape: a real crash, a partial recovery, a still-weak level. A channel that only shows the negative-45 tells a true fact in service of a less-true story. Not here.',
        pauseAfter: 800,
        scene: P('trioConverge', 'c4-trio', {
          motto: 'the SHAPE — not one scary number',
          sub: 'a real crash · a real but partial recovery · a still-weak level',
        }),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch5',
    title: 'What “K-shaped economy” actually means',
    beats: [
      // v9 (report P0-4): the ch5 recapSplit lead is folded into the kDef
      // beat \u2014 its one sentence rides the definition's opening.
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'So: markets near record highs, sentiment crashed and only partly recovered \u2014 same economy, same months. The Richmond Fed defines it plainly: K-shaped means outcomes for the bottom get worse while outcomes for the top get better \u2014 two lines that diverge, like the strokes of a K.',
        pauseAfter: 600,
        scene: P('kDef', 'c5-kdef', {
          definition:
            'outcomes for the bottom get worse while outcomes for the top get better',
          source: 'Richmond Fed',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'This isn\u2019t an internet theory. The New York Fed hosted a whole symposium on it this spring, and U.S. Bank, the Bank of America Institute, Goldman Sachs, and Moody\u2019s have all published research on it in 2026.',
        pauseAfter: 550,
        scene: P('credibilityChips', 'c5-cred', {
          kicker: 'not an internet theory',
          chips: [
            'New York Fed · K-shaped symposium',
            'U.S. Bank',
            'Bank of America Institute',
            'Goldman Sachs',
            'Moody\u2019s',
          ],
          year: 'research published in 2026',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'And it shows up in hard data: New York Fed researchers found real retail spending since January 2023 driven almost entirely by households earning over $125,000 \u2014 while under-$40,000 households spent less for a stretch and didn\u2019t recover until mid-2024.',
        pauseAfter: 600,
        scene: P('chartJourney', 'c5-nyfed', {
          title: 'Real retail spending since Jan 2023',
          source: 'NY Fed · Liberty Street Economics',
          yFormat: 'idx100',
          series: [
            {
              name: 'households earning > $125,000',
              tone: 'up',
              points: [
                [0, 100], [3, 101.5], [6, 103.5], [9, 105], [12, 107],
                [15, 108.5], [18, 110], [21, 111.5], [24, 113], [27, 114.5], [30, 116],
              ],
            },
            {
              name: 'households earning < $40,000',
              tone: 'down',
              points: [
                [0, 100], [3, 98.4], [6, 97.2], [9, 96.8], [12, 97.6],
                [15, 98.8], [18, 100.2], [21, 101.4], [24, 102.6], [27, 103.4], [30, 104.2],
              ],
            },
          ],
          annotations: [
            { at: 18, series: 1, label: 'back to its Jan 2023 level · mid-2024', tone: 'gold', dy: 56 },
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Remember the gas-price spike that tanked sentiment? Split by income: higher-income households spent 19% more on gas while barely driving less; lower-income households cut driving 7% \u2014 and their bill still went up. Same shock, different lived experience.',
        pauseAfter: 700,
        scene: P('gasPump', 'c5-pump', {
          source: 'NY Fed · Liberty Street Economics',
          cards: [
            {
              who: 'higher-income households',
              stats: ['gas spend +19%', 'driving · barely changed'],
              tone: 'up',
            },
            {
              who: 'lower-income households',
              stats: ['driving −7%', 'gas bill still went up'],
              tone: 'down',
            },
          ],
          caption: 'the K — in miniature',
        }),
      },
      {
        // v8 (panel P0-4/P0-5): the debate is now a REAL two-voice argument —
        // documentary style. The narrator sets each economist up, then their
        // own (distinct, free Edge) voice delivers the quote, then the
        // narrator resolves. One flat 20-minute TTS read is the #1 'sounds
        // AI' tell for high-RPM audiences; quoted characters having voices
        // is the single biggest free upgrade to perceived production value.
        vo:
          // v9 (report P0-4): tightened.
          'Not every economist agrees on how severe this is \u2014 and the disagreement is itself useful. Goldman Sachs\u2019 chief U.S. economist initially argued:',
        pauseAfter: 200,
        scene: P('recessionGauge', 'c5-gauge', {
          source: 'Goldman Sachs · Moody\u2019s Analytics',
          debates: [
            { who: 'Goldman Sachs', line: '“the K-shape narrative is somewhat overstated”' },
            { who: 'Moody\u2019s · Mark Zandi', line: '“hanging on by their fingertips” · ~½ of states in state-level recession' },
          ],
          gaugeTo: 48,
          coinChip: '48% — practically a coin flip',
          // v8: mid-roll engagement — the comment prompt rides this scene
          promptChip: 'Before the number lands — what\u2019s YOUR recession odds guess? Comments.',
        }),
      },
      {
        // the Goldman voice — classic news-anchor timbre (free Edge voice)
        vo: 'The K-shape narrative is somewhat overstated.',
        pauseAfter: 200,
        voice: 'en-US-GuyMultilingualNeural',
        voStyle: 'quote',
        scene: P('recessionGauge', 'c5-gauge', {}),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Moody\u2019s Mark Zandi has been far more alarmed \u2014 for much of the past year, roughly half of U.S. states were effectively in a state-level recession. In his words:',
        pauseAfter: 200,
        scene: P('recessionGauge', 'c5-gauge', {}),
      },
      {
        // Zandi's voice — deeper, more urgent (free Edge voice)
        vo: 'Lower-income consumers are hanging on by their fingertips.',
        pauseAfter: 250,
        voice: 'en-US-BrianMultilingualNeural',
        voStyle: 'quote',
        scene: P('recessionGauge', 'c5-gauge', {}),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'At his most alarmed point that spring, Zandi\u2019s own recession model briefly hit 48% \u2014 practically a coin flip. Reasonable, serious people read the same data differently, which tells you this is genuinely contested, not a settled slam dunk in either direction.',
        pauseAfter: 800,
        scene: P('recessionGauge', 'c5-gauge', {}),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch6',
    title: 'Why the top of the K is winning',
    beats: [
      {
        vo: 'Time to answer the “why,” starting with the top of the K.',
        pauseAfter: 450,
        scene: P('host', 'c6-climb', {
          stage: 'kclimb',
          gesture: 'climb',
          expression: 'warm',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'A big piece of it is AI infrastructure spending: analysts working off BEA data estimate AI data centers and software drove roughly three-quarters of U.S. GDP growth in Q1 alone, and the five biggest cloud and AI companies will spend around $700 billion combined this year \u2014 with even the conservative Epoch AI read doubling AI\u2019s pre-2023 GDP share.',
        pauseAfter: 650,
        scene: P('aiDatacenter', 'c6-ai', {
          stats: [
            // v4 (audit P0-1): labels shortened to one clean wrap line so
            // the compact cards read fully inside their bodies
            { big: '¾', label: 'of all U.S. GDP growth · Q1 2026 (BEA estimate)' },
            { big: '1.4–1.5%', label: 'of GDP · AI infrastructure · Epoch AI — 2× pre-2023' },
            { big: '$700–730B', label: '2026 build-out · five biggest cloud & AI companies', tone: 'gold' },
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Meanwhile, S&P 500 profit margins hit 13.4% \u2014 the highest since FactSet began tracking in 2009. Total corporate profits reached $4.42 trillion annualized \u2014 12.4% of GDP, second-highest in data going back to 1947.',
        pauseAfter: 600,
        scene: P('statCards', 'c6-margins', {
          source: 'FactSet',
          cards: [
            { big: '13.4%', label: 'S&P 500 net profit margin · Q1', tag: 'highest since 2009', tone: 'up' },
            { big: '$4.42T', label: 'total U.S. corporate profits · annualized', tag: '', tone: 'gold' },
            { big: '12.4%', label: 'of the entire GDP', tag: '2nd-highest share since 1947', tone: 'up' },
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Put simply: a huge share of the market\u2019s gain is a narrow, capital-intensive AI build-out, owned by a handful of giants. Their profits are gains for whoever owns the shares \u2014 not a paycheck for whoever doesn\u2019t.',
        pauseAfter: 750,
        scene: P('ownerWorker', 'c6-split', {
          left: { title: 'their profits', line: 'gains for whoever owns the shares', tone: 'up' },
          right: { title: 'their spending', line: '…not a paycheck for whoever doesn\u2019t', tone: 'down' },
        }),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch7',
    title: 'Why the bottom of the K is struggling',
    beats: [
      // v9 (report P0-4): the c7-lead host beat is folded into the debt
      // statCards beat's opening line.
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Now the bottom of the K \u2014 starting with debt, because the numbers are stark. 13.1% of credit card balances are 90+ days past due \u2014 one in eight, the worst since 2011. Auto delinquencies just hit a record 5.6%. Total household debt: an all-time high of $18.8 trillion.',
        pauseAfter: 650,
        scene: P('statCards', 'c7-debt', {
          source: 'NY Fed',
          cards: [
            { big: '13.1%', label: 'of card balances 90+ days past due · one in eight', tag: 'highest since 2011', tone: 'down' },
            { big: '5.6%', label: 'auto-loan delinquencies', tag: 'a record in the data', tone: 'down' },
            { big: '$18.8T', label: 'total household debt', tag: 'all-time high', tone: 'gold' },
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Even inside that debt pile there\u2019s a K of its own: prime borrowers are largely fine \u2014 delinquencies concentrate, and rise fastest, where room was least to begin with.',
        pauseAfter: 600,
        scene: P('chartJourney', 'c7-debtk', {
          title: 'A K-shape inside the debt pile',
          source: 'NY Fed',
          yFormat: 'idx100',
          series: [
            { name: 'prime & super-prime', tone: 'up', points: [[0, 100], [6, 100.3], [12, 100.6], [18, 100.9], [24, 101], [30, 101.2]] },
            { name: 'near-prime & subprime', tone: 'down', points: [[0, 100], [6, 103.5], [12, 107], [18, 111], [24, 114.5], [30, 117]] },
          ],
          annotations: [
            { at: 30, series: 0, label: 'largely fine', tone: 'up', dy: -46 },
            { at: 30, series: 1, label: 'rising fastest · least room to begin with', tone: 'down', dy: 50 },
          ],
          chips: ['delinquencies concentrate where room was least'],
        }),
      },
      {
        // v9 (report P0-4): chartJourney → statCards. Three chartJourney
        // beats ran back-to-back here (debtk, collar, anxiety) — the same
        // scene-type fatigue the panel flagged on ch4. The collar beat's
        // two numbers are a comparison, and comparisons are what statCards
        // is FOR. Same facts, new grammar.
        vo:
          'Here\u2019s a surprising wrinkle: for decades the office job was the \u201csafe\u201d one. That\u2019s flipped, at least at the margins \u2014 core white-collar employment is down about 2% since April 2023, while every other sector combined grew almost 4%.',
        pauseAfter: 600,
        scene: P('statCards', 'c7-collar', {
          source: 'Axios / Fortune \u00b7 BLS-based',
          cards: [
            { big: '\u22122%', label: 'core white-collar jobs \u00b7 finance, information, professional services', tag: 'since April 2023', tone: 'down' },
            { big: '+4%', label: 'every other sector combined', tag: 'same span', tone: 'up' },
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'And University of Michigan data puts job-security confidence among the highest-earning third at its lowest since the 2008\u201309 financial crisis. Degree-holders still have meaningfully lower unemployment on average \u2014 but for the first time in a long time, hiring anxiety has shifted toward the desk job.',
        pauseAfter: 650,
        scene: P('chartJourney', 'c7-anxiety', {
          title: 'Job-security confidence · highest-earning third',
          source: 'University of Michigan',
          yFormat: 'index',
          // v3 (panel P1-6): `invert: true` shipped dead (no scene read it).
          // Resolved honestly: a FALLING confidence line already tells this
          // story — what was wrong was the default teal "up" tone on a
          // bad-news metric. Explicit down-tone series instead.
          series: [{ name: '', tone: 'down', points: [
            [0, 96], [3, 93], [6, 90], [9, 88], [12, 86], [15, 84.5],
            [18, 83], [21, 82], [24, 81.2], [27, 80.6], [30, 80.1],
          ] }],
          annotations: [
            { at: 30, label: 'lowest since the 2008–09 financial crisis', tone: 'down', dy: 48 },
          ],
          chips: [
            'degree-holders: still meaningfully lower unemployment on average',
            'but the direction of travel has shifted toward the desk job',
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'So who owns the stocks that are going up? Fed data says the wealthiest one in ten U.S. households own around 87% of all stock-market wealth \u2014 directly and through retirement accounts.',
        pauseAfter: 600,
        scene: P('pieChart', 'c7-own', {
          title: 'Who owns the stock market?',
          source: 'Federal Reserve',
          donut: true,
          slices: [
            { label: 'wealthiest 1 in 10 households', value: 87, tone: 'gold' },
            { label: 'the other 90%', value: 13, tone: 'muted' },
          ],
          centerBig: '87%',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'And that exposure is historic: stocks are now roughly a third of household wealth \u2014 more than the meme boom or the dot-com peak \u2014 while just 58% of adults own any stock at all, down from 62%: the first meaningful drop since 2016.',
        pauseAfter: 650,
        scene: P('barsCompare', 'c7-exposure', {
          title: 'Stocks as a share of U.S. household wealth',
          source: 'Federal Reserve · Axios',
          bars: [
            { label: 'dot-com peak · 2000', value: 22, tone: 'muted' },
            { label: 'meme-stock boom · 2021', value: 26, tone: 'muted' },
            { label: 'now · roughly a third', value: 33, tag: 'a bigger share than both', tone: 'gold' },
          ],
          flipCounter: { from: 62, to: 58, label: 'adults owning any stock at all', tag: 'first meaningful drop since 2016' },
          yMax: 40,
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Put it together and the \u201cparadox\u201d stops being one: the market can sit at record highs while leaving most of the country behind \u2014 most of the country was never really in the market, and the people in it have more riding on it than ever.',
        pauseAfter: 800,
        voStyle: 'urgent',
        dropOut: true, // v8: the bed cuts out before the paradox resolves
        scene: P('paradoxResolve', 'c7-paradox', {}),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch8',
    title: 'The twist: why having money in the market isn’t enough',
    beats: [
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Here\u2019s the twist I promised. If you\u2019re watching this channel, you probably have money in the market \u2014 so you might assume you\u2019re automatically on the winning side of the K. It\u2019s more complicated.',
        pauseAfter: 600,
        voStyle: 'reveal',
        dropOut: true, // v8: silence, then the K-motif slams in on "twist"
        scene: P('host', 'c8-twist', {
          stage: 'spot',
          // v5 (audit P1-3): peak curiosity — the host leans into the twist
          gesture: 'leanIn',
          expression: 'curious',
          ribbon: 'THE TWIST',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'If you\u2019ve simply held an S&P 500 index fund, a huge share of your return came from seven stocks \u2014 one analysis put the Magnificent Seven at roughly 42% of the index\u2019s 2025 return, under 1.5% of its names. That\u2019s real concentration risk \u2014 and exactly why this year\u2019s small-cap rotation made the \u201cboring\u201d diversified investor look smart again.',
        pauseAfter: 700,
        scene: P('fundSplit', 'c8-fund', {
          stats: [
            { big: '42%', label: 'of the S&P 500\u2019s total return in 2025 · seven stocks', tone: 'gold' },
            { big: '<1.5%', label: 'of the names in the index', tone: 'down' },
          ],
          callbackChip: 'sound familiar? the small-cap rotation from earlier',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'One more nuance: that \u201c1 in 4\u201d is an average, not a consensus \u2014 forecasts ranged from 1% to 80%. Prediction markets say 12 to 15%; Zandi\u2019s model touched 48%. Anyone who claims to know what happens next is selling you something.',
        pauseAfter: 800,
        scene: P('oddsSpread', 'c8-odds', {
          source: 'Prediction markets / WSJ survey / Moody\u2019s Analytics',
          markers: [
            { at: 1, label: 'lowest forecast', tone: 'muted' },
            { at: 13.5, label: '12–15% · prediction markets & yield-curve models', tone: 'up', band: [12, 15] },
            { at: 25, label: '25% · the Journal\u2019s survey average', tone: 'gold' },
            { at: 48, label: '48% · Zandi\u2019s model, at its most alarmed', tone: 'down' },
            { at: 80, label: 'highest forecast', tone: 'muted' },
          ],
          kicker: 'an average ≠ a consensus',
          closer: 'anyone who tells you they KNOW what happens next is selling you something',
        }),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch9',
    title: 'Three takeaways',
    beats: [
      // v9 (report P0-4): the takeaways intro beat is cut \u2014 takeaway
      // one now opens the chapter (the overview card added 6.6s of restatement).
      {
        vo:
          // v9 (report P0-4): tightened.
          'One \u2014 three things worth sitting with, not three stocks to buy. First: know what you actually own. Is your \u201cdiversified\u201d portfolio riding a handful of mega-caps \u2014 or genuinely spread across sizes, sectors, and geographies? 2026\u2019s small-cap rotation is why that distinction pays off.',
        pauseAfter: 550,
        scene: P('takeaways', 'c9-one', {
          focus: 1,
          title: 'Know what you actually own',
          points: [
            'concentrated in a handful of mega-caps — or genuinely spread?',
            'company sizes · sectors · geographies',
            '2026\u2019s small-cap rotation: the distinction pays off',
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Two. Don\u2019t confuse \u201cthe market\u201d with \u201cthe economy.\u201d They\u2019re correlated, not identical \u2014 and this year is about as clean a demonstration as the data offers. The honest headline isn\u2019t \u201cconfidence hit a 2022 low.\u201d It\u2019s \u201ccrashed to a 2022 low, then clawed part of the way back.\u201d Both halves matter.',
        pauseAfter: 550,
        scene: P('takeaways', 'c9-two', {
          focus: 2,
          title: 'Don\u2019t confuse “the market” with “the economy”',
          points: [
            'correlated — but not the same measurement',
            'the honest headline needs both halves:',
            '“crashed to a 2022 low, then clawed back part of the way”',
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          // v9 (report P0-4): tightened.
          'Three. Be skeptical of single-number narratives. The honest picture needs more than one chart: prediction markets near 12\u201315%, the Journal\u2019s survey at 25%, Zandi\u2019s model at 48%. Same economy, three conclusions.',
        pauseAfter: 700,
        scene: P('takeaways', 'c9-three', {
          focus: 3,
          title: 'Be skeptical of single-number narratives',
          points: [
            'one poll · one index · one forecast — never enough',
            'the honest picture needs more than one chart',
            '12–15% · 25% · 48% — same economy, three conclusions',
          ],
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'None of that means throwing up your hands. It means knowing which number you\u2019re looking at, and why smart people can disagree about it \u2014 in an economy shaped like this one, that\u2019s usually the difference between reacting to a headline and understanding one.',
        pauseAfter: 700,
        scene: P('host', 'c9-close', {
          stage: 'spot',
          gesture: 'close',
          expression: 'warm',
          headline: 'Reacting to a headline —\nvs actually understanding one.',
          sub: 'Know which number you\u2019re looking at — and why\nsmart people can disagree about it.',
          kicker: 'THE K-SHAPED ECONOMY · THREE TAKEAWAYS',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'Quick, necessary disclaimer: none of this is personalized financial advice, and I\u2019m not a licensed advisor. It\u2019s general education built on public data \u2014 talk to a professional about your specific numbers.',
        pauseAfter: 700,
        scene: P('quoteCard', 'c9-disc', {
          kicker: 'necessary disclaimer',
          lines: [
            'not personalized financial advice · not a licensed advisor',
            'general education, built on public data',
            'your situation may call for different decisions — talk to a professional',
          ],
          icon: 'shield',
          soft: true,
        }),
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ch10',
    title: 'Which side of the K are you on?',
    beats: [
      // v9 (report P0-4): the ch10 recapSplit beat is folded into the
      // comment prompt \u2014 the promise already rode the cold open.
      {
        vo:
          'So \u2014 that\u2019s the whole picture: the whole range, not just the best headline. Quick question before you go: which side of the K did today\u2019s numbers sound like \u2014 for you? Tell me in the comments; I read all of them, and it shapes what I cover next.',
        pauseAfter: 600,
        scene: P('commentPrompt', 'c10-comments', {
          question: 'Which side of the K are you on?',
          sub: 'I read every comment — it shapes what I cover next',
        }),
      },
      {
        vo:
          // v9 (report P0-4): tightened.
          'If you want the follow-up \u2014 what actual portfolio concentration looks like right now, sector by sector, and how to check your own exposure in five minutes \u2014 that\u2019s next week\u2019s video. Subscribe if you want it in your feed. See you in the next one.',
        pauseAfter: 400,
        scene: P('endScreen', 'c10-end', {}),
      },
    ],
  },
];

// ── Upload kit metadata (from the script's discoverability package) ──────────
export const TITLE_OPTIONS = [
  'Why Does Everyone Feel Broke When the Stock Market Is at Record Highs?',
  'The K-Shaped Economy, Explained With Actual Data (Not Vibes)',
  'Markets Are Up 20%. Consumer Confidence Just Had Its Worst Spring Since 2022. Here\u2019s Why.',
];

export const DESCRIPTION_BODY =
  'The market\u2019s at record highs. Consumer confidence just had its worst spring since 2022. Both are true — and the data explains exactly why. No hype, no doom, sources for every number.\n\nThis is what economists are now calling the \u201cK-shaped economy\u201d: one part of the country doing better than ever, another part falling behind, at the same time. This video walks through what\u2019s driving both sides of the K — the AI infrastructure boom, record profit margins, historic stock market concentration, credit card delinquencies, and a surprising shift in who\u2019s actually worried about layoffs — plus what it means if you already have money in the market.';

export const DESCRIPTION_TAIL =
  '\u26a0\ufe0f Not financial advice. This is general education based on public data — talk to a licensed professional about your own situation.\n\nData as of mid-July 2026 — markets and surveys move fast, so treat exact percentages as a snapshot, not a permanent fact.\n\nSubscribe for more data-driven (not vibes-driven) breakdowns of markets and the economy \u2192\n\n#KShapedEconomy #StockMarket #PersonalFinance';

export const KEY_SOURCES_LINE =
  'Gallup Economic Confidence Index · University of Michigan Surveys of Consumers · NY Fed Liberty Street Economics (K-shaped economy research series) · Richmond Fed · FactSet · Federal Reserve stock ownership data · Wall Street Journal Economic Forecast Survey · Moody\u2019s Analytics';

export const TAGS = [
  'k-shaped economy', 'stock market 2026', 'consumer confidence', 'recession odds 2026',
  'S&P 500', 'Nasdaq', 'Russell 2000', 'personal finance', 'stock market concentration',
  'Magnificent Seven stocks', 'household debt', 'AI infrastructure spending',
  'is a recession coming', 'stock market vs economy',
];

export const PINNED_COMMENT =
  'Quick gut-check: which side of the K did today\u2019s numbers sound like for you — the market side, the sentiment side, or a bit of both? Genuinely curious, and it shapes what I cover next.\n\nFull list of every source used in this video, organized by section: [link]';

export const NEXT_VIDEO_DEFAULT =
  'What Portfolio Concentration Looks Like Right Now — Sector by Sector (and a 5-Minute Check of Your Own)';

export const VIDEO_TITLE = 'Why Does Everyone Feel Broke When the Stock Market Is at Record Highs?';

export function totalBeats(): number {
  return SCRIPT.reduce((n, c) => n + c.beats.length, 0);
}

// ── AUDIT-ROUND-2 (fix 28 — THE 10-12 MINUTE FIRST-UPLOAD CUT) ──────────────
/**
 * The runtime cut the audit prescribes for the channel's first uploads:
 * "Tighten the 20-minute film to 10-12 for the channel's first months
 * (chapters 1-2, the twist, the takeaways); publish the rest as sequels.
 * A new channel's retention on a 20-minute explainer is the hardest ask
 * on the platform; the same content as two strong 11-minute films doubles
 * the surface area and halves the risk. Shorts (already built) become the
 * discovery funnel."
 *
 * buildCut() assembles a ChapterSpec[] from any subset of chapter ids —
 * the SAME scene drawers, the SAME poses, the SAME engine: only the
 * chapter list changes. The first-upload cut runs the film's first two
 * chapters (the two numbers + the market + the mood — the complete setup),
 * the twist, the takeaways and the outro: ~11 real minutes with the
 * shipped TTS (the audited 10-12 band). The deep chapters (what the K
 * actually means / the top / the bottom) publish later as sequels.
 * Use it via the harness: `node tools/frame-dump.mjs --cut first ...`
 */
export function buildCut(chapterIds: string[]): ChapterSpec[] {
  const out: ChapterSpec[] = [];
  for (const id of chapterIds) {
    const ch = SCRIPT.find((c) => c.id === id);
    if (ch) out.push(ch);
  }
  return out;
}

/** The first-upload cut — the film's first two chapters (the two numbers +
 *  the market + the mood — the complete setup) + the twist + the takeaways +
 *  the outro: ≈11 real minutes with the shipped TTS (the audit's 10-12
 *  band). The deep chapters publish later as sequels. */
export const FIRST_UPLOAD_CUT: ChapterSpec[] = buildCut(['ch1', 'ch3', 'ch4', 'ch8', 'ch9', 'ch10']);

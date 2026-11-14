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
          'Over the past year, the S&P 500 is up about 18%. The Nasdaq\u2019s up over 20%. Corporate America just posted its highest profit margins on record.',
        pauseAfter: 650,
        scene: P('splitNumbers', 'c1-market', {
          mode: 'left',
          cornerNote: 'sources for every stat in this video are linked below',
          stats: [
            { big: '+18%', label: 'S&P 500 · past year', tone: 'up' },
            { big: '+20%', label: 'Nasdaq · past year', tone: 'up' },
            { big: 'RECORD', label: 'corporate profit margins', tone: 'gold' },
          ],
        }),
      },
      {
        vo:
          'Now the other number. In the spring of 2026, consumer confidence cratered to its worst level since 2022 — only 16% of Americans called the economy “good” or “excellent.” And when the Wall Street Journal asked 72 professional economists in its July survey what the odds of a recession are, the average answer was 1 in 4.',
        pauseAfter: 650,
        scene: P('splitNumbers', 'c1-market', {
          mode: 'vs',
          cornerNote: 'sources for every stat in this video are linked below',
          stats: [
            { big: '16%', label: 'called the economy “good” or “excellent”', tone: 'down' },
            { big: '1 in 4', label: 'average recession odds · 72 economists (WSJ)', tone: 'down' },
          ],
        }),
      },
      {
        vo: 'Same country. Same year. Two completely different stories.',
        pauseAfter: 550,
        voStyle: 'reveal',
        scene: P('splitNumbers', 'c1-market', {
          mode: 'vs-punch',
          cornerNote: 'sources for every stat in this video are linked below',
          stats: [],
        }),
      },
      {
        vo:
          'Economists have a name for this now — the “K-shaped economy.” If you\u2019ve got money in the market, this isn\u2019t trivia. And stick around, because there\u2019s a twist later in this video that applies directly to your portfolio — not just to people watching from the sidelines. Let\u2019s go through the real data — all of it, not just the parts that make the better headline.',
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
          'And that last one had a genuinely wild ride to get there. It fell hard in March, into the low-23,000s, on a tariff-driven selloff. Then it ripped more than 30% off that low in about ten weeks, crossing 30,000 for the first time ever in early June. Both the S&P and Nasdaq hit fresh all-time highs this summer, and even after a pullback the last couple of weeks, they\u2019re still sitting within a few percent of those peaks.',
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
            // DOSSIER FOLLOW-UP: the 20/30 pills stacked at the same clamped
            // row and overprinted each other AND the peak-band label. Rows
            // separated: the 30k crossing annotates BELOW its point, the
            // +30% payoff keeps the top row (below the band label).
            { at: 11, label: 'low-23,000s · March', tone: 'down', dy: 40 },
            { at: 20, label: 'crosses 30,000 · June — first time ever', tone: 'gold', dy: 46 },
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
          'That same top ten accounted for roughly 31% of its total earnings. The “Magnificent Seven” — Nvidia, Microsoft, Apple, Alphabet, Amazon, Meta, Tesla — are projected by Goldman Sachs to drive close to 46% of all S&P 500 earnings growth this year.',
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
          // P2 density payload (100-judge dossier, Prototype 8-2): the
          // statement frame stops being a typographic desert — a 500-dot
          // index field draws behind the type with the 7 gold members
          // bracketed and labelled. The sentence the film is speaking,
          // drawn behind the words that say it.
          dotPayoff: { gold: 7, total: 500, label: 'of 500 decide the year' },
        }),
      },
      {
        vo:
          'But here\u2019s the twist almost nobody\u2019s covering: 2026 actually broke that pattern, at least for a while. The Russell 2000 — small-cap stocks — is having its best year since 2003, up roughly 20% year-to-date as of mid-July. That\u2019s ahead of the S&P 500\u2019s 11% YTD, and it\u2019s crushed the Magnificent Seven\u2019s roughly 4% YTD gain over the same stretch. For the first time in a few years, “the market” hasn\u2019t simply meant “seven tech stocks.” Keep that in mind — it matters a lot later in this video.',
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
      {
        vo:
          'Now the other side of the K — and this is where the story actually gets more interesting than one scary number.',
        pauseAfter: 500,
        scene: P('host', 'c4-flip', {
          stage: 'kflip',
          // v5 (audit P1-3): 'flip' was a dead gesture name (rendered idle) —
          // the intended beat is curiosity about the other side of the K
          gesture: 'leanIn',
          expression: 'curious',
        }),
      },
      {
        vo:
          'Gallup has tracked Americans\u2019 economic mood since 1996. This May, its Economic Confidence Index cratered to negative 45 — tying its worst reading since October 2022. Only 16% of Americans — roughly one in six — rated the economy “excellent” or “good.” Roughly half called it “poor.”',
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
            { at: 15, label: '−33', tone: 'up', dy: 40 },
          ],
          extraStats: [
            { big: '16%', label: 'rated the economy “excellent” or “good” — one in six' },
            { big: '~½', label: 'called it “poor”' },
          ],
        }),
      },
      {
        vo:
          'Here\u2019s the part a lot of coverage missed, because it happened after most of that coverage was published: that number has since climbed back to around negative 33 to negative 35 in June and July. So if you\u2019re the kind of person who double-checks a video essay\u2019s numbers — good, you should be — no, confidence hasn\u2019t stayed frozen at a 2022 low. It clawed back real ground.',
        pauseAfter: 550,
        scene: P('chartJourney', 'c4-gallup', {
          title: 'Gallup Economic Confidence Index',
          source: 'Gallup',
          yFormat: 'eci',
          phase: 'recovery',
          points: [
            [0, -18], [2, -22], [4, -28], [6, -34], [8, -39], [10, -43],
            [11, -45], [12, -44], [13, -41], [14, -37], [15, -33], [16, -35],
          ],
          annotations: [
            { at: 11, label: '−45 · May', tone: 'down', dy: 42 },
            { at: 15, label: 'climbed back to −33 to −35 · June–July', tone: 'up', dy: 46 },
          ],
          extraStats: [{ big: '✓', label: 'double-check every number in this video — please do', tone: 'up' }],
        }),
      },
      {
        vo:
          'What crashed it in the first place was a spike in gas and oil prices tied to the conflict with Iran; what\u2019s driven the partial recovery is those same prices easing as tensions cooled. But “clawed back some ground” and “fine” are not the same thing. Negative 33 is still worse than nearly every other reading of the last four years. This is a real rebound sitting inside a still-bad number, not a return to normal.',
        pauseAfter: 650,
        scene: P('chartJourney', 'c4-gallup', {
          title: 'A real rebound — inside a still-bad number',
          source: 'Gallup',
          yFormat: 'eci',
          phase: 'zoom',
          points: [
            [0, -18], [2, -22], [4, -28], [6, -34], [8, -39], [10, -43],
            [11, -45], [12, -44], [13, -41], [14, -37], [15, -33], [16, -35],
          ],
          annotations: [
            { at: 15, label: '−33 · still worse than nearly every reading of the last 4 years', tone: 'gold', dy: 52 },
          ],
          band: { from: -40, to: -20, label: 'typical range · last four years' },
          chips: ['crashed by: gas & oil price spike · Iran conflict', 'recovered by: same prices easing'],
        }),
      },
      {
        vo:
          'Same story from the University of Michigan. Its Consumer Sentiment Index cratered to an all-time low in May, hit by that same energy-price spike. It\u2019s climbed for two straight months since, up to a five-month high in July — but it\u2019s still down roughly 12% from a year earlier, and the survey\u2019s own director put it bluntly: “consumers are hardly ebullient about the economy.”',
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
          quote: '“consumers are hardly ebullient about the economy” — the survey\u2019s own director',
        }),
      },
      {
        vo:
          'One honest caveat on that number, though: most of the interviews behind it wrapped up before fighting with Iran reignited and gas prices started climbing again — so the mood by the time you\u2019re watching this may already be softer than that five-month high suggests.',
        pauseAfter: 600,
        scene: P('quoteCard', 'c4-caveat', {
          kicker: 'one honest caveat',
          lines: [
            'most interviews wrapped before Iran tensions reignited',
            'the mood by the time you watch may already be softer',
          ],
          icon: 'asterisk',
          hostGesture: 'shrug',
        }),
      },
      {
        vo:
          'The Conference Board\u2019s Consumer Confidence Index — a completely separate survey, run by a completely separate organization — has traced a similar arc: a multi-year low this spring, a small tick up since.',
        pauseAfter: 500,
        scene: P('chartJourney', 'c4-cb', {
          title: 'The Conference Board · Consumer Confidence',
          source: 'The Conference Board',
          yFormat: 'index',
          points: [
            [0, 104], [2, 101], [4, 97], [6, 93], [8, 90.5], [10, 89],
            [11, 88.2], [12, 88.9], [13, 90.4], [14, 91.6], [15, 92.3],
          ],
          annotations: [
            { at: 11, label: 'multi-year low · spring', tone: 'down', dy: 42 },
            { at: 15, label: 'a small tick up', tone: 'up', dy: -44 },
          ],
          chips: ['a completely separate survey', 'a completely separate organization'],
        }),
      },
      {
        vo:
          'Three surveys. Three different methodologies. Three organizations with no reason to coordinate. All landing on the same shape at the same time: a real crash this spring, a real but partial recovery since, and a level that\u2019s still historically weak on every single one of them. That shape — not one scary number — is the honest picture. A channel that only shows you the negative-45 and never mentions the bounce-back is technically telling you a true fact in service of a less-true story. We\u2019re not doing that here.',
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
      {
        vo:
          'So: markets near record highs. Sentiment that crashed and only partly recovered. Same economy, same months. Economists have a name for this, and it\u2019s worth actually defining instead of just repeating.',
        pauseAfter: 550,
        scene: P('recapSplit', 'c5-recap', {}),
      },
      {
        vo:
          'Economists at the Richmond Fed define it plainly: the economy is K-shaped when outcomes for the bottom of the income distribution get worse at the same time outcomes for the top get better. Same starting point. Same economy. Two lines that diverge — like the two strokes of the letter K.',
        pauseAfter: 600,
        scene: P('kDef', 'c5-kdef', {
          definition:
            'outcomes for the bottom get worse while outcomes for the top get better',
          source: 'Richmond Fed',
        }),
      },
      {
        vo:
          'This isn\u2019t an internet theory. The New York Fed hosted an entire academic symposium on the K-shaped economy this spring. Economists at U.S. Bank, the Bank of America Institute, Goldman Sachs, and Moody\u2019s have all published research using this exact framework in 2026.',
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
          'And it shows up in hard data, not just vibes. New York Fed researchers tracked real retail spending since January 2023 and found it\u2019s been driven almost entirely by households earning more than $125,000 a year. Spending among households earning under $40,000 actually fell for a stretch — it didn\u2019t climb back to its January 2023 level until the middle of 2024.',
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
          'Remember that Iran-linked gas price spike from a minute ago — the one that tanked consumer sentiment? Split it by income and you can see the K in miniature. When energy prices spiked in March, higher-income households increased what they spent on gas by 19% — while barely changing how much they actually drove. Lower-income households cut their actual driving by 7%, and their gas bill still went up. Same price shock, at the same time, in the same country. Completely different lived experience.',
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
          'Not every economist agrees on how severe this is — and that disagreement is itself useful. Goldman Sachs\u2019 chief U.S. economist initially argued:',
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
          'Moody\u2019s Mark Zandi has been far more alarmed, saying for much of the past year that roughly half of U.S. states were effectively in a state-level recession — in his words:',
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
          'At his most alarmed point, in that same spring, as the Iran conflict escalated, Zandi\u2019s own recession model briefly hit 48% — practically a coin flip. Reasonable, serious people are reading the same data differently, which tells you this is genuinely contested, not a settled slam dunk in either direction.',
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
          'A big piece of it is AI infrastructure spending — and the scale of it is hard to overstate. Several analysts, working off Bureau of Economic Analysis data, estimate AI-related data center and software investment accounted for something like three-quarters of all U.S. economic growth in the first quarter of 2026 alone. That\u2019s one estimate. Even the more conservative, research-first read — from the independent nonprofit Epoch AI — puts AI infrastructure investment at around 1.4 to 1.5% of GDP right now, more than double its share from before 2023. Either way, the five biggest cloud and AI companies alone are on track to spend somewhere around $700 to $730 billion combined on this build-out in 2026.',
        pauseAfter: 650,
        scene: P('aiDatacenter', 'c6-ai', {
          stats: [
            // v4 (audit P0-1): labels shortened to one clean wrap line so
            // the compact cards read fully inside their bodies
            // D-2 (100-judge dossier): glance strings sized to TWO wrap rows
            // — the drawer now grows the plate to fit its label (so nothing
            // bleeds onto the room), and two rows keep the grown bottoms
            // clear of the walk host's envelope (scene raises cards 2-3).
            { big: '¾', label: 'of all U.S. GDP growth · Q1 2026 (BEA estimate)' },
            { big: '1.4–1.5%', label: 'of GDP · AI infrastructure (Epoch AI)' },
            { big: '$700–730B', label: '2026 build-out · top five cloud & AI firms', tone: 'gold' },
          ],
        }),
      },
      {
        vo:
          'Meanwhile, corporate profit margins for the S&P 500 hit 13.4% in the first quarter — the highest since FactSet started tracking that number back in 2009. Total U.S. corporate profits reached $4.42 trillion annualized, which works out to 12.4% of the entire GDP — the second-highest share on record, in data going back to 1947.',
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
          'Put simply: a huge amount of the market\u2019s gain is a historically narrow, capital-intensive AI build-out, funded and owned by a small number of enormous companies. Their profits show up as gains for whoever owns their shares. Their spending doesn\u2019t show up as a paycheck for whoever doesn\u2019t.',
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
      {
        vo: 'Now flip to the bottom of the K — and start with debt, because the numbers here are stark.',
        pauseAfter: 500,
        scene: P('host', 'c7-lead', {
          stage: 'kdescend',
          // v5 (audit P1-3): 'flip' was dead (rendered idle); the beat is
          // bracing the viewer for stark debt numbers — facepalm dismay
          gesture: 'facepalm',
          expression: 'serious',
        }),
      },
      {
        vo:
          'New York Fed data shows 13.1% of credit card balances — roughly one in eight — are at least 90 days past due, the highest that figure\u2019s been since 2011. Auto loan delinquencies just hit 5.6%, a record in the data. Total household debt sits at an all-time high of $18.8 trillion.',
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
          'And even inside that debt pile, there\u2019s a K-shape of its own: borrowers with strong credit — prime and super-prime — are largely fine. The delinquencies are concentrated in, and rising fastest among, the borrowers who had the least room to begin with: near-prime and subprime.',
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
        vo:
          'Here\u2019s a genuinely surprising wrinkle, too: for most of the last few decades, the office job was the “safe” one. That\u2019s flipped, at least at the margins. Employment in finance, information, and professional business services — call it core white-collar work — has shrunk about 2% since April 2023, while every other sector combined has grown almost 4% over the same span.',
        pauseAfter: 600,
        scene: P('chartJourney', 'c7-collar', {
          title: 'Employment since April 2023',
          source: 'Axios / Fortune · BLS-based',
          yFormat: 'pct',
          series: [
            { name: 'core white-collar · finance, information, professional services', tone: 'down', points: [[0, 0], [4, -0.5], [8, -0.9], [12, -1.2], [16, -1.5], [20, -1.7], [24, -1.9], [28, -2.0]] },
            { name: 'every other sector combined', tone: 'up', points: [[0, 0], [4, 0.7], [8, 1.4], [12, 2.0], [16, 2.5], [20, 3.0], [24, 3.5], [28, 3.9]] },
          ],
          annotations: [
            { at: 28, series: 0, label: '−2%', tone: 'down', dy: -46 },
            { at: 28, series: 1, label: 'almost +4%', tone: 'up', dy: 52 },
          ],
          chips: ['the “safe” office job — flipped, at least at the margins'],
        }),
      },
      {
        vo:
          'University of Michigan data shows job-security confidence among the highest-earning third of Americans sitting at its lowest levels since the 2008–2009 financial crisis. It\u2019s not that blue-collar workers are suddenly thriving across the board — degree-holders still have meaningfully lower unemployment on average — but for the first time in a long time, the direction of travel on hiring anxiety has shifted toward the desk job, not away from it.',
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
          'So who actually owns the stocks that are going up? Here\u2019s where it gets stark. Federal Reserve data shows the wealthiest one in ten U.S. households own around 87% of all stock market wealth, held directly and through retirement accounts.',
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
          'And that exposure is itself historic: stocks now make up roughly a third of total U.S. household wealth — a bigger share than during the 2021 meme-stock boom, bigger than at the peak of the dot-com bubble in 2000. Meanwhile, just over half of American adults — 58%, down from 62% a year earlier — own any stock at all right now, the first meaningful drop in stock ownership since 2016.',
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
          'Put that all together, and the “paradox” in the headline stops being a paradox. The market can be at record highs and genuinely be leaving most of the country behind — because most of the country was never really in the market to begin with, and the people who are in it have more riding on it than ever.',
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
          'Here\u2019s the twist I promised at the top. If you\u2019re watching this channel, you probably already have money in the market — which might make you assume you\u2019re automatically on the winning side of the K. It\u2019s more complicated than that.',
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
          'If you\u2019ve simply been holding a plain S&P 500 index fund the last couple of years, a huge share of your return has come from seven stocks. One advisory firm\u2019s analysis put the Magnificent Seven\u2019s share of the S&P 500\u2019s total return at around 42% in 2025 alone — despite being under 1.5% of the names in the index. That\u2019s real, widely-discussed concentration risk. And it\u2019s exactly why this year\u2019s small-cap rotation caught so many portfolios off guard in the other direction — the diversified investor who\u2019d been “underperforming” for holding boring, broad small-cap exposure suddenly looked smart again.',
        pauseAfter: 700,
        scene: P('fundSplit', 'c8-fund', {
          stats: [
            // D-3 (100-judge dossier): glance strings sized to wrap cleanly
            // inside the compact chip (the drawer draws up to 2 lines).
            { big: '42%', label: 'of the S&P 500\u2019s 2025 return · seven stocks', tone: 'gold' },
            { big: '<1.5%', label: 'of the names in the index', tone: 'down' },
          ],
          callbackChip: 'sound familiar? the small-cap rotation from earlier',
        }),
      },
      {
        vo:
          'One more piece of nuance before we get to takeaways. That “1 in 4” recession number from the Journal\u2019s survey is an average, not a consensus. Individual forecasts in that same July survey ranged from 1% all the way to 80%. Prediction markets and yield-curve models — the bond-market signals that have historically been decent recession predictors — put the odds closer to 12 to 15%. Zandi\u2019s model, at its most alarmed point that spring, was pushing 48%. That\u2019s not a rounding error — that\u2019s some of the most credentialed people in the field looking at the same economy and landing in wildly different places. Anyone who tells you they know what happens next is selling you something.',
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
      {
        vo: 'So — three things actually worth sitting with here. Not three stocks to buy.',
        pauseAfter: 600,
        scene: P('takeaways', 'c9-intro', {
          focus: 0,
        }),
      },
      {
        vo:
          'One. Know what you actually own. Check whether your “diversified” portfolio is quietly riding concentration in a handful of mega-cap names, or whether it\u2019s genuinely spread across company sizes, sectors, and geographies. 2026\u2019s small-cap rotation is a live example of why that distinction pays off.',
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
          'Two. Don\u2019t confuse “the market” with “the economy.” They\u2019re correlated, but they are not the same measurement — and this year is about as clean a real-world demonstration of that gap as you\u2019ll find in the data. That includes sentiment, by the way: the honest headline isn\u2019t “confidence hit a 2022 low.” It\u2019s “confidence crashed to a 2022 low, then clawed back part of the way.” Both halves of that sentence matter.',
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
          'Three. Be skeptical of any single-number narrative — one poll, one index, one economist\u2019s forecast. The honest picture always needs more than one chart. That\u2019s exactly why the range of recession forecasts matters more than whichever single headline number goes viral: prediction markets near 12 to 15%, the Journal\u2019s survey averaging 25%, Zandi\u2019s model touching 48% at its most alarmed. Same economy, same data, three very different conclusions.',
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
          'None of that means throwing up your hands. It means knowing which number you\u2019re looking at, and why smart people can disagree about it — because in an economy shaped like this one, that\u2019s usually the difference between reacting to a headline and actually understanding one.',
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
          'Quick, necessary disclaimer: none of this is personalized financial advice, and I\u2019m not a licensed advisor. This is general education built on public data — your own situation may call for very different decisions, so talk to a professional about your specific numbers.',
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
      {
        vo:
          'That\u2019s the whole picture — the good parts, the bad parts, and the parts that got better since the last headline you saw about this. That\u2019s the deal on this channel: the whole range, not just whichever end makes the best headline.',
        pauseAfter: 600,
        scene: P('recapSplit', 'c10-recap', {
          motto: 'the whole range — not just the best headline',
        }),
      },
      {
        vo:
          'Quick question before you go: which side of the K did today\u2019s numbers sound like — for you, specifically? Tell me in the comments. I read all of them, and it genuinely shapes what I cover next.',
        pauseAfter: 600,
        scene: P('commentPrompt', 'c10-comments', {
          question: 'Which side of the K are you on?',
          sub: 'I read every comment — it shapes what I cover next',
        }),
      },
      {
        vo:
          'If you want the follow-up to this — what actual portfolio concentration looks like right now, sector by sector, and how to check your own exposure in five minutes — that\u2019s next week\u2019s video. Subscribe if you want it in your feed. See you in the next one.',
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

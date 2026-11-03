/**
 * The analytics loop (audit P2-3) — per-beat retention + thumbnail
 * experiments, logged back into the project from YouTube Studio.
 *
 * "Turns every upload into a measured experiment." The workflow:
 *
 *   1. ship the render (the studio's upload kit)
 *   2. a few days later, export from YouTube Studio:
 *        · Audience retention table  (Analytics → Engagement)
 *        · Thumbnail Test & Compare  (Content → ⋮ → Test & Compare)
 *   3. run:  node scripts/ingest-analytics.mjs retention.csv thumbs.csv
 *   4. the ingest script writes analytics-data.json; from then on the
 *      studio shows every beat's measured retention, flags the cliffs,
 *      and tracks the thumbnail race — and the next script edit starts
 *      from evidence, not vibes.
 *
 * Pure data + pure functions; runs in the studio page, the render harness,
 * and node scripts identically. The committed analytics-data.json is a
 * scaffold (empty measurements) so fresh clones render identically.
 */

import raw from './analytics-data.json';

export interface BeatRetention {
  /** share of viewers still watching at the beat's start, 0..100 */
  viewers?: number;
  /** viewers lost per minute across this beat, in points (−4 = a cliff) */
  dropPerMin?: number;
  /** free-form note for the next script edit ("cut this beat", "hold") */
  note?: string;
}

export interface ThumbnailExperiment {
  /** matches drawThumbnail()'s variant parameter */
  variant: 0 | 1 | 2;
  /** the studio's upload-kit label (A / B / C) */
  label: string;
  /** what this variant is testing — the experiment's hypothesis */
  hypothesis: string;
  /** Test & Compare results (filled by the ingest script) */
  impressions?: number;
  /** click-through rate, 0..100 */
  ctr?: number;
  /** average view duration the platform reports (seconds) */
  avgViewSec?: number;
}

export interface AnalyticsData {
  video: {
    videoId?: string;
    publishedAt?: string;
    /** when the CSVs were last ingested */
    fetchedAt?: string;
  };
  /** keyed `${chapterId}-${beatIndex}` — survives timeline rebuilds */
  beats: Record<string, BeatRetention>;
  thumbnails: ThumbnailExperiment[];
}

const data = raw as AnalyticsData;

/** The loaded analytics (the committed file, or whatever the ingest wrote). */
export function analytics(): AnalyticsData {
  return data;
}

/** Stable beat key — the same key the ingest script computes. */
export function beatKey(chapterId: string, beatIndex: number): string {
  return `${chapterId}-${beatIndex}`;
}

/** Retention record for a beat (undefined when nothing measured yet). */
export function beatRetention(
  chapterId: string,
  beatIndex: number
): BeatRetention | undefined {
  return data.beats[beatKey(chapterId, beatIndex)];
}

/** The beats with measured retention, worst drop-per-minute first. */
export function retentionCliffs(limit = 5): { key: string; r: BeatRetention }[] {
  return Object.entries(data.beats)
    .filter(([, r]) => typeof r.dropPerMin === 'number')
    .map(([key, r]) => ({ key, r }))
    .sort((a, b) => (a.r.dropPerMin ?? 0) - (b.r.dropPerMin ?? 0))
    .slice(0, limit);
}

/** True when any thumbnail experiment has results recorded. */
export function hasThumbnailResults(): boolean {
  return data.thumbnails.some((t) => typeof t.ctr === 'number' && t.ctr > 0);
}

/** The current thumbnail leader, if the race has data. */
export function thumbnailLeader(): ThumbnailExperiment | null {
  if (!hasThumbnailResults()) return null;
  return [...data.thumbnails].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0];
}

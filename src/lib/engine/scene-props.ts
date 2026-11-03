/**
 * Scene props validator (panel P1-6, report §2.8 / Appendix A #6).
 *
 * WHY: scene props are typed `Record<string, any>`, so a misspelled or
 * unimplemented prop silently no-ops. Three shipped examples were found that
 * way by the panel: `invert: true` (c7-anxiety), `mini: true` (c4-cb) and
 * `hostCount: true` (c9-intro) — none were read by any scene drawer. All
 * three have now been RESOLVED in the script (the c7-anxiety beat carries an
 * explicit down-tone series; c4-cb and c9-intro drop the no-op keys) — and
 * this table + validator keeps the next one from shipping silently.
 *
 * Runs once at prepare-time in dev; zero cost in the encode.
 */

import { SCRIPT } from './script-data';

/**
 * Allowed props per scene type, beyond the universal { type, sceneKey }.
 * Keys the engine actually reads — extend as scenes grow.
 */
export const SCENE_PROPS: Record<string, string[]> = {
  host: ['stage', 'gesture', 'expression', 'entrance', 'headline', 'sub',
         'kicker', 'ribbon', 'chip', 'lookRight', 'lookLeft'],
  channelIntro: [],
  splitNumbers: ['mode', 'cornerNote', 'stats'],
  divergeK: ['twistChip'],
  chartTwin: ['charts', 'extraBadge', 'source'],
  chartJourney: ['title', 'source', 'yFormat', 'points', 'series', 'phase',
                 'annotations', 'band', 'peakBand', 'extraStats', 'chips',
                 'quote'],
  pieChart: ['title', 'source', 'slices', 'donut', 'centerBig'],
  dotGrid: ['total', 'highlight', 'caption'],
  magChips: ['chips', 'stats', 'source'],
  barsCompare: ['title', 'source', 'bars', 'flipCounter', 'rememberChip', 'yMax'],
  trioConverge: ['motto', 'sub'],
  kDef: ['definition', 'source'],
  credibilityChips: ['kicker', 'chips', 'year'],
  gasPump: ['source', 'cards', 'caption'],
  recessionGauge: ['source', 'debates', 'gaugeTo', 'coinChip'],
  aiDatacenter: ['stats'],
  statCards: ['source', 'cards'],
  ownerWorker: ['left', 'right'],
  fundSplit: ['stats', 'callbackChip'],
  oddsSpread: ['source', 'markers', 'kicker', 'closer'],
  bigText: ['lines'],
  stampCard: ['stamp', 'sub', 'expression'],
  quoteCard: ['kicker', 'lines', 'icon', 'soft', 'hostGesture'],
  takeaways: ['focus', 'title', 'points'],
  commentPrompt: ['question', 'sub'],
  endScreen: [],
  recapSplit: ['motto'],
  paradoxResolve: [],
};

/**
 * Keys that were once shipped dead and are intentionally NOT in the allowed
 * table. If someone re-adds one, the validator explains the resolution
 * instead of just saying "unknown key".
 */
const KNOWN_DEAD: Record<string, string> = {
  invert: 'resolved: the c7-anxiety falling-confidence line is drawn with an explicit down-tone series (see script-data); if you need a flipped y-axis, implement invertY in charts.ts lineChart() first',
  mini: 'resolved: removed from c4-cb — chartJourneyScene has no mini variant; implement one or drop the key',
  hostCount: 'resolved: removed from c9-intro — the counting host is always drawn on the takeaways intro (focus 0)',
  hostSide: 'resolved: divergeKScene always stages the host on the left; the v2 dead `void hostSide` line is gone',
};

export interface PropsIssue {
  beat: string;      // e.g. "4-2" (chapter-beat)
  sceneType: string;
  key: string;
  hint?: string;
}

/** Validate every beat's scene props against the allowed-keys table. */
export function validateSceneProps(): PropsIssue[] {
  const issues: PropsIssue[] = [];
  SCRIPT.forEach((chapter, ci) => {
    chapter.beats.forEach((beat, bi) => {
      const s = beat.scene as Record<string, unknown>;
      const allowed = SCENE_PROPS[String(s.type)] ?? null;
      if (!allowed) {
        issues.push({ beat: `${ci}-${bi}`, sceneType: String(s.type), key: '(unknown scene type)' });
        return;
      }
      for (const k of Object.keys(s)) {
        if (k === 'type' || k === 'sceneKey') continue;
        if (!allowed.includes(k)) {
          issues.push({ beat: `${ci}-${bi}`, sceneType: String(s.type), key: k, hint: KNOWN_DEAD[k] });
        }
      }
    });
  });
  return issues;
}

/** Console report — used by pipeline at prepare-time (dev only). */
export function logScenePropsIssues(): number {
  const issues = validateSceneProps();
  if (issues.length) {
    console.warn('[scene-props] unknown keys (beat scene.key):');
    for (const it of issues) {
      console.warn(
        `  ch${it.beat} ${it.sceneType}: "${it.key}"${it.hint ? ' — ' + it.hint : ''}`
      );
    }
  }
  return issues.length;
}

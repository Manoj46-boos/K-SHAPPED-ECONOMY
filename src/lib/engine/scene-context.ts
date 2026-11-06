/** Shared scene drawing context. */
import { BeatSpec } from './script-data';

export interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** ms since the start of this beat */
  beatT: number;
  /** ms since the start of the scene group (beats sharing sceneKey) */
  t: number;
  /** scene group duration ms */
  d: number;
  /** scene group progress 0..1 */
  p: number;
  /** current beat progress 0..1 */
  beatP: number;
  /** current beat's scene props */
  s: Record<string, any>;
  beat: BeatSpec;
  speaking: boolean;
  /** word onset times local to the beat (ms) */
  wordTimes: number[];
  channelName: string;
  nextVideoTitle: string;
  /** v8: this chapter's ambient wash tone (the chapter color journey).
   *  Scenes pass this to paintBg() so a 20-minute film travels through
   *  color instead of one flat white. Optional for backward compat. */
  chapterTone?: 'up' | 'down' | 'gold' | 'neutral';
}

export type SceneDrawer = (g: SceneCtx) => void;

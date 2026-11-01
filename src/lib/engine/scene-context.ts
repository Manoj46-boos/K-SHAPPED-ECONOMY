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
}

export type SceneDrawer = (g: SceneCtx) => void;

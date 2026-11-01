/** Small helpers shared by the pipeline (kept isolated for clean imports). */
import { SCRIPT } from './script-data';
import { splitSentences } from './easing';

export { SCRIPT };

export function splitSentencesSafe(text: string): string[] {
  try {
    return splitSentences(text);
  } catch {
    return [text];
  }
}

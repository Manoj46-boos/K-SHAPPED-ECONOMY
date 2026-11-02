/**
 * Type-check guard — runs before every dev session / render so a broken
 * build can never ship silently again (root cause of the v1 commit slip).
 *
 * Usage:  npm run typecheck
 */
import { execSync } from 'child_process';

try {
  execSync('tsc --noEmit', { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname });
  console.log('typecheck: OK');
} catch (e) {
  process.exit(e.status ?? 1);
}

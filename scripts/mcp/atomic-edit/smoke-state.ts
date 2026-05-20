import * as crypto from 'node:crypto';
export const state = { passed: 0, failed: 0 };
export function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    state.passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    state.failed++;
    process.stdout.write(`  FAIL  ${name} ${detail}\n`);
  }
}
export const sha = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex');

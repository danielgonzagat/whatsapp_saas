import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverPages, parseElementsFromFile } from '../ui-crawler';

const tempDirs: string[] = [];

function writeTempComponent(source: string): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ui-crawler-'));
  tempDirs.push(rootDir);
  const filePath = path.join(rootDir, 'component.tsx');
  fs.writeFileSync(filePath, source);
  return filePath;
}

function writeTempPage(relFromApp: string, source: string): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ui-crawler-'));
  tempDirs.push(rootDir);
  const filePath = path.join(rootDir, 'frontend', 'src', 'app', relFromApp, 'page.tsx');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
  return rootDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ui-crawler risk discovery', () => {
  it('keeps route and label words as raw signals instead of risk authority', () => {
    const filePath = writeTempComponent(`
      export function Component() {
        return <button>Pagar Pix</button>;
      }
    `);

    const [button] = parseElementsFromFile(filePath, '/checkout');

    expect(button?.risk).toBe('medium');
    expect(button?.status).toBe('no_handler');
  });

  it('derives elevated risk from DOM and handler evidence', () => {
    const filePath = writeTempComponent(`
      export function Component() {
        return (
          <form method="post" action="/api/opaque">
            <button>Submit</button>
          </form>
        );
      }
    `);

    const [form] = parseElementsFromFile(filePath, '/opaque');

    expect(form?.risk).toBe('high');
    expect(form?.linkedEndpoint).toBe('/api/opaque');
  });

  it('honors explicit DOM risk attributes when present', () => {
    const filePath = writeTempComponent(`
      export function Component() {
        return <button data-risk="critical" onClick={() => fetch('/api/opaque')}>Run</button>;
      }
    `);

    const [button] = parseElementsFromFile(filePath, '/opaque');

    expect(button?.risk).toBe('critical');
    expect(button?.linkedEndpoint).toBe('/api/opaque');
  });

  it('does not classify endpoint words as fake without explicit source evidence', () => {
    const filePath = writeTempComponent(`
      export function Component() {
        return <button onClick={() => fetch('/api/mock')}>Run</button>;
      }
    `);

    const [button] = parseElementsFromFile(filePath, '/opaque');

    expect(button?.linkedEndpoint).toBe('/api/mock');
    expect(button?.status).toBe('works');
  });

  it('extracts API endpoints from TypeScript call expressions instead of client-name hardcode', () => {
    const filePath = writeTempComponent(`
      type Result = { ok: boolean };
      export function Component() {
        const runtimeClient = { send<T>(_url: string): T { throw new Error('fixture only'); } };
        return <button onClick={() => runtimeClient.send<Result>('/api/typed-call')}>Run</button>;
      }
    `);

    const [button] = parseElementsFromFile(filePath, '/opaque');

    expect(button?.linkedEndpoint).toBe('/api/typed-call');
    expect(button?.risk).toBe('high');
  });

  it('uses route group syntax parsing for auth discovery', () => {
    const rootDir = writeTempPage(
      path.join('(requireAuth)', 'dashboard'),
      `
        export default function Page() {
          return <main>Dashboard</main>;
        }
      `,
    );

    const [page] = discoverPages(rootDir);

    expect(page?.url).toBe('/dashboard');
    expect(page?.authRequired).toBe(true);
  });
});

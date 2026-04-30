import { describe, expect, it } from 'vitest';
import {
  bodyCallsHookFunction,
  componentHasSaveHandler,
  hasApiCall,
} from '../parsers/ui-handler-resolver-utils';

describe('ui handler resolver utils', () => {
  it('discovers API-backed handlers from source evidence instead of fixed handler names', () => {
    const source = `
      export function Component() {
        const executeOpaqueWorkflow = async () => {
          await transport('/api/runtime-discovered');
        };

        return <button onClick={executeOpaqueWorkflow}>Run</button>;
      }
    `;

    expect(componentHasSaveHandler(source)).toBe(true);
  });

  it('does not trust fixed save-like names without API evidence', () => {
    const source = `
      export function Component() {
        const handleSave = () => {
          setOpen(false);
        };

        return <button onClick={handleSave}>Save</button>;
      }
    `;

    expect(componentHasSaveHandler(source)).toBe(false);
  });

  it('derives API evidence from structural endpoint and symbol predicates', () => {
    expect(hasApiCall("opaqueTransport('/api/runtime-discovered')")).toBe(true);
    expect(hasApiCall('runtimeApi.execute(payload)')).toBe(true);
    expect(hasApiCall('submitForm(payload)')).toBe(false);
  });

  it('requires hook registry evidence before treating hook function names as real work', () => {
    const hookDestructures = new Map([
      ['runLocal', { hookName: 'useOpaqueHook', funcName: 'save' }],
    ]);
    const registryWithEvidence = new Map([
      [
        'useOpaqueHook',
        new Map([['save', { method: 'POST', endpoint: '/api/runtime-discovered' }]]),
      ],
    ]);

    expect(bodyCallsHookFunction('runLocal()', hookDestructures, new Map())).toBe(false);
    expect(bodyCallsHookFunction('runLocal()', hookDestructures, registryWithEvidence)).toBe(true);
  });
});

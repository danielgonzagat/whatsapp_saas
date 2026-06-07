import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AutopilotDecisionLog from './AutopilotDecisionLog';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AutopilotDecisionLog', () => {
  it('renders backend actions without ids without emitting React key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AutopilotDecisionLog
        actions={[
          {
            createdAt: '2026-06-07T10:17:00.000Z',
            contact: 'Lead A',
            intent: 'AUTOPILOT_ASK',
            action: 'ANALYZE_INSIGHTS',
            status: 'success',
          },
          {
            createdAt: '2026-06-07T10:18:00.000Z',
            contact: 'Lead B',
            intent: 'SMOKE_TEST',
            action: 'DRY_RUN',
            status: 'scheduled',
          },
        ]}
        impact={null}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onExport={vi.fn()}
        isLoading={false}
        isEnabled
      />,
    );

    expect(screen.getByText('Lead A')).not.toBeNull();
    expect(screen.getByText('Lead B')).not.toBeNull();
    expect(screen.getByLabelText('Filtro de status das ações')).not.toBeNull();
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((part) => String(part).includes('Each child in a list should have a unique "key" prop')),
      ),
    ).toBe(false);
  });
});

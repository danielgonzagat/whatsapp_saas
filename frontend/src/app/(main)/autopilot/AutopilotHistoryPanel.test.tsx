import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AutopilotHistoryPanel } from './AutopilotHistoryPanel';

describe('AutopilotHistoryPanel', () => {
  it('exposes the insight question input with a programmatic label', () => {
    render(
      <AutopilotHistoryPanel
        insights={[]}
        askQuestion=""
        setAskQuestion={vi.fn()}
        handleAskInsights={vi.fn()}
        isAsking={false}
        askResult={null}
      />,
    );

    expect(screen.getByLabelText('Perguntar ao Autopilot')).not.toBeNull();
  });
});

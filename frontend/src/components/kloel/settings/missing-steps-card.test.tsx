import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MissingStepsCard } from './missing-steps-card';

describe('MissingStepsCard', () => {
  it('uses Meta-first wording for the channel connection step', () => {
    render(
      <MissingStepsCard
        hasProducts={false}
        hasFiles={false}
        hasCheckout={false}
        hasVoiceTone={false}
        hasFaq={false}
        hasOpeningMessage={false}
        hasWhatsApp={false}
      />,
    );

    expect(screen.getByText('Conectar canais Meta')).toBeInTheDocument();
    expect(screen.queryByText('Conectar WhatsApp')).not.toBeInTheDocument();
  });
});

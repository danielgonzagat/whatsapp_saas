import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/api/sites';
import { Hospedagem } from './Hospedagem';

const site: Site = {
  id: 'site-1',
  workspaceId: 'ws-1',
  name: 'Site real',
  slug: 'site-real',
  status: 'PUBLISHED',
  template: null,
  content: {},
  seoMeta: {},
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  publishedAt: '2026-06-02T00:00:00.000Z',
};

describe('Sites Hospedagem', () => {
  it('renders real site hosting status instead of an unavailable monitoring placeholder', () => {
    render(<Hospedagem sites={[site]} loading={false} />);

    expect(screen.queryByText(/monitoramento de hospedagem ainda nao esta disponivel/i)).toBeNull();
    expect(screen.getByText('Site real')).toBeTruthy();
    expect(screen.getByText('/s/site-real')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });
});

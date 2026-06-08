import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScraperFilterBar } from './ScraperFilterBar';
import { ScraperJobRow } from './ScraperJobRow';
import { ScraperNewJobModal } from './ScraperNewJobModal';
import type { ScrapingJob } from '@/hooks/useScrapers';

const pushMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const job: ScrapingJob = {
  id: 'job-1',
  type: 'MAPS',
  query: 'clinicas odontologicas codex audit',
  status: 'pending',
  resultsCount: 0,
  createdAt: '2026-06-08T12:00:00.000Z',
};

describe('Scrapers components', () => {
  it('renders localized job status instead of raw backend status', () => {
    render(<ScraperJobRow job={job} onImport={vi.fn()} importing={false} />);

    expect(screen.getByText(/Pendente/)).toBeTruthy();
    expect(screen.queryByText(/pending/)).toBeNull();
  });

  it('keeps scraper filters identifiable for browser auditing', () => {
    render(
      <ScraperFilterBar
        typeFilter="ALL"
        statusFilter="ALL"
        onTypeFilterChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
      />,
    );

    const typeSelect = screen.getByLabelText('Filtrar jobs por tipo');
    const statusSelect = screen.getByLabelText('Filtrar jobs por status');

    expect(typeSelect.getAttribute('id')).toBe('scraper-type-filter');
    expect(typeSelect.getAttribute('name')).toBe('scraperTypeFilter');
    expect(statusSelect.getAttribute('id')).toBe('scraper-status-filter');
    expect(statusSelect.getAttribute('name')).toBe('scraperStatusFilter');
  });

  it('uses polished Portuguese copy in the new job modal', () => {
    render(<ScraperNewJobModal onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByText('Configure a coleta de leads automática.')).toBeTruthy();
    expect(screen.queryByText('Configure a coleta de leads automatica.')).toBeNull();
    expect(screen.getByPlaceholderText('Ex: academias de ginástica')).toBeTruthy();
    expect(screen.getByPlaceholderText('Ex: São Paulo, SP')).toBeTruthy();
  });
});

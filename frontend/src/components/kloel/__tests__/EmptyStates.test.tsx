import { fireEvent, render, screen } from '@testing-library/react';
import { Hash } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import {
  ContextualEmptyState,
  EMPTY_STATE_CONFIGS,
  InlineEmptyState,
  SkeletonEmptyState,
} from '../EmptyStates';

describe('ContextualEmptyState', () => {
  it('renders title and description from config for known context', () => {
    render(<ContextualEmptyState context="products" />);
    expect(screen.getByText('Nenhum produto cadastrado')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cadastre seus produtos para que o agente possa apresentá-los aos clientes.',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to generic config for unknown context', () => {
    render(<ContextualEmptyState context="nonexistent" />);
    expect(screen.getByText('Nada aqui ainda')).toBeInTheDocument();
  });

  it('overrides title and description with custom props', () => {
    render(
      <ContextualEmptyState
        context="products"
        title="Custom Title"
        description="Custom Description"
      />,
    );
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom Description')).toBeInTheDocument();
  });

  it('renders action button when config has actionLabel', () => {
    render(<ContextualEmptyState context="products" />);
    expect(screen.getByRole('button', { name: 'Adicionar produto' })).toBeInTheDocument();
  });

  it('calls onAction when primary action button is clicked', () => {
    const onAction = vi.fn();
    render(<ContextualEmptyState context="products" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('calls onFillComposer with actionPrompt when onAction is not provided', () => {
    const onFillComposer = vi.fn();
    render(<ContextualEmptyState context="products" onFillComposer={onFillComposer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    expect(onFillComposer).toHaveBeenCalledWith('Quero cadastrar meu primeiro produto');
  });

  it('renders secondary action when config has one', () => {
    render(<ContextualEmptyState context="products" />);
    expect(screen.getByRole('button', { name: 'Importar de catálogo' })).toBeInTheDocument();
  });

  it('calls onSecondaryAction when secondary button is clicked', () => {
    const onSecondary = vi.fn();
    render(<ContextualEmptyState context="products" onSecondaryAction={onSecondary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Importar de catálogo' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('does not render action area when config has no actionLabel or secondaryAction', () => {
    render(<ContextualEmptyState context="anuncios" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders custom icon when provided', () => {
    render(<ContextualEmptyState context="generic" icon={Hash} />);
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('applies size classes — sm', () => {
    const { container } = render(<ContextualEmptyState context="generic" size="sm" />);
    expect(container.querySelector('.text-base')).toBeInTheDocument();
  });

  it('applies size classes — lg', () => {
    const { container } = render(<ContextualEmptyState context="generic" size="lg" />);
    expect(container.querySelector('.text-xl')).toBeInTheDocument();
  });

  it('never renders action area for configs without an action', () => {
    render(<ContextualEmptyState context="anuncios" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Anúncios — Em Breve')).toBeInTheDocument();
  });

  it('renders no-connection variant with warning style', () => {
    const { container } = render(
      <ContextualEmptyState context="noConnection" variant="no-connection" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderColor).toBe('rgba(110, 110, 115, 0.19)');
  });
});

describe('EMPTY_STATE_CONFIGS', () => {
  it('has configs for every critical context', () => {
    const required = [
      'conversations',
      'leads',
      'products',
      'campaigns',
      'sales',
      'analytics',
      'autopilot',
      'inbox',
      'followUps',
      'noConnection',
      'generic',
    ];
    for (const key of required) {
      expect(EMPTY_STATE_CONFIGS[key]).toBeDefined();
      expect(EMPTY_STATE_CONFIGS[key].icon).toBeDefined();
      expect(EMPTY_STATE_CONFIGS[key].title.length).toBeGreaterThan(0);
    }
  });

  it('followUpsNoToday has no actionPrompt', () => {
    const config = EMPTY_STATE_CONFIGS.followUpsNoToday;
    expect(config.actionLabel).toBe('Ver próximos dias');
    expect(config.actionPrompt).toBeUndefined();
  });
});

describe('InlineEmptyState', () => {
  it('renders message', () => {
    render(<InlineEmptyState message="Nothing to show" />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(<InlineEmptyState message="Empty" action={{ label: 'Refresh', onClick }} />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render button when no action provided', () => {
    render(<InlineEmptyState message="Empty" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SkeletonEmptyState', () => {
  it('renders default 3 lines', () => {
    const { container } = render(<SkeletonEmptyState />);
    const lines = container.querySelectorAll('.animate-pulse > div');
    expect(lines).toHaveLength(3);
  });

  it('renders custom number of lines', () => {
    const { container } = render(<SkeletonEmptyState lines={5} />);
    const lines = container.querySelectorAll('.animate-pulse > div');
    expect(lines).toHaveLength(5);
  });

  it('last line has width 60%', () => {
    const { container } = render(<SkeletonEmptyState lines={2} />);
    const lines = container.querySelectorAll('.animate-pulse > div');
    const lastLine = lines[lines.length - 1] as HTMLElement;
    expect(lastLine.style.width).toBe('60%');
  });

  it('first line has width 100%', () => {
    const { container } = render(<SkeletonEmptyState lines={2} />);
    const firstLine = container.querySelector('.animate-pulse > div') as HTMLElement;
    expect(firstLine.style.width).toBe('100%');
  });
});

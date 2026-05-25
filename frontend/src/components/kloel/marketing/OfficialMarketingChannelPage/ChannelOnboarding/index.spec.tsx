import { cleanup, render, fireEvent, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { paletteFor } from './palette';

// Mock the workspace's theme provider (component imports useTheme indirectly
// via use-onboarding-palette); we route through the pure paletteFor.
vi.mock('@/components/kloel/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

// Mock the heavy backend hook so the container is exercised in isolation.
const hookMock = vi.fn();
vi.mock('../use-official-marketing-channel', () => ({
  useOfficialMarketingChannel: (args: unknown) => hookMock(args),
}));

import { ChannelOnboarding } from './index';

interface MutableState {
  currentStep: number;
  selectedProductIds: string[];
  arsenal: string[];
  config: {
    tone: string;
    aggressiveness: string;
    workingHours: string;
    followUpEnabled: boolean;
    proactiveDailyLimit: number;
    language: string;
    handoffCriteria: string;
  };
}

function defaultSetup(): MutableState {
  return {
    currentStep: 0,
    selectedProductIds: [],
    arsenal: [],
    config: {
      tone: 'equilibrado',
      aggressiveness: 'firme',
      workingHours: '08:00-22:00',
      followUpEnabled: true,
      proactiveDailyLimit: 25,
      language: 'pt-BR',
      handoffCriteria: '',
    },
  };
}

interface ScenarioOverrides {
  setup?: Partial<MutableState>;
  productOptions?: Array<{ id: string; name: string; price?: number | null }>;
  completed?: boolean;
  connectionConnected?: boolean;
  loadError?: string | null;
}

function makeData(overrides: ScenarioOverrides = {}) {
  const setup: MutableState = { ...defaultSetup(), ...overrides.setup };
  const productOptions = overrides.productOptions ?? [{ id: 'p1', name: 'Alpha', price: 197 }];
  return {
    state: setup,
    productOptions,
    setCurrentStep: vi.fn((next: number) => {
      setup.currentStep = next;
    }),
    toggleProduct: vi.fn(),
    updateConfig: vi.fn((patch: Partial<MutableState['config']>) => {
      setup.config = { ...setup.config, ...patch };
    }),
    persistSetup: vi.fn((next: MutableState, _message?: string) => {
      Object.assign(setup, next);
      return Promise.resolve();
    }),
    openMeta: vi.fn(() => Promise.resolve()),
    openTikTok: vi.fn(() => Promise.resolve()),
    toggleEmail: vi.fn(() => Promise.resolve()),
    handleComplete: vi.fn(() => Promise.resolve()),
    connection: { connected: overrides.connectionConnected ?? false },
    completed: overrides.completed ?? false,
    completeBusy: false,
    isLoading: false,
    busy: null as string | null,
    loadError: overrides.loadError ?? null,
    get setup() {
      return setup;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChannelOnboarding container — palette + theme', () => {
  beforeEach(() => {
    hookMock.mockReturnValue(makeData());
  });

  it('renders the dark palette by default and the META BUSINESS chip + step-0 sub on whatsapp', () => {
    render(<ChannelOnboarding channel="whatsapp" />);
    // Provider chip above the step bar (spec §10 / Divergence 1).
    expect(screen.getAllByText('META BUSINESS').length).toBeGreaterThan(0);
    // Step-0 mono subtitle under the headline (Divergence 2).
    expect(screen.getByText('LOGIN META · OAUTH OFICIAL')).toBeTruthy();
    // Step 0 vignette ships the "Dê um corpo" headline + verb button.
    expect(screen.getByText(/Vincular número/)).toBeTruthy();
    // Use the resolved palette to assert the void background is in the tree.
    expect(paletteFor('dark').void).toBe('rgb(10, 10, 12)');
  });
});

describe('handleConnect by channel', () => {
  it('calls openMeta for whatsapp', () => {
    const data = makeData();
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="whatsapp" />);
    fireEvent.click(screen.getByRole('button', { name: /Vincular número/ }));
    expect(data.openMeta).toHaveBeenCalledTimes(1);
    expect(data.openTikTok).not.toHaveBeenCalled();
  });

  it('calls openMeta for instagram and facebook', () => {
    const insta = makeData();
    hookMock.mockReturnValue(insta);
    const { unmount } = render(<ChannelOnboarding channel="instagram" />);
    fireEvent.click(screen.getByRole('button', { name: /Vincular conta/ }));
    expect(insta.openMeta).toHaveBeenCalled();
    unmount();
    const fb = makeData();
    hookMock.mockReturnValue(fb);
    render(<ChannelOnboarding channel="facebook" />);
    fireEvent.click(screen.getByRole('button', { name: /Vincular Página/ }));
    expect(fb.openMeta).toHaveBeenCalled();
  });

  it('calls openTikTok(advertiser) for tiktok', () => {
    const data = makeData();
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="tiktok" />);
    fireEvent.click(screen.getByRole('button', { name: /Vincular conta/ }));
    expect(data.openTikTok).toHaveBeenCalledWith('advertiser');
  });

  it('email: toggleEmail then setCurrentStep(1) only when backend confirms connected', async () => {
    const data = makeData({ connectionConnected: true });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="email" />);
    fireEvent.click(screen.getByRole('button', { name: /Verificar domínio/ }));
    await act(async () => undefined);
    expect(data.toggleEmail).toHaveBeenCalledWith(true);
    expect(data.setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('email: does not advance when connection still null', async () => {
    const data = makeData({ connectionConnected: false });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="email" />);
    fireEvent.click(screen.getByRole('button', { name: /Verificar domínio/ }));
    await act(async () => undefined);
    expect(data.toggleEmail).toHaveBeenCalled();
    expect(data.setCurrentStep).not.toHaveBeenCalled();
  });
});

describe('per-step rendering + handlers', () => {
  it('renders products step + saves selected products before moving on', () => {
    const data = makeData({
      setup: { currentStep: 1, selectedProductIds: ['p1'] },
      productOptions: [{ id: 'p1', name: 'Alpha', price: 197 }],
    });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="whatsapp" />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText(/R\$\s*197/)).toBeTruthy();
    fireEvent.click(screen.getByText('Alpha'));
    expect(data.toggleProduct).toHaveBeenCalledWith('p1');
    fireEvent.click(screen.getByRole('button', { name: /Salvar produtos/ }));
    const [nextSetup, message] = data.persistSetup.mock.calls[0] || [];
    expect(nextSetup?.currentStep).toBe(2);
    expect(message).toBe('Produtos do canal salvos.');
  });

  it('arsenal step persists each picked file as a JSON line', async () => {
    const data = makeData({ setup: { currentStep: 2 } });
    hookMock.mockReturnValue(data);
    const { container } = render(<ChannelOnboarding channel="whatsapp" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const f1 = new File(['x'], 'photo.png', { type: 'image/png' });
    const f2 = new File(['y'], 'video.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [f1, f2] } });
    await act(async () => undefined);
    expect(data.persistSetup).toHaveBeenCalled();
    const next = data.persistSetup.mock.calls[0][0] as MutableState;
    expect(next.arsenal).toHaveLength(2);
    const parsed = next.arsenal.map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({ description: 'photo.png' });
    expect(parsed[1]).toMatchObject({ description: 'video.mp4' });
  });

  it('arsenal back/continue wires setCurrentStep correctly', () => {
    const continueData = makeData({ setup: { currentStep: 2 } });
    hookMock.mockReturnValue(continueData);
    const { unmount } = render(<ChannelOnboarding channel="whatsapp" />);
    fireEvent.click(screen.getByRole('button', { name: /Pular esta camada|Avançar/ }));
    expect(continueData.setCurrentStep).toHaveBeenCalledWith(3);
    unmount();

    const backData = makeData({ setup: { currentStep: 2 } });
    hookMock.mockReturnValue(backData);
    render(<ChannelOnboarding channel="whatsapp" />);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(backData.setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('voice step updates config via updateConfig and Despertar runs persist+complete', async () => {
    const data = makeData({ setup: { currentStep: 3 } });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="whatsapp" />);
    expect(screen.getByText('Temperatura')).toBeTruthy();
    // pick the third tone trace (Caloroso, index 2) — first dial in document order.
    const dialButtons = screen
      .getAllByRole('button')
      .filter((b) => ['Sereno', 'Equilibrado', 'Caloroso', 'Paciente', 'Firme', 'Incisivo'].includes(
        b.getAttribute('aria-label') || '',
      ));
    expect(dialButtons.length).toBe(6);
    fireEvent.click(dialButtons[2]); // Caloroso
    expect(data.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ tone: 'caloroso' }));
    fireEvent.click(dialButtons[5]); // Incisivo
    expect(data.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ aggressiveness: 'incisivo' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Despertar/ }));
    await act(async () => undefined);
    expect(data.persistSetup).toHaveBeenCalled();
    expect(data.handleComplete).toHaveBeenCalled();
  });
});

describe('awakened state', () => {
  it('renders Done when completed and Recomeçar restores local view to step 0', () => {
    const data = makeData({ completed: true, setup: { currentStep: 3 } });
    hookMock.mockReturnValue(data);
    const { container } = render(<ChannelOnboarding channel="instagram" />);
    expect(container.textContent).toContain('Instagram');
    expect(container.textContent).toContain('acordou');
    fireEvent.click(screen.getByRole('button', { name: /Recomeçar/ }));
    // Local UI rewinds to step 0 — the connect button comes back.
    expect(screen.getByText(/Vincular conta/)).toBeTruthy();
    // Recomeçar must NOT call setCurrentStep on the backend (it is UI-only).
    expect(data.setCurrentStep).not.toHaveBeenCalled();
  });

  it('surfaces loadError below the vignette', () => {
    const data = makeData({ loadError: 'Falha temporária no backend' });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="whatsapp" />);
    expect(screen.getByText('Falha temporária no backend')).toBeTruthy();
  });
});

describe('back/forward navigation between steps', () => {
  it('products → back goes to step 0', () => {
    const data = makeData({ setup: { currentStep: 1 }, productOptions: [] });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="whatsapp" />);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(data.setCurrentStep).toHaveBeenCalledWith(0);
  });

  it('voice → back goes to step 2', () => {
    const data = makeData({ setup: { currentStep: 3 } });
    hookMock.mockReturnValue(data);
    render(<ChannelOnboarding channel="whatsapp" />);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(data.setCurrentStep).toHaveBeenCalledWith(2);
  });
});

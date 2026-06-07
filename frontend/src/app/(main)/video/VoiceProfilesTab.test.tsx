import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { VoiceProfile } from '@/lib/api/media';

import { VoiceProfilesTab } from './VoiceProfilesTab';

type VoiceProfilesTabProps = ComponentProps<typeof VoiceProfilesTab>;

const profile: VoiceProfile = {
  id: '5e6c35f7-7af1-4cbb-a5af-c7ad3d76fc4a',
  name: 'Narrador Kloel',
  provider: 'OPENAI',
  voiceId: 'alloy',
};

function buildProps(overrides: Partial<VoiceProfilesTabProps> = {}): VoiceProfilesTabProps {
  return {
    voiceProfiles: [],
    voiceLoading: false,
    voiceError: null,
    newVoiceName: '',
    newVoiceId: '',
    newVoiceProvider: 'OPENAI',
    creatingVoice: false,
    genText: '',
    genProfileId: '',
    generating: false,
    genResult: null,
    genError: null,
    onNewVoiceNameChange: vi.fn(),
    onNewVoiceIdChange: vi.fn(),
    onNewVoiceProviderChange: vi.fn(),
    onCreateVoice: vi.fn(),
    onGenTextChange: vi.fn(),
    onGenProfileIdChange: vi.fn(),
    onGenerate: vi.fn(),
    ...overrides,
  };
}

describe('VoiceProfilesTab', () => {
  it('offers only the backend-supported provider and requires a voice id to create', () => {
    const onCreateVoice = vi.fn();
    const { rerender } = render(
      <VoiceProfilesTab
        {...buildProps({ newVoiceName: 'Voz teste', newVoiceId: '', onCreateVoice })}
      />,
    );

    const provider = screen.getByRole('combobox', { name: 'Provedor do perfil de voz' });
    expect(Array.from(provider.querySelectorAll('option')).map((option) => option.value)).toEqual([
      'OPENAI',
    ]);
    expect(screen.getByRole('textbox', { name: 'Voice ID do OpenAI TTS' }).getAttribute('name')).toBe(
      'voice-profile-provider-id',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Criar Perfil' }));
    expect(onCreateVoice).not.toHaveBeenCalled();

    rerender(
      <VoiceProfilesTab
        {...buildProps({ newVoiceName: 'Voz teste', newVoiceId: 'alloy', onCreateVoice })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Criar Perfil' }));
    expect(onCreateVoice).toHaveBeenCalledTimes(1);
  });

  it('requires a selected profile before generating audio', () => {
    const onGenerate = vi.fn();
    const { rerender } = render(
      <VoiceProfilesTab
        {...buildProps({ voiceProfiles: [profile], genText: 'Transforme isso em audio.', onGenerate })}
      />,
    );

    expect(screen.getByText('Selecione um perfil de voz antes de gerar audio.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Audio' }));
    expect(onGenerate).not.toHaveBeenCalled();

    rerender(
      <VoiceProfilesTab
        {...buildProps({
          voiceProfiles: [profile],
          genText: 'Transforme isso em audio.',
          genProfileId: profile.id,
          onGenerate,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Audio' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('names profile selection buttons with the voice profile context', () => {
    const onGenProfileIdChange = vi.fn();
    render(
      <VoiceProfilesTab
        {...buildProps({ voiceProfiles: [profile], onGenProfileIdChange })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar perfil de voz Narrador Kloel' }));

    expect(onGenProfileIdChange).toHaveBeenCalledWith(profile.id);
  });

  it('labels queued audio jobs without claiming final audio is ready', () => {
    render(
      <VoiceProfilesTab
        {...buildProps({
          voiceProfiles: [profile],
          genText: 'Transforme isso em audio.',
          genProfileId: profile.id,
          genResult: 'Job de audio criado: job-1 (PENDING)',
        })}
      />,
    );

    expect(screen.getByText('Job de audio criado')).toBeTruthy();
    expect(screen.getByText('Job de audio criado: job-1 (PENDING)')).toBeTruthy();
    expect(screen.queryByText('Audio gerado')).toBeNull();
  });
});

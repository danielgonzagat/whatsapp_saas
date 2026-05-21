'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { authApi, workspaceApi } from '@/lib/api';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsCard, SettingsSwitchRow, kloelSettingsClass } from './contract';
import { buildAccountSettingsPayload } from './account-settings-section.helpers';
import {
  type PasswordStrength,
  evalPasswordStrength,
  PasswordStrengthBar,
  SessionsList,
  FeedbackBanner,
} from './account-settings-section.parts';

export function AccountSettingsSection() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>('weak');
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    webhookUrl: '',
    website: '',
  });
  const [preferences, setPreferences] = useState({
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    dateFormat: 'DD/MM/YYYY',
    emailImportant: true,
    emailTips: false,
  });
  const [channels, setChannels] = useState({
    provider: 'meta-cloud',
    jitterMin: 5,
    jitterMax: 15,
    emailEnabled: false,
  });
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountSettings() {
      setLoadingAccount(true);
      setError(null);

      try {
        const [workspaceRes, authRes, channelsRes] = await Promise.all([
          workspaceApi.getMe(),
          authApi.getMe(),
          workspaceApi.getChannels(),
        ]);

        if (cancelled) {
          return;
        }

        const payload = buildAccountSettingsPayload(
          workspaceRes.data,
          authRes.data,
          channelsRes.data,
        );
        setProfile(payload.profile);
        setPreferences(payload.preferences);
        setChannels(payload.channels);
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        const msg = err instanceof Error ? err.message : undefined;
        setError(msg || 'Não foi possível carregar as configurações da conta.');
      } finally {
        if (!cancelled) {
          setLoadingAccount(false);
        }
      }
    }

    void loadAccountSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveAccount = async () => {
    setSavingAccount(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await workspaceApi.updateAccount({
        name: profile.name,
        phone: profile.phone,
        webhookUrl: profile.webhookUrl,
        website: profile.website,
        timezone: preferences.timezone,
        language: preferences.language,
        dateFormat: preferences.dateFormat,
        notifications: {
          emailImportant: preferences.emailImportant,
          emailTips: preferences.emailTips,
        },
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setFeedback('Configurações da conta salvas com sucesso.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      setError(message || 'Falha ao salvar as configurações da conta.');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveChannels = async () => {
    setSavingChannels(true);
    setFeedback(null);
    setError(null);

    try {
      const [providerRes, jitterRes, channelsRes] = await Promise.all([
        workspaceApi.setProvider(channels.provider),
        workspaceApi.setJitter(channels.jitterMin, channels.jitterMax),
        workspaceApi.updateChannels({
          email: channels.emailEnabled,
        }),
      ]);

      const firstError = providerRes.error || jitterRes.error || channelsRes.error;

      if (firstError) {
        throw new Error(firstError);
      }

      setFeedback('Canais, provedor e jitter atualizados com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar os canais da conta.');
    } finally {
      setSavingChannels(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={kloelSettingsClass.sectionTitle}>{kloelT(`Configuração da conta`)}</h3>
        <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
          {kloelT(`Gerencie seu perfil, segurança e preferências da sua conta Kloel.`)}
        </p>
      </div>

      <FeedbackBanner message={feedback} error={error} />

      <SettingsCard>
        <h4 className={`mb-4 ${kloelSettingsClass.cardTitle}`}>{kloelT(`Perfil`)}</h4>

        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-bg-secondary)] text-xl font-semibold text-[var(--app-text-secondary)]">
              JD
            </div>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--app-bg-card)] bg-[var(--app-bg-primary)] text-[var(--app-text-primary)] transition-colors hover:bg-[var(--app-bg-hover)]"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--app-text-primary)]">
              {kloelT(`Alterar foto`)}
            </p>
            <p className="text-xs text-[var(--app-text-secondary)]">
              {kloelT(`JPG, PNG ou GIF. Máx. 2MB.`)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>
              {kloelT(`Nome da conta / workspace`)}
            </Label>
            <Input
              placeholder={kloelT(`Ex: Clínica La Vinci`)}
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className={kloelSettingsClass.input}
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Telefone comercial`)}</Label>
            <Input
              placeholder="5511999999999"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className={kloelSettingsClass.input}
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`E-mail do login`)}</Label>
            <Input
              type="email"
              placeholder={kloelT(`joao@empresa.com`)}
              value={profile.email}
              className={kloelSettingsClass.input}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Webhook URL`)}</Label>
            <Input
              placeholder="https://suaempresa.com/webhooks/kloel"
              value={profile.webhookUrl}
              onChange={(e) => setProfile({ ...profile, webhookUrl: e.target.value })}
              className={kloelSettingsClass.input}
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className={kloelSettingsClass.label}>
              {kloelT(`Website / domínio principal (opcional)`)}
            </Label>
            <Input
              placeholder="https://minhaempresa.com.br"
              value={profile.website}
              onChange={(e) => setProfile({ ...profile, website: e.target.value })}
              className={kloelSettingsClass.input}
              disabled={loadingAccount}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveAccount}
            disabled={loadingAccount || savingAccount}
            className={`px-4 text-sm disabled:opacity-50 ${kloelSettingsClass.primaryButton}`}
          >
            {savingAccount ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <h4 className={`mb-1 ${kloelSettingsClass.cardTitle}`}>{kloelT(`Segurança e acesso`)}</h4>
        <p className={`mb-4 ${kloelSettingsClass.cardDescription}`}>
          {kloelT(`Proteja sua conta.`)}
        </p>

        <div className="mb-6 space-y-4">
          <h5 className="text-sm font-medium text-[var(--app-text-primary)]">
            {kloelT(`Alterar senha`)}
          </h5>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder={kloelT(`Senha atual`)}
                className={`${kloelSettingsClass.input} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <div className="relative">
              <Input
                type={showNewPassword ? 'text' : 'password'}
                placeholder={kloelT(`Nova senha`)}
                onChange={(e) => setPasswordStrength(evalPasswordStrength(e.target.value))}
                className={`${kloelSettingsClass.input} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <Input
              type="password"
              placeholder={kloelT(`Confirmar nova senha`)}
              className={kloelSettingsClass.input}
            />
            <PasswordStrengthBar strength={passwordStrength} />
          </div>
        </div>

        <div className="mb-6">
          <Button variant="outline" className={`text-sm ${kloelSettingsClass.outlineButton}`}>
            {kloelT(`Enviar link de redefinição para meu e-mail`)}
          </Button>
        </div>

        <SessionsList />
      </SettingsCard>

      <SettingsCard>
        <h4 className={`mb-4 ${kloelSettingsClass.cardTitle}`}>{kloelT(`Preferências gerais`)}</h4>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Idioma`)}</Label>
            <Select
              value={preferences.language}
              onValueChange={(v: string) => setPreferences({ ...preferences, language: v })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="pt-BR">{kloelT(`Português (Brasil)`)}</SelectItem>
                <SelectItem value="en-US">{kloelT(`English (US)`)}</SelectItem>
                <SelectItem value="es">{kloelT(`Español`)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Fuso horário`)}</Label>
            <Select
              value={preferences.timezone}
              onValueChange={(v: string) => setPreferences({ ...preferences, timezone: v })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="America/Sao_Paulo">{kloelT(`São Paulo (GMT-3)`)}</SelectItem>
                <SelectItem value="America/New_York">{kloelT(`New York (GMT-5)`)}</SelectItem>
                <SelectItem value="Europe/London">{kloelT(`London (GMT)`)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Formato de data`)}</Label>
            <Select
              value={preferences.dateFormat}
              onValueChange={(v: string) => setPreferences({ ...preferences, dateFormat: v })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="DD/MM/YYYY">{kloelT(`DD/MM/AAAA`)}</SelectItem>
                <SelectItem value="MM/DD/YYYY">{kloelT(`MM/DD/AAAA`)}</SelectItem>
                <SelectItem value="YYYY-MM-DD">{kloelT(`AAAA-MM-DD`)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <SettingsSwitchRow
            title={kloelT(`Receber e-mails importantes sobre a conta`)}
            description={kloelT(`Atualizações de segurança e alertas da conta`)}
            control={
              <Switch
                className={kloelSettingsClass.switch}
                checked={preferences.emailImportant}
                onCheckedChange={(v: boolean) =>
                  setPreferences({ ...preferences, emailImportant: v })
                }
              />
            }
          />
          <SettingsSwitchRow
            title={kloelT(`Receber novidades e dicas de crescimento`)}
            description={kloelT(`Dicas de vendas e atualizações do Kloel`)}
            control={
              <Switch
                className={kloelSettingsClass.switch}
                checked={preferences.emailTips}
                onCheckedChange={(v: boolean) => setPreferences({ ...preferences, emailTips: v })}
              />
            }
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveAccount}
            disabled={loadingAccount || savingAccount}
            className={`px-4 text-sm disabled:opacity-50 ${kloelSettingsClass.primaryButton}`}
          >
            {savingAccount ? 'Salvando...' : 'Salvar preferências'}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <h4 className={`mb-1 ${kloelSettingsClass.cardTitle}`}>{kloelT(`Canais e provedor`)}</h4>
        <p className={`mb-4 ${kloelSettingsClass.cardDescription}`}>
          {kloelT(
            `Controle o provedor principal, jitter anti-ban e os canais adicionais da conta.`,
          )}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Provedor principal`)}</Label>
            <Select
              value={channels.provider}
              onValueChange={(value: string) => setChannels({ ...channels, provider: value })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="meta-cloud">{kloelT(`Meta Cloud API`)}</SelectItem>
                <SelectItem value="email">{kloelT(`Email`)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Jitter mínimo (segundos)`)}</Label>
            <Input
              type="number"
              min={0}
              value={channels.jitterMin}
              onChange={(e) => setChannels({ ...channels, jitterMin: Number(e.target.value || 0) })}
              className={kloelSettingsClass.input}
            />
          </div>

          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>{kloelT(`Jitter máximo (segundos)`)}</Label>
            <Input
              type="number"
              min={channels.jitterMin}
              value={channels.jitterMax}
              onChange={(e) => setChannels({ ...channels, jitterMax: Number(e.target.value || 0) })}
              className={kloelSettingsClass.input}
            />
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <SettingsSwitchRow
            title={kloelT(`Canal de e-mail`)}
            description={kloelT(`Habilita atendimento omnichannel por e-mail.`)}
            control={
              <Switch
                className={kloelSettingsClass.switch}
                checked={channels.emailEnabled}
                onCheckedChange={(value: boolean) =>
                  setChannels({ ...channels, emailEnabled: value })
                }
              />
            }
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveChannels}
            disabled={savingChannels}
            className={`px-4 text-sm disabled:opacity-50 ${kloelSettingsClass.primaryButton}`}
          >
            {savingChannels ? 'Salvando...' : 'Salvar canais e jitter'}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

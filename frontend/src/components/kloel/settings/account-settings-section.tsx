'use client';

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
import { buildMarketingUrl } from '@/lib/subdomains';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SettingsCard, SettingsNotice, SettingsSwitchRow, kloelSettingsClass } from './contract';
import { signOutCurrentKloelSession } from './security-session-actions';
import { detectSecuritySessionSurface, type SecuritySessionSurface } from './security-session-surface';
import { SecuritySessionsPanel } from './security-sessions-panel';

const A_Z_RE = /[A-Z]/;
const RX_0_9_RE = /[0-9]/;
const A_ZA_Z0_9_RE = /[^A-Za-z0-9]/;

function normalizeAccountWhatsAppProvider(provider: unknown): 'meta-cloud' | 'email' {
  const normalized = String(provider || '')
    .trim()
    .toLowerCase();

  if (normalized === 'email') {
    return 'email';
  }

  return 'meta-cloud';
}

export function AccountSettingsSection() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
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
  const [privacyFeedback, setPrivacyFeedback] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [exportingData, setExportingData] = useState(false);
  const [showDeletionConfirm, setShowDeletionConfirm] = useState(false);
  const [deletionPhrase, setDeletionPhrase] = useState('');
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sessionSurface, setSessionSurface] = useState<SecuritySessionSurface>({
    device: 'Sessão atual neste dispositivo',
    detail: 'Navegador atual',
    deviceType: 'desktop',
  });

  const checkPasswordStrength = (password: string) => {
    if (
      password.length >= 12 &&
      A_Z_RE.test(password) &&
      RX_0_9_RE.test(password) &&
      A_ZA_Z0_9_RE.test(password)
    ) {
      setPasswordStrength('strong');
    } else if (password.length >= 8) {
      setPasswordStrength('medium');
    } else {
      setPasswordStrength('weak');
    }
  };

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

        if (cancelled) return;

        const workspace = (workspaceRes.data as Record<string, unknown>) || {};
        const settings = (workspace.providerSettings as Record<string, unknown>) || {};
        const user =
          ((authRes.data as Record<string, unknown>)?.user as Record<string, unknown>) || {};
        const channelData = (channelsRes.data as Record<string, unknown>) || {};

        setProfile({
          name: (workspace.name as string) || '',
          email: (user.email as string) || '',
          phone: (settings.phone as string) || '',
          webhookUrl: (settings.webhookUrl as string) || '',
          website: (settings.website as string) || (workspace.customDomain as string) || '',
        });

        const notifications = settings.notifications as Record<string, boolean> | undefined;
        setPreferences({
          language: (settings.language as string) || 'pt-BR',
          timezone: (settings.timezone as string) || 'America/Sao_Paulo',
          dateFormat: (settings.dateFormat as string) || 'DD/MM/YYYY',
          emailImportant: notifications?.emailImportant ?? true,
          emailTips: notifications?.emailTips ?? false,
        });

        setChannels({
          provider: normalizeAccountWhatsAppProvider(settings.whatsappProvider),
          jitterMin: (workspace.jitterMin as number) || 5,
          jitterMax: (workspace.jitterMax as number) || 15,
          emailEnabled: !!channelData.email,
        });
      } catch (err: unknown) {
        if (cancelled) return;
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

  useEffect(() => {
    setSessionSurface(detectSecuritySessionSurface());
  }, []);

  const feedbackTone = useMemo(() => {
    if (error) return 'border-[#E05252]/25 bg-[#E05252]/10 text-[#F7A8A8]';
    if (feedback)
      return 'border-[var(--app-border-primary)] bg-[var(--app-bg-card)] text-[var(--app-text-primary)]';
    return '';
  }, [error, feedback]);

  const deletionReady = deletionAcknowledged && deletionPhrase.trim().toUpperCase() === 'EXCLUIR';
  const passwordConfirmationMatches = newPassword.length > 0 && newPassword === confirmNewPassword;
  const avatarInitials = useMemo(() => {
    const source = profile.name || profile.email || 'Kloel';
    const parts = source
      .split(/\s+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    if (parts.length === 0) return 'KL';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }, [profile.email, profile.name]);

  const handleSignOutCurrentSession = async () => {
    await signOutCurrentKloelSession();
  };

  const handleSendResetLink = async () => {
    if (!profile.email) {
      setError('Nenhum e-mail de login carregado para enviar a redefinição.');
      return;
    }

    setSendingResetLink(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await authApi.forgotPassword(profile.email);
      if (response.error) {
        throw new Error(response.error);
      }

      setFeedback(`Enviamos um link de redefinição para ${profile.email}.`);
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar o link de redefinição.');
    } finally {
      setSendingResetLink(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('Preencha senha atual, nova senha e confirmação.');
      setFeedback(null);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('A confirmação da nova senha não corresponde.');
      setFeedback(null);
      return;
    }

    setChangingPassword(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await authApi.changePassword(currentPassword, newPassword);
      if (response.error) {
        throw new Error(response.error);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordStrength('weak');
      setFeedback('Senha atualizada com sucesso. Outras sessões precisarão entrar novamente.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao atualizar a senha.');
    } finally {
      setChangingPassword(false);
    }
  };

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
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar os canais da conta.');
    } finally {
      setSavingChannels(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    setPrivacyFeedback(null);
    setPrivacyError(null);

    try {
      const response = await authApi.exportMyData();

      if (response.error || !response.data) {
        throw new Error(response.error || 'Não foi possível gerar a exportação dos seus dados.');
      }

      const payload = JSON.stringify(response.data, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kloel-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setPrivacyFeedback('Exportação gerada com sucesso.');
    } catch (err: any) {
      setPrivacyError(err?.message || 'Falha ao exportar os dados da sua conta.');
    } finally {
      setExportingData(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!deletionReady) {
      return;
    }

    setDeletingAccount(true);
    setPrivacyFeedback(null);
    setPrivacyError(null);

    try {
      const response = await authApi.requestDataDeletion();
      const confirmationCode =
        response.data?.confirmationCode ||
        (response.data as { confirmation_code?: string } | undefined)?.confirmation_code;

      if (response.error || !confirmationCode) {
        throw new Error(response.error || 'Não foi possível iniciar a exclusão da conta.');
      }

      setPrivacyFeedback('Solicitação de exclusão confirmada. Redirecionando para o status...');
      await authApi.signOut();

      if (typeof window !== 'undefined') {
        window.location.assign(
          buildMarketingUrl(`/data-deletion/status/${confirmationCode}`, window.location.host),
        );
      }
    } catch (err: any) {
      setPrivacyError(err?.message || 'Falha ao solicitar a exclusão da conta.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={kloelSettingsClass.sectionTitle}>Configuração da conta</h3>
        <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
          Gerencie seu perfil, segurança e preferências da sua conta Kloel.
        </p>
      </div>

      {feedback || error ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${feedbackTone}`}>
          {error || feedback}
        </div>
      ) : null}

      {/* Profile Card */}
      <SettingsCard>
        <h4 className={`mb-4 ${kloelSettingsClass.cardTitle}`}>Perfil</h4>

        {/* Avatar */}
        <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-bg-secondary)] text-xl font-semibold text-[var(--app-text-secondary)]">
                {avatarInitials}
              </div>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--app-bg-card)] bg-[var(--app-bg-primary)] text-[var(--app-text-primary)] transition-colors hover:bg-[var(--app-bg-hover)]"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--app-text-primary)]">Alterar foto</p>
            <p className="text-xs text-[var(--app-text-secondary)]">JPG, PNG ou GIF. Máx. 2MB.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Nome da conta / workspace</Label>
            <Input
              placeholder="Ex: Clínica La Vinci"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className={kloelSettingsClass.input}
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Telefone comercial</Label>
            <Input
              placeholder="5511999999999"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className={kloelSettingsClass.input}
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>E-mail do login</Label>
            <Input
              type="email"
              placeholder="joao@empresa.com"
              value={profile.email}
              className={kloelSettingsClass.input}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Webhook URL</Label>
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
              Website / domínio principal (opcional)
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

      {/* Security Card */}
      <SettingsCard>
        <h4 className={`mb-1 ${kloelSettingsClass.cardTitle}`}>Segurança e acesso</h4>
        <p className={`mb-4 ${kloelSettingsClass.cardDescription}`}>Proteja sua conta.</p>

        {/* Change Password */}
        <div className="mb-6 space-y-4">
          <h5 className="text-sm font-medium text-[var(--app-text-primary)]">Alterar senha</h5>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Senha atual"
                aria-label="Senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
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
                placeholder="Nova senha"
                aria-label="Nova senha"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  checkPasswordStrength(e.target.value);
                }}
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
              placeholder="Confirmar nova senha"
              aria-label="Confirmar nova senha"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className={kloelSettingsClass.input}
            />
            {confirmNewPassword ? (
              <p
                className={`text-xs ${passwordConfirmationMatches ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {passwordConfirmationMatches
                  ? 'Confirmação de senha ok.'
                  : 'A confirmação precisa ser igual à nova senha.'}
              </p>
            ) : null}

            {/* Password Strength */}
            <div className="space-y-1">
              <div className="flex gap-1">
                <div
                  className={`h-1 flex-1 rounded-full ${passwordStrength === 'weak' ? 'bg-red-400' : passwordStrength === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`}
                />
                <div
                  className={`h-1 flex-1 rounded-full ${passwordStrength === 'medium' || passwordStrength === 'strong' ? (passwordStrength === 'medium' ? 'bg-yellow-400' : 'bg-green-400') : 'bg-[var(--app-border-primary)]'}`}
                />
                <div
                  className={`h-1 flex-1 rounded-full ${passwordStrength === 'strong' ? 'bg-green-400' : 'bg-[var(--app-border-primary)]'}`}
                />
              </div>
              <p className="text-xs text-[var(--app-text-secondary)]">
                Força:{' '}
                {passwordStrength === 'weak'
                  ? 'Fraca'
                  : passwordStrength === 'medium'
                    ? 'Média'
                    : 'Forte'}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  void handleChangePassword();
                }}
                disabled={
                  changingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmNewPassword ||
                  !passwordConfirmationMatches
                }
                className={`px-4 text-sm disabled:opacity-50 ${kloelSettingsClass.primaryButton}`}
              >
                {changingPassword ? 'Atualizando senha...' : 'Atualizar senha'}
              </Button>
            </div>
          </div>
        </div>

        {/* Reset Password */}
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => {
              void handleSendResetLink();
            }}
            disabled={loadingAccount || sendingResetLink || !profile.email}
            className={`text-sm ${kloelSettingsClass.outlineButton}`}
          >
            {sendingResetLink
              ? 'Enviando link de redefinição...'
              : 'Enviar link de redefinição para meu e-mail'}
          </Button>
        </div>

        {/* Active Sessions */}
        <div>
          <h5 className="mb-3 text-sm font-medium text-[var(--app-text-primary)]">
            Sessões ativas
          </h5>
          <div className="mt-3">
            <SecuritySessionsPanel
              fallbackSurface={sessionSurface}
              onSignOutCurrent={handleSignOutCurrentSession}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Preferences Card */}
      <SettingsCard>
        <h4 className={`mb-4 ${kloelSettingsClass.cardTitle}`}>Preferências gerais</h4>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Idioma</Label>
            <Select
              value={preferences.language}
              onValueChange={(v: string) => setPreferences({ ...preferences, language: v })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Fuso horário</Label>
            <Select
              value={preferences.timezone}
              onValueChange={(v: string) => setPreferences({ ...preferences, timezone: v })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                <SelectItem value="America/New_York">New York (GMT-5)</SelectItem>
                <SelectItem value="Europe/London">London (GMT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className={kloelSettingsClass.label}>Formato de data</Label>
            <Select
              value={preferences.dateFormat}
              onValueChange={(v: string) => setPreferences({ ...preferences, dateFormat: v })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/AAAA</SelectItem>
                <SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <SettingsSwitchRow
            title="Receber e-mails importantes sobre a conta"
            description="Atualizações de segurança e alertas da conta"
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
            title="Receber novidades e dicas de crescimento"
            description="Dicas de vendas e atualizações do Kloel"
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
        <h4 className={`mb-1 ${kloelSettingsClass.cardTitle}`}>Canais e provedor</h4>
        <p className={`mb-4 ${kloelSettingsClass.cardDescription}`}>
          Controle o provedor principal, jitter anti-ban e os canais adicionais da conta.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Provedor principal</Label>
            <Select
              value={channels.provider}
              onValueChange={(value: string) => setChannels({ ...channels, provider: value })}
            >
              <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={kloelSettingsClass.selectContent}>
                <SelectItem value="meta-cloud">API oficial da Meta</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Jitter mínimo (segundos)</Label>
            <Input
              type="number"
              min={0}
              value={channels.jitterMin}
              onChange={(e) => setChannels({ ...channels, jitterMin: Number(e.target.value || 0) })}
              className={kloelSettingsClass.input}
            />
          </div>

          <div className="space-y-2">
            <Label className={kloelSettingsClass.label}>Jitter máximo (segundos)</Label>
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
            title="Canal de e-mail"
            description="Habilita atendimento omnichannel por e-mail."
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

      <SettingsCard>
        <h4 className={`mb-1 ${kloelSettingsClass.cardTitle}`}>Privacidade e exclusão</h4>
        <p className={`mb-4 ${kloelSettingsClass.cardDescription}`}>
          Exporte seus dados estruturados ou solicite a exclusão definitiva da sua conta Kloel.
        </p>

        <div className="space-y-4">
          <SettingsNotice tone="warning">
            <p className="text-sm font-medium">Antes de excluir sua conta</p>
            <p className="mt-1 text-sm">
              Seu acesso será revogado imediatamente. Dados sujeitos a obrigação legal, como notas
              fiscais e logs mínimos de segurança, podem ser retidos pelo prazo exigido por lei.
            </p>
          </SettingsNotice>

          {privacyFeedback ? (
            <SettingsNotice tone="success">
              <p className="text-sm">{privacyFeedback}</p>
            </SettingsNotice>
          ) : null}

          {privacyError ? (
            <SettingsNotice tone="danger">
              <p className="text-sm">{privacyError}</p>
            </SettingsNotice>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className={`sm:w-auto ${kloelSettingsClass.outlineButton}`}
              disabled={exportingData}
              onClick={handleExportData}
            >
              {exportingData ? 'Exportando...' : 'Exportar meus dados'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`sm:w-auto ${kloelSettingsClass.dangerButton}`}
              disabled={deletingAccount}
              onClick={() => {
                setShowDeletionConfirm((current) => !current);
                setPrivacyFeedback(null);
                setPrivacyError(null);
              }}
            >
              {showDeletionConfirm ? 'Cancelar exclusão' : 'Excluir minha conta'}
            </Button>
          </div>

          {showDeletionConfirm ? (
            <div className="rounded-md border border-[#E05252]/25 bg-[#E05252]/8 p-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-[var(--app-text-primary)]">
                    Confirmação obrigatória
                  </p>
                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                    Digite <span className="font-semibold text-[var(--app-text-primary)]">EXCLUIR</span>{' '}
                    e confirme que entende a revogação imediata do acesso.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className={kloelSettingsClass.label} htmlFor="delete-account-phrase">
                    Digite EXCLUIR para continuar
                  </Label>
                  <Input
                    id="delete-account-phrase"
                    value={deletionPhrase}
                    onChange={(e) => setDeletionPhrase(e.target.value)}
                    placeholder="EXCLUIR"
                    className={kloelSettingsClass.input}
                    disabled={deletingAccount}
                  />
                </div>

                <label className="flex items-start gap-3 text-sm text-[var(--app-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={deletionAcknowledged}
                    onChange={(e) => setDeletionAcknowledged(e.target.checked)}
                    disabled={deletingAccount}
                    aria-label="Entendo que meu acesso será revogado imediatamente."
                    className="mt-1 h-4 w-4 rounded border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] accent-[var(--app-accent)]"
                  />
                  <span>Entendo que meu acesso será revogado imediatamente.</span>
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className={kloelSettingsClass.outlineButton}
                    disabled={deletingAccount}
                    onClick={() => {
                      setShowDeletionConfirm(false);
                      setDeletionPhrase('');
                      setDeletionAcknowledged(false);
                    }}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    className={kloelSettingsClass.dangerButton}
                    disabled={!deletionReady || deletingAccount}
                    onClick={handleRequestDeletion}
                  >
                    {deletingAccount ? 'Excluindo...' : 'Confirmar exclusão permanente'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </SettingsCard>
    </div>
  );
}

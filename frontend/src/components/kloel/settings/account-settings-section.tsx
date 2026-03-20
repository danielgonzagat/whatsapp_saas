"use client"

import { useEffect, useMemo, useState } from "react"
import { Camera, Eye, EyeOff, Monitor, Smartphone, Laptop } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { authApi, workspaceApi } from "@/lib/api"

export function AccountSettingsSection() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState<"weak" | "medium" | "strong">("weak")
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    webhookUrl: "",
    website: "",
  })
  const [preferences, setPreferences] = useState({
    language: "pt-BR",
    timezone: "America/Sao_Paulo",
    dateFormat: "DD/MM/YYYY",
    emailImportant: true,
    emailTips: false,
  })
  const [channels, setChannels] = useState({
    provider: "whatsapp-api",
    jitterMin: 5,
    jitterMax: 15,
    emailEnabled: false,
    telegramEnabled: false,
  })
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingChannels, setSavingChannels] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sessions = [
    {
      device: "Chrome em MacBook Pro",
      location: "São Paulo, Brasil",
      time: "Agora (sessão atual)",
      icon: Laptop,
      current: true,
    },
    {
      device: "Safari em iPhone 15",
      location: "São Paulo, Brasil",
      time: "Há 2 dias",
      icon: Smartphone,
      current: false,
    },
    {
      device: "Firefox em Windows",
      location: "Rio de Janeiro, Brasil",
      time: "Há 5 dias",
      icon: Monitor,
      current: false,
    },
  ]

  const checkPasswordStrength = (password: string) => {
    if (password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
      setPasswordStrength("strong")
    } else if (password.length >= 8) {
      setPasswordStrength("medium")
    } else {
      setPasswordStrength("weak")
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadAccountSettings() {
      setLoadingAccount(true)
      setError(null)

      try {
        const [workspaceRes, authRes, channelsRes] = await Promise.all([
          workspaceApi.getMe(),
          authApi.getMe(),
          workspaceApi.getChannels(),
        ])

        if (cancelled) return

        const workspace = (workspaceRes.data as any) || {}
        const settings = (workspace.providerSettings as Record<string, any>) || {}
        const user = authRes.data?.user || {}
        const channelData = (channelsRes.data as any) || {}

        setProfile({
          name: workspace.name || "",
          email: user.email || "",
          phone: settings.phone || "",
          webhookUrl: settings.webhookUrl || "",
          website: settings.website || workspace.customDomain || "",
        })

        setPreferences({
          language: settings.language || "pt-BR",
          timezone: settings.timezone || "America/Sao_Paulo",
          dateFormat: settings.dateFormat || "DD/MM/YYYY",
          emailImportant: settings.notifications?.emailImportant ?? true,
          emailTips: settings.notifications?.emailTips ?? false,
        })

        setChannels({
          provider: settings.whatsappProvider || "whatsapp-api",
          jitterMin: workspace.jitterMin || 5,
          jitterMax: workspace.jitterMax || 15,
          emailEnabled: !!channelData.email,
          telegramEnabled: !!channelData.telegram,
        })
      } catch (err: any) {
        if (cancelled) return
        setError(err?.message || "Não foi possível carregar as configurações da conta.")
      } finally {
        if (!cancelled) {
          setLoadingAccount(false)
        }
      }
    }

    void loadAccountSettings()

    return () => {
      cancelled = true
    }
  }, [])

  const feedbackTone = useMemo(() => {
    if (error) return "bg-rose-50 text-rose-700"
    if (feedback) return "bg-emerald-50 text-emerald-700"
    return ""
  }, [error, feedback])

  const handleSaveAccount = async () => {
    setSavingAccount(true)
    setFeedback(null)
    setError(null)

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
      })

      if (response.error) {
        throw new Error(response.error)
      }

      setFeedback("Configurações da conta salvas com sucesso.")
    } catch (err: any) {
      setError(err?.message || "Falha ao salvar as configurações da conta.")
    } finally {
      setSavingAccount(false)
    }
  }

  const handleSaveChannels = async () => {
    setSavingChannels(true)
    setFeedback(null)
    setError(null)

    try {
      const [providerRes, jitterRes, channelsRes] = await Promise.all([
        workspaceApi.setProvider(channels.provider),
        workspaceApi.setJitter(channels.jitterMin, channels.jitterMax),
        workspaceApi.updateChannels({
          email: channels.emailEnabled,
          telegram: channels.telegramEnabled,
        }),
      ])

      const firstError =
        providerRes.error || jitterRes.error || channelsRes.error

      if (firstError) {
        throw new Error(firstError)
      }

      setFeedback("Canais, provedor e jitter atualizados com sucesso.")
    } catch (err: any) {
      setError(err?.message || "Falha ao salvar os canais da conta.")
    } finally {
      setSavingChannels(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Configuração da conta</h3>
        <p className="mt-1 text-sm text-gray-500">Gerencie seu perfil, segurança e preferências da sua conta Kloel.</p>
      </div>

      {feedback || error ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${feedbackTone}`}>
          {error || feedback}
        </div>
      ) : null}

      {/* Profile Card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Perfil</h4>

        {/* Avatar */}
        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl font-semibold text-gray-600">
              JD
            </div>
            <button className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-900 text-white transition-colors hover:bg-gray-700">
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Alterar foto</p>
            <p className="text-xs text-gray-500">JPG, PNG ou GIF. Máx. 2MB.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Nome da conta / workspace</Label>
            <Input
              placeholder="Ex: Clínica La Vinci"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="rounded-xl border-gray-200 bg-gray-50"
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Telefone comercial</Label>
            <Input
              placeholder="5511999999999"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="rounded-xl border-gray-200 bg-gray-50"
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">E-mail do login</Label>
            <Input
              type="email"
              placeholder="joao@empresa.com"
              value={profile.email}
              className="rounded-xl border-gray-200 bg-gray-50"
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Webhook URL</Label>
            <Input
              placeholder="https://suaempresa.com/webhooks/kloel"
              value={profile.webhookUrl}
              onChange={(e) => setProfile({ ...profile, webhookUrl: e.target.value })}
              className="rounded-xl border-gray-200 bg-gray-50"
              disabled={loadingAccount}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs text-gray-500">Website / domínio principal (opcional)</Label>
            <Input
              placeholder="https://minhaempresa.com.br"
              value={profile.website}
              onChange={(e) => setProfile({ ...profile, website: e.target.value })}
              className="rounded-xl border-gray-200 bg-gray-50"
              disabled={loadingAccount}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveAccount}
            disabled={loadingAccount || savingAccount}
            className="rounded-xl bg-gray-900 px-4 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {savingAccount ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>

      {/* Security Card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-1 font-semibold text-gray-900">Segurança e acesso</h4>
        <p className="mb-4 text-sm text-gray-500">Proteja sua conta.</p>

        {/* Change Password */}
        <div className="mb-6 space-y-4">
          <h5 className="text-sm font-medium text-gray-700">Alterar senha</h5>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Senha atual"
                className="rounded-xl border-gray-200 bg-gray-50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="Nova senha"
                onChange={(e) => checkPasswordStrength(e.target.value)}
                className="rounded-xl border-gray-200 bg-gray-50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              type="password"
              placeholder="Confirmar nova senha"
              className="rounded-xl border-gray-200 bg-gray-50"
            />

            {/* Password Strength */}
            <div className="space-y-1">
              <div className="flex gap-1">
                <div
                  className={`h-1 flex-1 rounded-full ${passwordStrength === "weak" ? "bg-red-400" : passwordStrength === "medium" ? "bg-yellow-400" : "bg-green-400"}`}
                />
                <div
                  className={`h-1 flex-1 rounded-full ${passwordStrength === "medium" || passwordStrength === "strong" ? (passwordStrength === "medium" ? "bg-yellow-400" : "bg-green-400") : "bg-gray-200"}`}
                />
                <div
                  className={`h-1 flex-1 rounded-full ${passwordStrength === "strong" ? "bg-green-400" : "bg-gray-200"}`}
                />
              </div>
              <p className="text-xs text-gray-500">
                Força: {passwordStrength === "weak" ? "Fraca" : passwordStrength === "medium" ? "Média" : "Forte"}
              </p>
            </div>
          </div>
        </div>

        {/* Reset Password */}
        <div className="mb-6">
          <Button
            variant="outline"
            className="rounded-xl border-gray-200 text-sm text-gray-700 hover:bg-gray-50 bg-transparent"
          >
            Enviar link de redefinição para meu e-mail
          </Button>
        </div>

        {/* Active Sessions */}
        <div>
          <h5 className="mb-3 text-sm font-medium text-gray-700">Sessões ativas</h5>
          <div className="space-y-2">
            {sessions.map((session, index) => {
              const Icon = session.icon
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between rounded-xl p-3 ${session.current ? "bg-green-50" : "bg-gray-50"}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${session.current ? "text-green-600" : "text-gray-400"}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{session.device}</p>
                      <p className="text-xs text-gray-500">
                        {session.location} · {session.time}
                      </p>
                    </div>
                  </div>
                  {session.current && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Atual
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full rounded-xl border-gray-200 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 bg-transparent"
          >
            Encerrar outras sessões
          </Button>
        </div>
      </div>

      {/* Preferences Card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Preferências gerais</h4>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Idioma</Label>
            <Select value={preferences.language} onValueChange={(v: string) => setPreferences({ ...preferences, language: v })}>
              <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Fuso horário</Label>
            <Select value={preferences.timezone} onValueChange={(v: string) => setPreferences({ ...preferences, timezone: v })}>
              <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                <SelectItem value="America/New_York">New York (GMT-5)</SelectItem>
                <SelectItem value="Europe/London">London (GMT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs text-gray-500">Formato de data</Label>
            <Select
              value={preferences.dateFormat}
              onValueChange={(v: string) => setPreferences({ ...preferences, dateFormat: v })}
            >
              <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/AAAA</SelectItem>
                <SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Receber e-mails importantes sobre a conta</p>
              <p className="text-xs text-gray-500">Atualizações de segurança e alertas da conta</p>
            </div>
            <Switch
              checked={preferences.emailImportant}
              onCheckedChange={(v: boolean) => setPreferences({ ...preferences, emailImportant: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Receber novidades e dicas de crescimento</p>
              <p className="text-xs text-gray-500">Dicas de vendas e atualizações do Kloel</p>
            </div>
            <Switch
              checked={preferences.emailTips}
              onCheckedChange={(v: boolean) => setPreferences({ ...preferences, emailTips: v })}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveAccount}
            disabled={loadingAccount || savingAccount}
            className="rounded-xl bg-gray-900 px-4 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {savingAccount ? "Salvando..." : "Salvar preferências"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-1 font-semibold text-gray-900">Canais e provedor</h4>
        <p className="mb-4 text-sm text-gray-500">
          Controle o provedor principal, jitter anti-ban e os canais adicionais da conta.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Provedor principal</Label>
            <Select
              value={channels.provider}
              onValueChange={(value: string) => setChannels({ ...channels, provider: value })}
            >
              <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp-api">WhatsApp API</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Jitter mínimo (segundos)</Label>
            <Input
              type="number"
              min={0}
              value={channels.jitterMin}
              onChange={(e) =>
                setChannels({ ...channels, jitterMin: Number(e.target.value || 0) })
              }
              className="rounded-xl border-gray-200 bg-gray-50"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Jitter máximo (segundos)</Label>
            <Input
              type="number"
              min={channels.jitterMin}
              value={channels.jitterMax}
              onChange={(e) =>
                setChannels({ ...channels, jitterMax: Number(e.target.value || 0) })
              }
              className="rounded-xl border-gray-200 bg-gray-50"
            />
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Canal de e-mail</p>
              <p className="text-xs text-gray-500">Habilita atendimento omnichannel por e-mail.</p>
            </div>
            <Switch
              checked={channels.emailEnabled}
              onCheckedChange={(value: boolean) =>
                setChannels({ ...channels, emailEnabled: value })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Canal de Telegram</p>
              <p className="text-xs text-gray-500">Habilita atendimento omnichannel por Telegram.</p>
            </div>
            <Switch
              checked={channels.telegramEnabled}
              onCheckedChange={(value: boolean) =>
                setChannels({ ...channels, telegramEnabled: value })
              }
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveChannels}
            disabled={savingChannels}
            className="rounded-xl bg-gray-900 px-4 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {savingChannels ? "Salvando..." : "Salvar canais e jitter"}
          </Button>
        </div>
      </div>
    </div>
  )
}

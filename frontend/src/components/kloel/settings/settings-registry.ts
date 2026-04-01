export type WorkspaceSettingsSectionKey =
  | "account"
  | "billing"
  | "brain"
  | "crm"
  | "analytics"
  | "activity"

export type WorkspaceSettingsSectionDef = {
  key: WorkspaceSettingsSectionKey
  label: string
  iconKey: "user" | "bank" | "shield" | "users" | "eye" | "clock"
}

export const WORKSPACE_SETTINGS_SECTIONS: WorkspaceSettingsSectionDef[] = [
  { key: "account", label: "Configuracao da conta", iconKey: "user" },
  { key: "billing", label: "Pagamentos e billing", iconKey: "bank" },
  { key: "brain", label: "Configurar Kloel", iconKey: "shield" },
  { key: "crm", label: "CRM e pipeline", iconKey: "users" },
  { key: "analytics", label: "Analytics", iconKey: "eye" },
  { key: "activity", label: "Atividade", iconKey: "clock" },
]

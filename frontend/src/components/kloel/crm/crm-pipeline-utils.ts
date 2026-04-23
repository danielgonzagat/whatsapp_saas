/** Crm pipeline shape. */
export interface CRMPipeline {
  /** _id property. */
  _id?: string;
  /** Id property. */
  id?: string;
  /** Name property. */
  name: string;
  /** Stages property. */
  stages?: CRMStage[];
}

/** Crm stage shape. */
export interface CRMStage {
  /** _id property. */
  _id?: string;
  /** Id property. */
  id?: string;
  /** Name property. */
  name: string;
}

/** Crm deal shape. */
export interface CRMDeal {
  /** _id property. */
  _id?: string;
  /** Id property. */
  id?: string;
  /** Title property. */
  title: string;
  /** Value property. */
  value?: number;
  /** Priority property. */
  priority?: string;
  /** Stage property. */
  stage?: { _id?: string; id?: string; name?: string } | string;
  /** Contact property. */
  contact?: { name?: string; phone?: string };
  /** Contact name property. */
  contactName?: string;
  /** Description property. */
  description?: string;
  /** Expected close date property. */
  expectedCloseDate?: string;
  /** Created at property. */
  createdAt?: string;
  /** Notes property. */
  notes?: string;
}

/** Sora. */
export const SORA = "var(--font-sora), 'Sora', sans-serif";
/** Mono. */
export const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/** Fmt brl. */
export function fmtBRL(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

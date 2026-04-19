export interface CRMPipeline {
  _id?: string;
  id?: string;
  name: string;
  stages?: CRMStage[];
}

export interface CRMStage {
  _id?: string;
  id?: string;
  name: string;
}

export interface CRMDeal {
  _id?: string;
  id?: string;
  title: string;
  value?: number;
  priority?: string;
  stage?: { _id?: string; id?: string; name?: string } | string;
  contact?: { name?: string; phone?: string };
  contactName?: string;
  description?: string;
  expectedCloseDate?: string;
  createdAt?: string;
  notes?: string;
}

export const SORA = "var(--font-sora), 'Sora', sans-serif";
export const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

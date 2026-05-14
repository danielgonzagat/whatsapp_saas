import {
  type CrmContact,
  type CrmDeal,
  type CrmPipeline,
  type SegmentationPreset,
  type SegmentationStats,
  crmApi,
  segmentationApi,
} from '@/lib/api';
import { errorMessage } from './crm-settings-section.helpers';

export interface CrmFetchedData {
  contacts: CrmContact[];
  pipelines: CrmPipeline[];
  deals: CrmDeal[];
  presets: SegmentationPreset[];
  stats: SegmentationStats | null;
}

export async function fetchCrmInitialData(): Promise<CrmFetchedData> {
  const [contactsResponse, pipelinesResponse, dealsResponse, presetsResponse, statsResponse] =
    await Promise.all([
      crmApi.listContacts({ page: 1, limit: 20 }),
      crmApi.listPipelines(),
      crmApi.listDeals(),
      segmentationApi.getPresets(),
      segmentationApi.getStats(),
    ]);
  return {
    contacts: contactsResponse.data?.data || [],
    pipelines: pipelinesResponse.data || [],
    deals: dealsResponse.data || [],
    presets: presetsResponse.data?.presets || [],
    stats: statsResponse.data || null,
  };
}

export interface ContactFormSnapshot {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

export async function runCreateContact(
  form: ContactFormSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!form.phone.trim()) {
    return { ok: false, error: 'Informe o telefone do contato.' };
  }
  try {
    await crmApi.createContact({
      phone: form.phone.trim(),
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    });
    return { ok: true };
  } catch (createError) {
    return { ok: false, error: errorMessage(createError, 'Nao foi possivel criar o contato.') };
  }
}

export async function runCreatePipeline(
  name: string,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  if (!name.trim()) {
    return { ok: false, error: 'Informe o nome do pipeline.' };
  }
  try {
    const response = await crmApi.createPipeline(name.trim());
    return { ok: true, ...(response.data?.id ? { id: response.data.id } : {}) };
  } catch (createError) {
    return { ok: false, error: errorMessage(createError, 'Nao foi possivel criar o pipeline.') };
  }
}

export interface DealFormSnapshot {
  contactId: string;
  stageId: string;
  title: string;
  value: string;
}

export async function runCreateDeal(
  form: DealFormSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!form.contactId || !form.stageId || !form.title.trim()) {
    return { ok: false, error: 'Preencha contato, etapa inicial e titulo do deal.' };
  }
  try {
    await crmApi.createDeal({
      contactId: form.contactId,
      stageId: form.stageId,
      title: form.title.trim(),
      value: Number(form.value || 0),
    });
    return { ok: true };
  } catch (createError) {
    return { ok: false, error: errorMessage(createError, 'Nao foi possivel criar o deal.') };
  }
}

export async function runMoveDeal(
  deal: CrmDeal,
  pipeline: CrmPipeline,
  direction: -1 | 1,
): Promise<{ ok: true; nextStageName: string } | { ok: false; error: string } | null> {
  const currentIndex = pipeline.stages.findIndex((stage) => stage.id === deal.stageId);
  const nextStage = pipeline.stages[currentIndex + direction];
  if (!nextStage) {
    return null;
  }
  try {
    await crmApi.moveDeal(deal.id, nextStage.id);
    return { ok: true, nextStageName: nextStage.name };
  } catch (moveError) {
    return { ok: false, error: errorMessage(moveError, 'Nao foi possivel mover o deal.') };
  }
}

export async function runAutoSegment(): Promise<
  { ok: true; processed: number } | { ok: false; error: string }
> {
  try {
    const response = await segmentationApi.autoSegment();
    const processed = typeof response.data?.processed === 'number' ? response.data.processed : 0;
    return { ok: true, processed };
  } catch (segmentError) {
    return {
      ok: false,
      error: errorMessage(segmentError, 'Nao foi possivel rodar a auto-segmentacao.'),
    };
  }
}

'use client';

import type React from 'react';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Package,
  Users,
  MessageSquare,
  ShieldCheck,
  HelpCircle,
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { KloelStatusCard } from './kloel-status-card';
import { MissingStepsCard } from './missing-steps-card';
import { OpeningMessageCard } from './opening-message-card';
import { EmergencyModeCard } from './emergency-mode-card';
import { kloelSettingsClass, SettingsNotice } from './contract';
import {
  getAutopilotConfig,
  getAutopilotStatus,
  getWhatsAppStatus,
  knowledgeBaseApi,
  productApi,
  tokenStorage,
  toggleAutopilot,
  updateAutopilotConfig,
  workspaceApi,
  type KnowledgeBaseItem,
  type KnowledgeSourceItem,
} from '@/lib/api';
import { aiAssistantApi, uploadKnowledgeBase } from '@/lib/api/misc';

interface AccordionSectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionSection({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-[#222226] bg-[#111113] shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`${isOpen ? 'Fechar' : 'Abrir'} ${title}`}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-[#6E6E73]" />
          <span className="font-semibold text-[#E0DDD8]">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-[#6E6E73]" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[#6E6E73]" />
        )}
      </button>
      {isOpen && <div className="border-t border-[#222226] p-5">{children}</div>}
    </div>
  );
}

interface Product {
  id: string;
  name: string;
  type: string;
  price: string;
  description?: string;
  active: boolean;
  files: number;
  activePlansCount: number;
  memberAreasCount: number;
  totalSales: number;
  totalRevenue: number;
}

interface CompanyProfile {
  name: string;
  sector: string;
  description: string;
  mission: string;
  differentials: string[];
}

interface VoiceToneProfile {
  style: string;
  customInstructions: string;
  useProfessional: boolean;
  useFriendly: boolean;
  usePersuasive: boolean;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface OpeningMessageProfile {
  message: string;
  useEmojis: boolean;
  isFormal: boolean;
  isFriendly: boolean;
}

interface EmergencyModeProfile {
  emergencyAction: string;
  fixedMessage: string;
}

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function parseCurrency(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCompanyProfile(value: any): CompanyProfile {
  const differentials = Array.isArray(value?.differentials)
    ? value.differentials.filter((entry: unknown) => typeof entry === 'string')
    : [];

  return {
    name: typeof value?.name === 'string' ? value.name : '',
    sector: typeof value?.sector === 'string' ? value.sector : '',
    description: typeof value?.description === 'string' ? value.description : '',
    mission: typeof value?.mission === 'string' ? value.mission : '',
    differentials: differentials.length > 0 ? differentials : [''],
  };
}

function normalizeVoiceToneProfile(value: any): VoiceToneProfile {
  return {
    style: typeof value?.style === 'string' ? value.style : '',
    customInstructions:
      typeof value?.customInstructions === 'string' ? value.customInstructions : '',
    useProfessional: value?.useProfessional !== false,
    useFriendly: value?.useFriendly === true,
    usePersuasive: value?.usePersuasive === true,
  };
}

function normalizeFaqs(value: any): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((faq: any, index: number) => ({
      id: typeof faq?.id === 'string' ? faq.id : `faq-${index + 1}`,
      question: typeof faq?.question === 'string' ? faq.question : '',
      answer: typeof faq?.answer === 'string' ? faq.answer : '',
    }))
    .filter((faq) => faq.question || faq.answer);
}

function normalizeOpeningMessage(value: any): OpeningMessageProfile {
  return {
    message: typeof value?.message === 'string' ? value.message : '',
    useEmojis: value?.useEmojis !== false,
    isFormal: value?.isFormal === true,
    isFriendly: value?.isFriendly !== false,
  };
}

function normalizeEmergencyMode(value: any): EmergencyModeProfile {
  return {
    emergencyAction: typeof value?.emergencyAction === 'string' ? value.emergencyAction : '',
    fixedMessage: typeof value?.fixedMessage === 'string' ? value.fixedMessage : '',
  };
}

export function BrainSettingsSection() {
  const router = useRouter();
  const workspaceId = tokenStorage.getWorkspaceId();
  const [company, setCompany] = useState<CompanyProfile>({
    name: '',
    sector: '',
    description: '',
    mission: '',
    differentials: [''],
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSuccess, setCatalogSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    benefits: '',
    persona: '',
  });

  const [personas, setPersonas] = useState<string[]>([]);
  const [newPersona, setNewPersona] = useState('');

  const [voiceTone, setVoiceTone] = useState<VoiceToneProfile>({
    style: '',
    customInstructions: '',
    useProfessional: true,
    useFriendly: false,
    usePersuasive: false,
  });

  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState('');

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [showAddFaq, setShowAddFaq] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
  const [openingMessage, setOpeningMessage] = useState<OpeningMessageProfile>({
    message: '',
    useEmojis: true,
    isFormal: false,
    isFriendly: true,
  });
  const [emergencyMode, setEmergencyMode] = useState<EmergencyModeProfile>({
    emergencyAction: '',
    fixedMessage: '',
  });
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotSaving, setAutopilotSaving] = useState(false);
  const [autopilotError, setAutopilotError] = useState('');
  const [autopilotSuccess, setAutopilotSuccess] = useState('');
  const [autopilotConfig, setAutopilotConfig] = useState({
    conversionFlowId: '',
    currencyDefault: '',
    recoveryTemplateName: '',
  });

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('');
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSourceItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [knowledgeSuccess, setKnowledgeSuccess] = useState('');
  const [newKnowledgeBaseName, setNewKnowledgeBaseName] = useState('');
  const [knowledgeSourceType, setKnowledgeSourceType] = useState<'TEXT' | 'URL' | 'PDF'>('TEXT');
  const [knowledgeSourceContent, setKnowledgeSourceContent] = useState('');

  // KB file upload
  const [kbUploadFile, setKbUploadFile] = useState<File | null>(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadError, setKbUploadError] = useState('');
  const [kbUploadSuccess, setKbUploadSuccess] = useState('');
  const [kbDragOver, setKbDragOver] = useState(false);

  // AI Tools panel
  const [aiToolInput, setAiToolInput] = useState('');
  const [aiToolResult, setAiToolResult] = useState('');
  const [aiToolLoading, setAiToolLoading] = useState(false);
  const [aiToolError, setAiToolError] = useState('');

  // WhatsApp connection status
  const [whatsAppConnected, setWhatsAppConnected] = useState(false);

  const hydrateProfile = useCallback(async () => {
    if (!workspaceId) {
      setCompany(normalizeCompanyProfile(null));
      setPersonas([]);
      setVoiceTone(normalizeVoiceToneProfile(null));
      setRules([]);
      setFaqs([]);
      return;
    }

    setProfileLoading(true);
    setProfileError('');

    try {
      const response = await workspaceApi.getMe();
      const workspace = response.data as Record<string, unknown> | undefined;
      const provSettings = workspace?.providerSettings as Record<string, unknown> | undefined;
      const profile = (provSettings?.kloelProfile || {}) as Record<string, unknown>;

      setCompany(normalizeCompanyProfile(profile.company));
      setPersonas(
        Array.isArray(profile.personas)
          ? profile.personas.filter((value: unknown) => typeof value === 'string')
          : [],
      );
      setVoiceTone(normalizeVoiceToneProfile(profile.voiceTone));
      setRules(
        Array.isArray(profile.rules)
          ? profile.rules.filter((value: unknown) => typeof value === 'string')
          : [],
      );
      setFaqs(normalizeFaqs(profile.faqs));
      setOpeningMessage(normalizeOpeningMessage(profile.openingMessage));
      setEmergencyMode(normalizeEmergencyMode(profile.emergencyMode));
    } catch (error: any) {
      setProfileError(error?.message || 'Nao foi possivel carregar o perfil do Kloel.');
    } finally {
      setProfileLoading(false);
    }
  }, [workspaceId]);

  const saveKloelProfile = useCallback(
    async (
      successMessage: string,
      overrides?: Partial<{
        company: CompanyProfile;
        personas: string[];
        voiceTone: VoiceToneProfile;
        rules: string[];
        faqs: FaqItem[];
        openingMessage: OpeningMessageProfile;
        emergencyMode: EmergencyModeProfile;
      }>,
    ) => {
      if (!workspaceId) return;

      setProfileSaving(true);
      setProfileError('');
      setProfileSuccess('');

      try {
        const nextCompany = overrides?.company || company;
        const nextPersonas = overrides?.personas || personas;
        const nextVoiceTone = overrides?.voiceTone || voiceTone;
        const nextRules = overrides?.rules || rules;
        const nextFaqs = overrides?.faqs || faqs;
        const nextOpeningMessage = overrides?.openingMessage || openingMessage;
        const nextEmergencyMode = overrides?.emergencyMode || emergencyMode;

        await workspaceApi.updateSettings({
          kloelProfile: {
            company: {
              ...nextCompany,
              differentials: nextCompany.differentials.filter((item) => item.trim().length > 0),
            },
            personas: nextPersonas.filter((item) => item.trim().length > 0),
            voiceTone: nextVoiceTone,
            rules: nextRules.filter((item) => item.trim().length > 0),
            faqs: nextFaqs.filter((faq) => faq.question.trim() || faq.answer.trim()),
            openingMessage: nextOpeningMessage,
            emergencyMode: nextEmergencyMode,
          },
        });
        setProfileSuccess(successMessage);
      } catch (error: any) {
        setProfileError(error?.message || 'Nao foi possivel salvar o perfil do Kloel.');
      } finally {
        setProfileSaving(false);
      }
    },
    [company, emergencyMode, faqs, openingMessage, personas, rules, voiceTone, workspaceId],
  );

  const hydrateAutopilot = useCallback(async () => {
    if (!workspaceId) {
      setAutopilotEnabled(false);
      setAutopilotConfig({
        conversionFlowId: '',
        currencyDefault: '',
        recoveryTemplateName: '',
      });
      return;
    }

    try {
      const [status, config] = await Promise.all([
        getAutopilotStatus(workspaceId),
        getAutopilotConfig(workspaceId),
      ]);

      setAutopilotEnabled(Boolean(status?.enabled));
      setAutopilotConfig({
        conversionFlowId: String(config?.autopilot?.conversionFlowId || ''),
        currencyDefault: String(config?.autopilot?.currencyDefault || ''),
        recoveryTemplateName: String(config?.autopilot?.recoveryTemplateName || ''),
      });
    } catch (error: any) {
      setAutopilotError(error?.message || 'Nao foi possivel carregar a autonomia.');
    }
  }, [workspaceId]);

  const handleToggleAutopilot = useCallback(
    async (enabled: boolean) => {
      if (!workspaceId) return;
      setAutopilotSaving(true);
      setAutopilotError('');
      setAutopilotSuccess('');
      try {
        await toggleAutopilot(workspaceId, enabled);
        setAutopilotEnabled(enabled);
        setAutopilotSuccess(enabled ? 'Autonomia ativada.' : 'Autonomia pausada.');
      } catch (error: any) {
        setAutopilotError(error?.message || 'Nao foi possivel alternar a autonomia.');
      } finally {
        setAutopilotSaving(false);
      }
    },
    [workspaceId],
  );

  const handleSaveAutopilotConfig = useCallback(async () => {
    if (!workspaceId) return;
    setAutopilotSaving(true);
    setAutopilotError('');
    setAutopilotSuccess('');
    try {
      await updateAutopilotConfig(workspaceId, {
        conversionFlowId: autopilotConfig.conversionFlowId || null,
        currencyDefault: autopilotConfig.currencyDefault || undefined,
        recoveryTemplateName: autopilotConfig.recoveryTemplateName || null,
      });
      setAutopilotSuccess('Configuracao operacional do autopilot salva.');
    } catch (error: any) {
      setAutopilotError(error?.message || 'Nao foi possivel salvar a configuracao do autopilot.');
    } finally {
      setAutopilotSaving(false);
    }
  }, [autopilotConfig, workspaceId]);

  const hydrateKnowledgeBase = useCallback(async () => {
    if (!workspaceId) {
      setKnowledgeBases([]);
      setKnowledgeSources([]);
      setSelectedKnowledgeBaseId('');
      return;
    }

    setKnowledgeLoading(true);
    setKnowledgeError('');

    try {
      const response = await knowledgeBaseApi.list();
      const items = (response.data as KnowledgeBaseItem[]) || [];
      setKnowledgeBases(items);

      const nextSelectedId = selectedKnowledgeBaseId || items[0]?.id || '';
      setSelectedKnowledgeBaseId(nextSelectedId);

      if (nextSelectedId) {
        const sourcesResponse = await knowledgeBaseApi.listSources(nextSelectedId);
        setKnowledgeSources((sourcesResponse.data as KnowledgeSourceItem[]) || []);
      } else {
        setKnowledgeSources([]);
      }
    } catch (error: any) {
      setKnowledgeError(error?.message || 'Nao foi possivel carregar a base de conhecimento.');
    } finally {
      setKnowledgeLoading(false);
    }
  }, [selectedKnowledgeBaseId, workspaceId]);

  const handleCreateKnowledgeBase = useCallback(async () => {
    if (!workspaceId || !newKnowledgeBaseName.trim()) return;
    setKnowledgeLoading(true);
    setKnowledgeError('');
    setKnowledgeSuccess('');
    try {
      const response = await knowledgeBaseApi.create(newKnowledgeBaseName.trim());
      const created = response.data as KnowledgeBaseItem;
      setKnowledgeSuccess(`Base ${created?.name || newKnowledgeBaseName} criada.`);
      setNewKnowledgeBaseName('');
      setSelectedKnowledgeBaseId(created?.id || '');
      await hydrateKnowledgeBase();
    } catch (error: any) {
      setKnowledgeError(error?.message || 'Nao foi possivel criar a base.');
      setKnowledgeLoading(false);
    }
  }, [hydrateKnowledgeBase, newKnowledgeBaseName, workspaceId]);

  const handleAddKnowledgeSource = useCallback(async () => {
    if (!workspaceId || !selectedKnowledgeBaseId || !knowledgeSourceContent.trim()) return;
    setKnowledgeLoading(true);
    setKnowledgeError('');
    setKnowledgeSuccess('');
    try {
      await knowledgeBaseApi.addSource(selectedKnowledgeBaseId, {
        type: knowledgeSourceType,
        content: knowledgeSourceContent.trim(),
      });
      setKnowledgeSuccess('Fonte de conhecimento enviada para ingestao.');
      setKnowledgeSourceContent('');
      await hydrateKnowledgeBase();
    } catch (error: any) {
      setKnowledgeError(error?.message || 'Nao foi possivel adicionar a fonte.');
      setKnowledgeLoading(false);
    }
  }, [
    hydrateKnowledgeBase,
    knowledgeSourceContent,
    knowledgeSourceType,
    selectedKnowledgeBaseId,
    workspaceId,
  ]);

  const hydrateCatalog = useCallback(async () => {
    if (!workspaceId) {
      setProducts([]);
      return;
    }

    setCatalogLoading(true);
    setCatalogError('');

    try {
      const productResponse = await productApi.list();

      const nextProducts = (productResponse.data?.products || []).map((product) => {
        return {
          id: product.id,
          name: product.name,
          type: product.category || 'Produto',
          price: formatCurrency(product.price),
          description: product.description || '',
          active: product.active !== false,
          files: 0,
          activePlansCount: Number((product as any).activePlansCount || 0),
          memberAreasCount: Number((product as any).memberAreasCount || 0),
          totalSales: Number((product as any).totalSales || 0),
          totalRevenue: Number((product as any).totalRevenue || 0),
        } satisfies Product;
      });

      setProducts(nextProducts);
    } catch (error: any) {
      setCatalogError(error?.message || 'Nao foi possivel carregar o catalogo do Kloel.');
    } finally {
      setCatalogLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void hydrateCatalog();
  }, [hydrateCatalog]);

  useEffect(() => {
    void hydrateProfile();
  }, [hydrateProfile]);

  useEffect(() => {
    void hydrateAutopilot();
  }, [hydrateAutopilot]);

  useEffect(() => {
    void hydrateKnowledgeBase();
  }, [hydrateKnowledgeBase]);

  useEffect(() => {
    if (!workspaceId) return;
    getWhatsAppStatus(workspaceId)
      .then((status) => setWhatsAppConnected(status.connected))
      .catch(() => setWhatsAppConnected(false));
  }, [workspaceId]);

  const handleAddProduct = async () => {
    if (!workspaceId || !newProduct.name || !newProduct.price) {
      return;
    }

    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSuccess('');

    try {
      await productApi.create({
        name: newProduct.name,
        description: newProduct.description,
        price: parseCurrency(newProduct.price),
      });
      setNewProduct({ name: '', description: '', price: '', benefits: '', persona: '' });
      setShowAddProduct(false);
      setCatalogSuccess(`Produto ${newProduct.name} criado com sucesso.`);
      await hydrateCatalog();
    } catch (error: any) {
      setCatalogError(error?.message || 'Nao foi possivel criar o produto.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleAddPersona = () => {
    if (newPersona && !personas.includes(newPersona)) {
      setPersonas([...personas, newPersona]);
      setNewPersona('');
    }
  };

  const handleAddRule = () => {
    if (newRule) {
      setRules([...rules, newRule]);
      setNewRule('');
    }
  };

  const handleAddFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, { id: Date.now().toString(), ...newFaq }]);
      setNewFaq({ question: '', answer: '' });
      setShowAddFaq(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSuccess('');

    try {
      await productApi.remove(productId);
      setCatalogSuccess(`Produto ${product.name} removido.`);
      await hydrateCatalog();
    } catch (error: any) {
      setCatalogError(error?.message || 'Nao foi possivel remover o produto.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleKbFileUpload = async (file: File) => {
    if (!selectedKnowledgeBaseId) {
      setKbUploadError('Selecione uma base de conhecimento primeiro.');
      return;
    }
    setKbUploading(true);
    setKbUploadError('');
    setKbUploadSuccess('');
    try {
      await uploadKnowledgeBase(file, selectedKnowledgeBaseId);
      setKbUploadSuccess(`Arquivo ${file.name} enviado com sucesso.`);
      setKbUploadFile(null);
      await hydrateKnowledgeBase();
    } catch (e: any) {
      setKbUploadError(e?.message || 'Erro ao fazer upload do arquivo.');
    } finally {
      setKbUploading(false);
    }
  };

  const handleKbDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setKbDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setKbUploadFile(file);
    }
  };

  const runAiTool = async (
    tool: 'analyzeSentiment' | 'summarize' | 'suggest' | 'pitch',
    label: string,
  ) => {
    if (!aiToolInput.trim()) return;
    setAiToolLoading(true);
    setAiToolError('');
    setAiToolResult('');
    try {
      let res: any;
      const wsId = workspaceId || '';
      // For tools that need workspaceId/conversationId, we use the text as the conversationId for testing
      if (tool === 'analyzeSentiment') {
        res = await aiAssistantApi.analyzeSentiment(aiToolInput.trim());
      } else if (tool === 'summarize') {
        res = await aiAssistantApi.summarize(aiToolInput.trim());
      } else if (tool === 'suggest') {
        res = await aiAssistantApi.suggest(wsId, aiToolInput.trim());
      } else {
        res = await aiAssistantApi.pitch(wsId, aiToolInput.trim());
      }
      if (res.error) throw new Error(res.error);
      const d = res.data as Record<string, any> | undefined;
      const output = d?.sentiment
        ? `${d.sentiment} (score: ${d.score ?? '—'}, label: ${d.label ?? '—'})`
        : d?.summary || d?.suggestion || d?.pitch || JSON.stringify(d, null, 2);
      setAiToolResult(`[${label}]\n${output}`);
    } catch (e: any) {
      setAiToolError(e?.message || `Erro ao executar ${label}`);
    } finally {
      setAiToolLoading(false);
    }
  };

  // Calculate status for KloelStatusCard
  const hasProducts = products.length > 0;
  const hasFiles = knowledgeSources.length > 0;
  const hasCheckout = products.some((p) => p.activePlansCount > 0);
  const hasVoiceTone = voiceTone.style !== '';
  const hasFaq = faqs.length > 0;
  const hasRules = rules.length > 0;
  const checkoutLinksCount = useMemo(
    () => products.reduce((total, product) => total + product.activePlansCount, 0),
    [products],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className={kloelSettingsClass.sectionTitle}>Configurar Kloel</h3>
        <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
          Ensine o Kloel sobre seu negocio para um atendimento perfeito.
        </p>
      </div>

      {(profileError || profileSuccess) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            profileError
              ? 'border-[#E05252]/25 bg-[#E05252]/10 text-[#F7A8A8]'
              : 'border-[#222226] bg-[#111113] text-[#E0DDD8]'
          }`}
        >
          {profileError || profileSuccess}
        </div>
      )}

      {profileLoading ? (
        <SettingsNotice>Carregando perfil persistido do Kloel...</SettingsNotice>
      ) : null}

      <KloelStatusCard
        filesProcessed={knowledgeSources.length}
        productsConfigured={products.length}
        rulesLearned={rules.length}
        faqFilled={faqs.length}
        voiceToneDefined={hasVoiceTone}
        checkoutConfigured={hasCheckout}
      />

      <MissingStepsCard
        hasProducts={hasProducts}
        hasFiles={hasFiles}
        hasCheckout={hasCheckout}
        hasVoiceTone={hasVoiceTone}
        hasFaq={hasFaq}
        hasOpeningMessage={openingMessage.message.trim().length > 0}
        hasWhatsApp={whatsAppConnected}
      />

      <OpeningMessageCard
        value={openingMessage}
        saving={profileSaving}
        onSave={(payload) => {
          setOpeningMessage(payload);
          return saveKloelProfile('Mensagem de abertura salva.', {
            openingMessage: payload,
          });
        }}
      />

      {/* Company Identity */}
      <AccordionSection icon={Building2} title="Identidade da empresa" defaultOpen>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Nome da empresa</Label>
            <Input
              placeholder="Ex: Minha Loja Digital"
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
              className="rounded-xl border-[#222226]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Setor de atuacao</Label>
            <Select
              value={company.sector}
              onValueChange={(v: string) => setCompany({ ...company, sector: v })}
            >
              <SelectTrigger className="rounded-xl border-[#222226]">
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="infoproduct">Infoprodutos</SelectItem>
                <SelectItem value="services">Servicos</SelectItem>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="retail">Varejo</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Descricao do negocio</Label>
            <Textarea
              placeholder="Descreva brevemente o que sua empresa faz..."
              value={company.description}
              onChange={(e) => setCompany({ ...company, description: e.target.value })}
              className="min-h-[80px] rounded-xl border-[#222226]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Missao / Proposta de valor</Label>
            <Textarea
              placeholder="Qual o proposito da sua empresa?"
              value={company.mission}
              onChange={(e) => setCompany({ ...company, mission: e.target.value })}
              className="min-h-[60px] rounded-xl border-[#222226]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Diferenciais competitivos</Label>
            {company.differentials.map((diff, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Diferencial ${i + 1}`}
                  value={diff}
                  onChange={(e) => {
                    const newDiffs = [...company.differentials];
                    newDiffs[i] = e.target.value;
                    setCompany({ ...company, differentials: newDiffs });
                  }}
                  className="rounded-xl border-[#222226]"
                />
                {i > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newDiffs = company.differentials.filter((_, idx) => idx !== i);
                      setCompany({ ...company, differentials: newDiffs });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-[#6E6E73]" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() =>
                setCompany({ ...company, differentials: [...company.differentials, ''] })
              }
              className="text-sm text-[#A1A1A6]"
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar diferencial
            </Button>
          </div>
          <Button
            onClick={() => void saveKloelProfile('Identidade da empresa salva.')}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
          >
            Salvar identidade
          </Button>
        </div>
      </AccordionSection>

      {/* Products */}
      <AccordionSection icon={Package} title="Produtos e ofertas">
        <div className="space-y-4">
          {!workspaceId ? (
            <div className="rounded-xl border border-[#222226] bg-[#2e2e1a] px-4 py-3 text-sm text-[#facc15]">
              Entre com uma conta conectada para carregar o catalogo real e os links de checkout.
            </div>
          ) : null}

          {catalogError ? (
            <div className="rounded-xl border border-[#3a1a1a] bg-[#2e1a1a] px-4 py-3 text-sm text-[#f87171]">
              {catalogError}
            </div>
          ) : null}

          {catalogSuccess ? (
            <div className="rounded-xl border border-[#1a3a1a] bg-[#1a2e1a] px-4 py-3 text-sm text-[#4ade80]">
              {catalogSuccess}
            </div>
          ) : null}

          <div className="rounded-xl border border-[#222226] bg-[#111113] px-4 py-3 text-sm text-[#A1A1A6]">
            {catalogLoading
              ? 'Sincronizando produtos e ofertas do Kloel...'
              : `${products.length} produto(s), ${checkoutLinksCount} checkout(s) ativos e ${products.reduce((total, product) => total + product.memberAreasCount, 0)} area(s) de membros vinculadas.`}
          </div>

          {products.length > 0 ? (
            <div className="space-y-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="rounded-xl border border-[#222226] bg-[#111113] p-4"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-medium text-[#E0DDD8]">{product.name}</p>
                      <p className="text-sm text-[#6E6E73]">
                        {product.type} - {product.price}
                      </p>
                      {product.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-[#6E6E73]">
                          {product.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setEditingProductId(editingProductId === product.id ? null : product.id)
                        }
                        className="rounded-lg p-2 text-[#6E6E73] hover:bg-[#222226]"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDeleteProduct(product.id)}
                        className="rounded-lg p-2 text-[#f87171] hover:bg-[#2e1a1a]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {editingProductId === product.id && (
                    <div className="rounded-xl border border-[#E0DDD8]/40 bg-[#0A0A0C] p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        {[
                          { label: 'Checkouts ativos', value: product.activePlansCount },
                          { label: 'Areas de membros', value: product.memberAreasCount },
                          { label: 'Vendas', value: product.totalSales },
                          {
                            label: 'Receita',
                            value: formatCurrency(product.totalRevenue) || 'R$ 0,00',
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl border border-[#222226] bg-[#111113] px-3 py-3"
                          >
                            <p className="text-[11px] uppercase tracking-wide text-[#6E6E73]">
                              {item.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#E0DDD8]">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 rounded-xl border border-dashed border-[#E0DDD8]/50 bg-[#111113] px-4 py-3 text-sm text-[#A1A1A6]">
                        {product.activePlansCount > 0
                          ? 'Este produto ja possui checkout operando dentro do Kloel.'
                          : 'Os checkouts deste produto sao criados e operados internamente pelo Kloel na tela de editar produto.'}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          onClick={() => router.push(`/products/${product.id}`)}
                          className="rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
                        >
                          Abrir produto
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => router.push(`/products/${product.id}?tab=planos`)}
                          className="rounded-xl"
                        >
                          Abrir checkouts
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6E6E73]">Nenhum produto cadastrado ainda.</p>
          )}

          {showAddProduct ? (
            <div className="rounded-xl border border-[#222226] bg-[#0A0A0C] p-4">
              <div className="space-y-3">
                <Input
                  placeholder="Nome do produto"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="rounded-xl border-[#222226]"
                />
                <Input
                  placeholder="Preco (ex: R$ 97)"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  className="rounded-xl border-[#222226]"
                />
                <Textarea
                  placeholder="Descricao e beneficios"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="min-h-[60px] rounded-xl border-[#222226]"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAddProduct(false)}
                    className="flex-1 rounded-xl"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => void handleAddProduct()}
                    className="flex-1 rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddProduct(true)}
              className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
              disabled={!workspaceId}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar produto
            </Button>
          )}
        </div>
      </AccordionSection>

      {/* Customers */}
      <AccordionSection icon={Users} title="Clientes e publico-alvo">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Personas de cliente</Label>
            <div className="flex flex-wrap gap-2">
              {personas.map((persona, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-[#19191C] px-3 py-1 text-sm text-[#E0DDD8]"
                >
                  {persona}
                  <button onClick={() => setPersonas(personas.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3 text-[#6E6E73] hover:text-[#E0DDD8]" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova persona..."
                value={newPersona}
                onChange={(e) => setNewPersona(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPersona()}
                className="rounded-xl border-[#222226]"
              />
              <Button
                onClick={handleAddPersona}
                variant="outline"
                className="rounded-xl bg-transparent"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            onClick={() => void saveKloelProfile('Personas salvas.')}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
          >
            Salvar personas
          </Button>
        </div>
      </AccordionSection>

      {/* Voice Tone */}
      <AccordionSection icon={MessageSquare} title="Tom de voz">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-[#E0DDD8]">Estilo de comunicacao</Label>
            <Select
              value={voiceTone.style}
              onValueChange={(v: string) => setVoiceTone({ ...voiceTone, style: v })}
            >
              <SelectTrigger className="rounded-xl border-[#222226]">
                <SelectValue placeholder="Selecione um estilo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Profissional e formal</SelectItem>
                <SelectItem value="friendly">Amigavel e descontraido</SelectItem>
                <SelectItem value="persuasive">Persuasivo e vendedor</SelectItem>
                <SelectItem value="technical">Tecnico e detalhado</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-[#111113] p-3">
              <span className="text-sm text-[#E0DDD8]">Ser profissional</span>
              <Switch
                checked={voiceTone.useProfessional}
                onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, useProfessional: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#111113] p-3">
              <span className="text-sm text-[#E0DDD8]">Ser amigavel</span>
              <Switch
                checked={voiceTone.useFriendly}
                onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, useFriendly: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#111113] p-3">
              <span className="text-sm text-[#E0DDD8]">Ser persuasivo</span>
              <Switch
                checked={voiceTone.usePersuasive}
                onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, usePersuasive: v })}
              />
            </div>
          </div>

          {voiceTone.style === 'custom' && (
            <div className="space-y-2">
              <Label className="text-sm text-[#E0DDD8]">Instrucoes personalizadas</Label>
              <Textarea
                placeholder="Descreva como o Kloel deve se comunicar..."
                value={voiceTone.customInstructions}
                onChange={(e) => setVoiceTone({ ...voiceTone, customInstructions: e.target.value })}
                className="min-h-[80px] rounded-xl border-[#222226]"
              />
            </div>
          )}

          <Button
            onClick={() => void saveKloelProfile('Tom de voz salvo.')}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
          >
            Salvar tom de voz
          </Button>
        </div>
      </AccordionSection>

      {/* Rules */}
      <AccordionSection icon={ShieldCheck} title="Regras de atendimento">
        <div className="space-y-4">
          {rules.length > 0 && (
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-[#111113] p-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#19191C] text-xs font-medium text-[#E0DDD8]">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-[#E0DDD8]">{rule}</span>
                  <button onClick={() => setRules(rules.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-[#6E6E73] hover:text-[#f87171]" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Nova regra..."
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
              className="rounded-xl border-[#222226]"
            />
            <Button onClick={handleAddRule} variant="outline" className="rounded-xl bg-transparent">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={() => void saveKloelProfile('Regras de atendimento salvas.')}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
          >
            Salvar regras
          </Button>
        </div>
      </AccordionSection>

      {/* FAQ */}
      <AccordionSection icon={HelpCircle} title="FAQ - Perguntas frequentes">
        <div className="space-y-4">
          {faqs.length > 0 && (
            <div className="space-y-2">
              {faqs.map((faq) => (
                <div key={faq.id} className="rounded-xl border border-[#222226] bg-[#111113] p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <p className="font-medium text-[#E0DDD8]">{faq.question}</p>
                    <button onClick={() => setFaqs(faqs.filter((f) => f.id !== faq.id))}>
                      <Trash2 className="h-4 w-4 text-[#6E6E73] hover:text-[#f87171]" />
                    </button>
                  </div>
                  <p className="text-sm text-[#A1A1A6]">{faq.answer}</p>
                </div>
              ))}
            </div>
          )}

          {showAddFaq ? (
            <div className="rounded-xl border border-[#222226] bg-[#0A0A0C] p-4">
              <div className="space-y-3">
                <Input
                  placeholder="Pergunta"
                  value={newFaq.question}
                  onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                  className="rounded-xl border-[#222226]"
                />
                <Textarea
                  placeholder="Resposta"
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                  className="min-h-[60px] rounded-xl border-[#222226]"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAddFaq(false)}
                    className="flex-1 rounded-xl"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleAddFaq}
                    className="flex-1 rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddFaq(true)}
              className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
            </Button>
          )}
          <Button
            onClick={() => void saveKloelProfile('FAQ salvo no perfil do Kloel.')}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl border border-[#222226] bg-[#0A0A0C] text-[#E0DDD8] hover:bg-[#111113]"
          >
            Salvar FAQ
          </Button>
        </div>
      </AccordionSection>

      {/* Knowledge Base */}
      <AccordionSection icon={FileText} title="Base de conhecimento">
        <div className="space-y-4">
          {(knowledgeError || knowledgeSuccess) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                knowledgeError
                  ? 'border-[#3a1a1a] bg-[#2e1a1a] text-[#f87171]'
                  : 'border-[#1a3a1a] bg-[#1a2e1a] text-[#4ade80]'
              }`}
            >
              {knowledgeError || knowledgeSuccess}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[1fr,auto]">
            <Input
              value={newKnowledgeBaseName}
              onChange={(e) => setNewKnowledgeBaseName(e.target.value)}
              placeholder="Nova base de conhecimento"
              className="rounded-xl border-[#222226]"
            />
            <Button
              onClick={() => void handleCreateKnowledgeBase()}
              disabled={!workspaceId || knowledgeLoading || !newKnowledgeBaseName.trim()}
              className="rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
            >
              <Plus className="mr-2 h-4 w-4" /> Criar base
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px,1fr]">
            <div className="space-y-2">
              <Label className="text-sm text-[#E0DDD8]">Base selecionada</Label>
              <Select
                value={selectedKnowledgeBaseId || undefined}
                onValueChange={setSelectedKnowledgeBaseId}
              >
                <SelectTrigger className="rounded-xl border-[#222226]">
                  <SelectValue placeholder="Selecione a base" />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases.map((base) => (
                    <SelectItem key={base.id} value={base.id}>
                      {base.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#6E6E73]">
                {knowledgeBases.length} base(s) carregada(s) do backend.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-[#222226] bg-[#111113] p-4">
              <div className="grid gap-3 md:grid-cols-[180px,1fr]">
                <div className="space-y-2">
                  <Label className="text-xs text-[#6E6E73]">Tipo da fonte</Label>
                  <Select
                    value={knowledgeSourceType}
                    onValueChange={(value: 'TEXT' | 'URL' | 'PDF') => setKnowledgeSourceType(value)}
                  >
                    <SelectTrigger className="rounded-xl border-[#222226] bg-[#0A0A0C]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Texto</SelectItem>
                      <SelectItem value="URL">URL</SelectItem>
                      <SelectItem value="PDF">PDF (conteudo bruto)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-[#6E6E73]">
                    {knowledgeSourceType === 'URL' ? 'URL' : 'Conteudo'}
                  </Label>
                  <Textarea
                    value={knowledgeSourceContent}
                    onChange={(e) => setKnowledgeSourceContent(e.target.value)}
                    placeholder={
                      knowledgeSourceType === 'URL'
                        ? 'https://seusite.com/artigo'
                        : 'Cole aqui o texto que o Kloel deve aprender.'
                    }
                    className="min-h-[96px] rounded-xl border-[#222226] bg-[#0A0A0C]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#6E6E73]">
                  Use texto ou URL acima, ou faca upload de arquivo abaixo.
                </p>
                <Button
                  onClick={() => void handleAddKnowledgeSource()}
                  disabled={
                    !workspaceId ||
                    !selectedKnowledgeBaseId ||
                    knowledgeLoading ||
                    !knowledgeSourceContent.trim()
                  }
                  className="rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
                >
                  <Upload className="mr-2 h-4 w-4" /> Ingerir fonte
                </Button>
              </div>
            </div>
          </div>

          {knowledgeLoading ? (
            <div className="rounded-xl border border-[#222226] bg-[#111113] px-4 py-3 text-sm text-[#A1A1A6]">
              Sincronizando base de conhecimento...
            </div>
          ) : null}

          {knowledgeSources.length > 0 ? (
            <div className="space-y-2">
              {knowledgeSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-xl bg-[#111113] p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-[#6E6E73]" />
                    <div>
                      <p className="text-sm font-medium text-[#E0DDD8]">{source.type}</p>
                      <p className="text-xs text-[#6E6E73]">
                        {source.status || 'PENDING'} ·{' '}
                        {source.createdAt
                          ? new Date(source.createdAt).toLocaleString('pt-BR')
                          : 'Sem data'}
                      </p>
                      {source.content ? (
                        <p className="mt-1 line-clamp-2 text-xs text-[#6E6E73]">{source.content}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6E6E73]">
              Nenhuma fonte carregada na base de conhecimento selecionada.
            </p>
          )}

          {/* File upload area */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#6E6E73] uppercase tracking-wide">
              Upload de arquivo (PDF, TXT)
            </p>
            {(kbUploadError || kbUploadSuccess) && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${kbUploadError ? 'border-[#3a1a1a] bg-[#2e1a1a] text-[#f87171]' : 'border-[#1a3a1a] bg-[#1a2e1a] text-[#4ade80]'}`}
              >
                {kbUploadError || kbUploadSuccess}
              </div>
            )}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setKbDragOver(true);
              }}
              onDragLeave={() => setKbDragOver(false)}
              onDrop={handleKbDrop}
              onClick={() => document.getElementById('kb-file-input')?.click()}
              className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors p-6 text-center ${kbDragOver ? 'border-[#E85D30] bg-[#E85D30]/5' : 'border-[#222226] hover:border-[#333338]'}`}
            >
              <Upload className="mx-auto mb-2 h-6 w-6 text-[#6E6E73]" />
              <p className="text-sm text-[#A1A1A6]">
                {kbUploadFile ? kbUploadFile.name : 'Arraste um arquivo ou clique para selecionar'}
              </p>
              <p className="mt-1 text-xs text-[#6E6E73]">PDF, TXT, DOCX — max 10MB</p>
              <input
                id="kb-file-input"
                type="file"
                aria-label="Selecionar arquivo para base de conhecimento (PDF, TXT, DOCX)"
                className="hidden"
                accept=".pdf,.txt,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setKbUploadFile(f);
                }}
              />
            </div>
            {kbUploadFile && (
              <Button
                onClick={() => void handleKbFileUpload(kbUploadFile)}
                disabled={kbUploading || !selectedKnowledgeBaseId}
                className="w-full rounded-xl bg-[#E85D30] text-white hover:bg-[#E85D30]/90"
              >
                {kbUploading ? (
                  <PulseLoader width={88} height={18} />
                ) : (
                  `Enviar ${kbUploadFile.name}`
                )}
              </Button>
            )}
          </div>
        </div>
      </AccordionSection>

      <EmergencyModeCard
        value={emergencyMode}
        saving={profileSaving}
        onSave={(payload) => {
          setEmergencyMode(payload);
          return saveKloelProfile('Configuracao de emergencia salva.', {
            emergencyMode: payload,
          });
        }}
      />

      <AccordionSection icon={Sparkles} title="Autonomia comercial">
        <div className="space-y-4">
          {(autopilotError || autopilotSuccess) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                autopilotError
                  ? 'border-[#3a1a1a] bg-[#2e1a1a] text-[#f87171]'
                  : 'border-[#1a3a1a] bg-[#1a2e1a] text-[#4ade80]'
              }`}
            >
              {autopilotError || autopilotSuccess}
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl bg-[#111113] p-4">
            <div>
              <p className="text-sm font-medium text-[#E0DDD8]">Autopilot ativo</p>
              <p className="text-xs text-[#6E6E73]">
                Controla se o agente comercial age sozinho no workspace.
              </p>
            </div>
            <Switch
              checked={autopilotEnabled}
              onCheckedChange={(value: boolean) => void handleToggleAutopilot(value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#6E6E73]">Flow de conversao</Label>
              <Input
                value={autopilotConfig.conversionFlowId}
                onChange={(e) =>
                  setAutopilotConfig((current) => ({
                    ...current,
                    conversionFlowId: e.target.value,
                  }))
                }
                placeholder="flow_id_de_conversao"
                className="rounded-xl border-[#222226]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#6E6E73]">Moeda padrao</Label>
              <Input
                value={autopilotConfig.currencyDefault}
                onChange={(e) =>
                  setAutopilotConfig((current) => ({ ...current, currencyDefault: e.target.value }))
                }
                placeholder="BRL"
                className="rounded-xl border-[#222226]"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs text-[#6E6E73]">Template de recuperacao</Label>
              <Input
                value={autopilotConfig.recoveryTemplateName}
                onChange={(e) =>
                  setAutopilotConfig((current) => ({
                    ...current,
                    recoveryTemplateName: e.target.value,
                  }))
                }
                placeholder="nome_do_template"
                className="rounded-xl border-[#222226]"
              />
            </div>
          </div>

          <Button
            onClick={() => void handleSaveAutopilotConfig()}
            disabled={!workspaceId || autopilotSaving}
            className="w-full rounded-xl bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
          >
            Salvar configuracao operacional
          </Button>
        </div>
      </AccordionSection>

      {/* AI Tools Test Panel */}
      <AccordionSection icon={Sparkles} title="Ferramentas de IA — Testar">
        <div className="space-y-4">
          <p className="text-xs text-[#6E6E73]">
            Teste as ferramentas de IA do assistente diretamente aqui. Informe um texto ou ID de
            conversa e clique em uma ferramenta.
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-[#6E6E73]">Texto / ID de conversa</Label>
            <Textarea
              value={aiToolInput}
              onChange={(e) => setAiToolInput(e.target.value)}
              placeholder="Digite um texto para analise ou um ID de conversa..."
              className="min-h-[72px] rounded-xl border-[#222226]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'analyzeSentiment' as const, label: 'Analisar Sentimento' },
              { key: 'summarize' as const, label: 'Resumir' },
              { key: 'suggest' as const, label: 'Sugerir Resposta' },
              { key: 'pitch' as const, label: 'Gerar Pitch' },
            ].map(({ key, label }) => (
              <Button
                key={key}
                onClick={() => void runAiTool(key, label)}
                disabled={aiToolLoading || !aiToolInput.trim()}
                variant="outline"
                className="rounded-xl border-[#222226] bg-transparent text-sm hover:border-[#E85D30]/50 hover:text-[#E85D30]"
              >
                {aiToolLoading ? '...' : label}
              </Button>
            ))}
          </div>

          {aiToolError && (
            <div className="rounded-xl border border-[#3a1a1a] bg-[#2e1a1a] px-3 py-2 text-xs text-[#f87171]">
              {aiToolError}
            </div>
          )}

          {aiToolResult && (
            <div className="rounded-xl border border-[#222226] bg-[#111113] px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6E6E73]">
                Resultado
              </p>
              <pre className="whitespace-pre-wrap text-xs text-[#E0DDD8] font-mono">
                {aiToolResult}
              </pre>
            </div>
          )}
        </div>
      </AccordionSection>
    </div>
  );
}

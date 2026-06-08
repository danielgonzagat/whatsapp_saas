import { type CapabilityDefinition } from '../capability-registry-v2.types';
import { TIER_0A_INTROSPECTION_CAPABILITIES } from './tier-0a-introspection';
import { TIER_0B_QUERY_CAPABILITIES } from './tier-0b-query';
import { TIER_0C_MUTATIONS_CAPABILITIES } from './tier-0c-mutations';

const FACTORY_CAPABILITY_SURFACE = ['dashboard-chat'] as const;

/**
 * Useful capabilities harvested from the MIT ECC corpus and absorbed as Kloel
 * factory intentions. These are internal routing affordances, not user-visible
 * buttons or names: the manifest builder still marks every entry hiddenFromUser
 * and the response sanitizer strips their ids from public output.
 */
export const TIER_0D_FACTORY_HARVEST_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'factory.web_research_extraction',
    title: 'Pesquisa web e extracao de dados autorizada',
    description:
      'Pesquisa fontes externas, navega paginas autorizadas e extrai dados estruturados com resumo, origem e incertezas sem expor o mecanismo interno.',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'query',
        type: 'string',
        label: 'Pesquisa web scraping extracao dados fonte',
        required: true,
      },
      {
        key: 'source',
        type: 'string',
        label: 'URL fonte site documento opcional',
        required: false,
      },
    ],
    domainService: 'AgentRuntime.tools.researchAndExtract',
    emits: ['tool.research.completed', 'data.extracted'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.browser_qa_click_path',
    title: 'Validacao browser QA click path',
    description:
      'Opera o produto em navegador real para validar fluxo, console, network, responsividade, reload e caminhos clicaveis antes de declarar pronto.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'scenario',
        type: 'string',
        label: 'Cenario browser QA click path e2e',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.browserQa',
    emits: ['browser.validation.completed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.codebase_navigation',
    title: 'Navegacao seletiva pelo codigo',
    description:
      'Usa busca local, simbolos, definicoes, chamadas, imports e testes para montar contexto certo do codigo sem despejar o repositorio inteiro.',
    category: 'SELF_AWARENESS',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'target',
        type: 'string',
        label: 'Codigo arquivo simbolo call graph repo scan',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.codeAwareRetrieval',
    emits: ['context.code.loaded'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.validation_loop',
    title: 'Loop de validacao verificavel',
    description:
      'Planeja e executa typecheck, lint, build, testes, smoke e gates anti-facade adequados ao risco antes de reportar sucesso.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'change',
        type: 'string',
        label: 'Mudanca gate teste lint build typecheck smoke',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.validationHarness',
    emits: ['validation.completed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.security_privacy_review',
    title: 'Revisao seguranca privacidade e nao vazamento',
    description:
      'Audita prompts, traces, ferramentas, logs, artifacts e payloads para impedir vazamento de segredo, dado sensivel ou raciocinio bruto protegido.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'surface',
        type: 'string',
        label: 'Superficie trace prompt segredo payload privacy security',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.safetySanitizerAudit',
    emits: ['safety.review.completed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.document_coauthoring',
    title: 'Coautoria documental profissional',
    description:
      'Cria, estrutura, revisa e testa documentos como PRD, RFC, proposta, ADR, relatorio, slides, DOCX, PPTX, XLSX e PDF com reader-testing quando util.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'documentRequest',
        type: 'string',
        label: 'Documento PRD RFC proposta ADR DOCX PPTX XLSX PDF slides',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.documentBuilder',
    emits: ['artifact.created', 'document.reviewed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
    dependsOn: ['artifacts.create_renderable'],
  },
  {
    id: 'factory.visual_artifact_generation',
    title: 'Geracao visual por codigo',
    description:
      'Produz artifacts visuais por codigo: SVG, Mermaid, HTML interativo, React, canvas, p5 generativo, dashboards, poster PNG/PDF e animacoes seguras.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'visualRequest',
        type: 'string',
        label: 'SVG Mermaid HTML React canvas p5 dashboard poster animacao',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.visualBuilder',
    emits: ['artifact.created', 'visual.generated'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
    dependsOn: ['artifacts.create_renderable'],
  },
  {
    id: 'factory.algorithmic_art_p5',
    title: 'Arte algoritmica p5 seed reproduzivel',
    description:
      'Cria filosofia algoritmica e artifact p5.js self-contained com seed, parametros exploraveis, canvas, download e variacoes reproduciveis sem copiar estilo protegido.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'artRequest',
        type: 'string',
        label: 'Arte generativa p5.js seed flow field particulas algoritmo parametro HTML',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.algorithmicArtBuilder',
    emits: ['artifact.created', 'visual.generated'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
    dependsOn: ['artifacts.create_renderable'],
  },
  {
    id: 'factory.brand_guidelines_visual_identity',
    title: 'Guidelines de marca e identidade visual',
    description:
      'Aplica paleta, tipografia, hierarquia e tokens de marca licenciados a artifacts, documentos e visuais mantendo consistencia visual sem expor a habilidade.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'brandRequest',
        type: 'string',
        label: 'Marca brand guideline paleta tipografia cor identidade visual Poppins Lora',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.brandGuidelines',
    emits: ['artifact.styled', 'brand.applied'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.canvas_design_poster',
    title: 'Design canvas poster PNG PDF',
    description:
      'Gera filosofia visual e compoe poster, PNG ou PDF estatico com grid, espaco, formas, fontes livres e acabamento de nivel profissional.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'designRequest',
        type: 'string',
        label: 'Canvas design poster PNG PDF visual filosofia fonte OFL masterpiece',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.canvasDesignBuilder',
    emits: ['artifact.created', 'visual.generated'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
    dependsOn: ['artifacts.create_renderable'],
  },
  {
    id: 'factory.workflow_orchestration',
    title: 'Orquestracao autonoma de workflow',
    description:
      'Divide missao complexa em etapas, executa loops de agente, acompanha bloqueios reais e continua ate gates verificaveis sem transformar o plano em fachada.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'mission',
        type: 'string',
        label: 'Missao workflow plano orquestracao autonomia loop',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.planner.orchestrate',
    emits: ['workflow.step.completed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.data_dashboard_builder',
    title: 'Dashboard dados charts e extracao estruturada',
    description:
      'Transforma CSV, tabelas, listas, APIs e pesquisa em dados limpos, charts, dashboards, planilhas e visualizacoes baixaveis.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'dataRequest',
        type: 'string',
        label: 'Dados CSV tabela chart dashboard planilha extracao estruturada',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.dataDashboardBuilder',
    emits: ['data.extracted', 'artifact.created'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
    dependsOn: ['artifacts.create_renderable'],
  },
  {
    id: 'factory.accessibility_performance_review',
    title: 'Revisao acessibilidade performance UX',
    description:
      'Audita UI, responsividade, contraste, foco, motion, performance, regressao visual e qualidade de experiencia com evidencias acionaveis.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'uiTarget',
        type: 'string',
        label: 'UI acessibilidade performance responsivo UX visual regression',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.accessibilityPerformanceReview',
    emits: ['ux.review.completed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.code_execution_codemod_terminal',
    title: 'Execucao codigo codemod parsing e terminal controlado',
    description:
      'Executa codigo, interpreta scripts, aplica codemods, analisa AST/parsing e roda terminal sob sandbox, limites, trace e edicao atomica quando houver escrita.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'executionRequest',
        type: 'string',
        label: 'Codigo execucao interpreter terminal codemod parsing AST shell script',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.controlledExecution',
    emits: ['code.executed', 'codemod.completed', 'terminal.command.completed'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.localized_external_data',
    title: 'Dados externos localizados mapas clima esportes receitas imagens',
    description:
      'Busca e renderiza dados externos situacionais como imagens reais da web, mapas, rotas, itinerarios, clima, receitas ajustaveis, placares e estatisticas esportivas.',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'externalDataRequest',
        type: 'string',
        label: 'Mapa rota itinerario clima receita porcao placar esporte imagem web',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.localizedExternalData',
    emits: ['external.data.loaded', 'artifact.created'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
  {
    id: 'factory.media_animation_builder',
    title: 'Midia animacao audio e video por codigo',
    description:
      'Cria animacoes CSS JS canvas SVG, GIFs, cenas, audio sintetico e video por pipeline local ou artifact seguro sem depender de conta paga externa.',
    category: 'MUTATION_SAFE',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'mediaRequest',
        type: 'string',
        label: 'Video audio musica GIF animacao CSS JS canvas SVG cena motion',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.artifacts.mediaAnimationBuilder',
    emits: ['media.generated', 'artifact.created'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
    dependsOn: ['artifacts.create_renderable'],
  },
  {
    id: 'factory.api_connector_builder',
    title: 'Conectores API e integracao de ferramentas',
    description:
      'Projeta conectores API, schemas, adapters, auth segura, rate limits, retries e contratos de ferramenta para integrar dados ou automacoes ao chat.',
    category: 'META',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'connectorRequest',
        type: 'string',
        label: 'API connector adapter schema auth retry rate limit ferramenta integracao',
        required: true,
      },
    ],
    domainService: 'AgentRuntime.tools.apiConnectorBuilder',
    emits: ['connector.designed', 'tool.contract.created'],
    surface: [...FACTORY_CAPABILITY_SURFACE],
    maturity: 'testable',
  },
];

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 0 (aggregate).
 *
 * Tier 0 is sub-partitioned by capability semantics to keep each file small:
 * - tier-0a-introspection — SELF_AWARENESS (self.*, code access, deps/coverage).
 * - tier-0b-query — QUERY (read-only data fetches).
 * - tier-0c-mutations — MUTATION_SAFE / MUTATION_SENSITIVE / CONFIGURATION
 *   (workspace state changes).
 * - tier-0d factory harvest — useful external capability corpus absorbed as
 *   hidden Kloel intentions for routing, artifacts, validation, and tools.
 *
 * Consumers should keep importing CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly. The
 * sub-partitions are exported in case a consumer wants the narrower slice.
 */
export const TIER_0_SELF_AWARENESS_CAPABILITIES: CapabilityDefinition[] = [
  ...TIER_0A_INTROSPECTION_CAPABILITIES,
  ...TIER_0B_QUERY_CAPABILITIES,
  ...TIER_0C_MUTATIONS_CAPABILITIES,
  ...TIER_0D_FACTORY_HARVEST_CAPABILITIES,
];

export {
  TIER_0A_INTROSPECTION_CAPABILITIES,
  TIER_0B_QUERY_CAPABILITIES,
  TIER_0C_MUTATIONS_CAPABILITIES,
};

/**
 * UTP-ROLE-003 — Leverage Map Service.
 *
 * Maps the real levers (actions under the role's control radius)
 * for each economic role. Implements B0.3: recommendations must
 * respect the role's real levers; a suggestion outside the control
 * radius is a grave failure.
 *
 * Injectable service. Pure data ownership — no external I/O.
 * The lever map is derived from the Cognitive Organism Plan
 * (Parte 1, B-Rules B0.3 + B0.10 + B0.15).
 */

import { Injectable } from '@nestjs/common';
import type { LeverageEntry, LeverageMap, Role } from './types';
import { ALL_ROLES } from './types';

const ROLE_LEVER_MAP: ReadonlyMap<Role, readonly LeverageEntry[]> = new Map([
  [
    'produtor',
    [
      {
        lever: 'adjust_price',
        description: 'Ajustar preco do produto',
        controlRadius: 'direct',
      },
      {
        lever: 'edit_product_page',
        description: 'Editar pagina de venda e copy',
        controlRadius: 'direct',
      },
      {
        lever: 'configure_checkout',
        description: 'Configurar fluxo de checkout',
        controlRadius: 'direct',
      },
      {
        lever: 'add_bonus',
        description: 'Adicionar bonus a oferta',
        controlRadius: 'direct',
      },
      {
        lever: 'manage_delivery',
        description: 'Gerenciar entrega do produto',
        controlRadius: 'direct',
      },
      {
        lever: 'set_commission',
        description: 'Definir comissao para afiliados',
        controlRadius: 'direct',
      },
      {
        lever: 'run_ads_campaign',
        description: 'Criar campanha de anuncios',
        controlRadius: 'influenced',
      },
      {
        lever: 'recruit_affiliates',
        description: 'Recrutar afiliados para promover',
        controlRadius: 'influenced',
      },
    ],
  ],
  [
    'afiliado',
    [
      {
        lever: 'choose_product',
        description: 'Escolher produto para promover',
        controlRadius: 'direct',
      },
      {
        lever: 'select_traffic_channel',
        description: 'Selecionar canal de trafego',
        controlRadius: 'direct',
      },
      {
        lever: 'create_creative',
        description: 'Criar criativo e angulo de venda',
        controlRadius: 'direct',
      },
      {
        lever: 'manage_budget',
        description: 'Gerenciar orcamento de anuncios',
        controlRadius: 'direct',
      },
      {
        lever: 'protect_account',
        description: 'Proteger conta de anuncios',
        controlRadius: 'direct',
      },
      {
        lever: 'rotate_angles',
        description: 'Rotacionar angulos criativos',
        controlRadius: 'direct',
      },
      {
        lever: 'compare_commissions',
        description: 'Comparar comissoes entre produtos',
        controlRadius: 'direct',
      },
    ],
  ],
  [
    'agencia',
    [
      {
        lever: 'add_client',
        description: 'Adicionar novo cliente ao portfolio',
        controlRadius: 'direct',
      },
      {
        lever: 'allocate_team',
        description: 'Alocar membro do time a cliente',
        controlRadius: 'direct',
      },
      {
        lever: 'set_margin_target',
        description: 'Definir meta de margem por cliente',
        controlRadius: 'direct',
      },
      {
        lever: 'review_churn_risk',
        description: 'Revisar risco de churn por cliente',
        controlRadius: 'direct',
      },
      {
        lever: 'balance_workload',
        description: 'Balancear carga de trabalho do time',
        controlRadius: 'direct',
      },
      {
        lever: 'handoff_client',
        description: 'Transferir cliente entre membros',
        controlRadius: 'direct',
      },
      {
        lever: 'optimize_margin',
        description: 'Otimizar margem agregada do portfolio',
        controlRadius: 'influenced',
      },
    ],
  ],
  [
    'gestor',
    [
      {
        lever: 'hire_team',
        description: 'Contratar novo membro do time',
        controlRadius: 'direct',
      },
      {
        lever: 'assign_task',
        description: 'Atribuir tarefa a membro do time',
        controlRadius: 'direct',
      },
      {
        lever: 'set_kpi',
        description: 'Definir KPI e metas',
        controlRadius: 'direct',
      },
      {
        lever: 'review_pipeline',
        description: 'Revisar pipeline de vendas',
        controlRadius: 'direct',
      },
      {
        lever: 'approve_budget',
        description: 'Aprovar orcamento de campanha',
        controlRadius: 'direct',
      },
      {
        lever: 'configure_automation',
        description: 'Configurar automacao de processos',
        controlRadius: 'direct',
      },
      {
        lever: 'delegate_decision',
        description: 'Delegar decisao a subordinado',
        controlRadius: 'influenced',
      },
    ],
  ],
  [
    'closer',
    [
      {
        lever: 'call_lead',
        description: 'Ligar para lead',
        controlRadius: 'direct',
      },
      {
        lever: 'handle_objection',
        description: 'Tratar objecao de venda',
        controlRadius: 'direct',
      },
      {
        lever: 'move_deal_stage',
        description: 'Mover negocio no pipeline',
        controlRadius: 'direct',
      },
      {
        lever: 'send_followup',
        description: 'Enviar follow-up ao lead',
        controlRadius: 'direct',
      },
      {
        lever: 'apply_discount',
        description: 'Aplicar desconto aprovado',
        controlRadius: 'direct',
      },
      {
        lever: 'request_material',
        description: 'Solicitar material de apoio',
        controlRadius: 'influenced',
      },
    ],
  ],
  [
    'creator',
    [
      {
        lever: 'publish_content',
        description: 'Publicar conteudo',
        controlRadius: 'direct',
      },
      {
        lever: 'engage_audience',
        description: 'Engajar com audiencia',
        controlRadius: 'direct',
      },
      {
        lever: 'choose_partner',
        description: 'Escolher parceiro comercial',
        controlRadius: 'direct',
      },
      {
        lever: 'protect_authenticity',
        description: 'Proteger autenticidade e confianca',
        controlRadius: 'direct',
      },
      {
        lever: 'negotiate_deal',
        description: 'Negociar acordo comercial',
        controlRadius: 'direct',
      },
      {
        lever: 'build_owned_audience',
        description: 'Construir audiencia propria',
        controlRadius: 'influenced',
      },
    ],
  ],
  [
    'especialista',
    [
      {
        lever: 'execute_specialised_task',
        description: 'Executar tarefa especializada',
        controlRadius: 'direct',
      },
      {
        lever: 'audit_domain',
        description: 'Auditar conformidade do dominio',
        controlRadius: 'direct',
      },
      {
        lever: 'configure_tool',
        description: 'Configurar ferramenta especializada',
        controlRadius: 'direct',
      },
      {
        lever: 'certify_process',
        description: 'Certificar processo no dominio',
        controlRadius: 'direct',
      },
      {
        lever: 'train_team',
        description: 'Treinar time em dominio',
        controlRadius: 'direct',
      },
    ],
  ],
]);

function buildLeverageMap(role: Role): LeverageMap {
  const entries = ROLE_LEVER_MAP.get(role) ?? [];
  const directLevers = entries
    .filter((e) => e.controlRadius === 'direct')
    .map((e) => e.lever);
  const influencedLevers = entries
    .filter((e) => e.controlRadius === 'influenced')
    .map((e) => e.lever);
  return {
    role,
    levers: entries,
    directLevers,
    influencedLevers,
  };
}

const LEVERAGE_MAP_CACHE = new Map<Role, LeverageMap>();
for (const role of ALL_ROLES) {
  LEVERAGE_MAP_CACHE.set(role, buildLeverageMap(role));
}

/**
 * UTP-ROLE-003: get the full leverage map for a role.
 */
export function getLeverageMap(role: Role): LeverageMap {
  return (
    LEVERAGE_MAP_CACHE.get(role) ?? buildLeverageMap(role)
  );
}

/**
 * UTP-ROLE-003 helper: get only direct levers (under full control).
 */
export function getLeversForRole(role: Role): readonly string[] {
  return getLeverageMap(role).directLevers;
}

/**
 * UTP-ROLE-003 helper: check whether a lever is within the role's
 * control radius (direct OR influenced).
 */
export function isLeverInControlRadius(
  role: Role,
  lever: string,
): boolean {
  const map = getLeverageMap(role);
  return map.directLevers.includes(lever) || map.influencedLevers.includes(lever);
}

/**
 * UTP-ROLE-003 service class for NestJS DI.
 * Wraps the pure functions above for DI consumers.
 */
@Injectable()
export class LeverageMapService {
  public getMap(role: Role): LeverageMap {
    return getLeverageMap(role);
  }

  public getLevers(role: Role): readonly string[] {
    return getLeversForRole(role);
  }

  public isInRadius(role: Role, lever: string): boolean {
    return isLeverInControlRadius(role, lever);
  }

  public getAllMaps(): ReadonlyMap<Role, LeverageMap> {
    return LEVERAGE_MAP_CACHE;
  }
}

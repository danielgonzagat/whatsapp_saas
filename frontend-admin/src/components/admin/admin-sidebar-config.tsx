'use client';

import type { ComponentType, CSSProperties, SVGProps } from 'react';
import {
  BarChart3,
  Building2,
  FileText,
  Megaphone,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';

/** Admin sidebar sub item shape. */
export interface AdminSidebarSubItem {
  /** Key property. */
  key: string;
  /** Label property. */
  label: string;
  /** Href property. */
  href: string;
}

/** Admin sidebar item shape. */
export interface AdminSidebarItem {
  /** Key property. */
  key: string;
  /** Label property. */
  label: string;
  /** Href property. */
  href: string;
  /** Icon property. */
  icon: AdminSidebarIcon;
  /** Sub property. */
  sub?: AdminSidebarSubItem[];
  /** Min role property. */
  minRole?: 'OWNER' | 'MANAGER' | 'STAFF';
}

/** Admin sidebar section shape. */
export interface AdminSidebarSection {
  /** Key property. */
  key: string;
  /** Items property. */
  items: AdminSidebarItem[];
}

/** Admin sidebar icon type. */
export type AdminSidebarIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface SharedIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

/** Home icon. */
export function HomeIcon({ size = 18, color = 'currentColor', style, ...props }: SharedIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        overflow: 'visible',
        transform: 'scale(1.2)',
        transformOrigin: 'center',
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M4.85 10.15L12 4.15L19.15 10.15V18.2C19.15 19.0284 18.4784 19.7 17.65 19.7H6.35C5.52157 19.7 4.85 19.0284 4.85 18.2V10.15Z"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sales icon. */
export function SalesIcon({ size = 18, color = 'currentColor', style, ...props }: SharedIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72.617 40.537"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        overflow: 'visible',
        transform: 'scale(1.18)',
        transformOrigin: 'center',
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      <g transform="translate(-621.208 -934.226)">
        <g>
          <path
            d="M688.461,944.951a191.915,191.915,0,0,0-11.136-10.725h-50.3a5.823,5.823,0,0,0-5.817,5.816v18.223A192.8,192.8,0,0,0,631.935,969.4a6.063,6.063,0,0,0,6.014,5.364h49.819a6.064,6.064,0,0,0,6.057-6.057V950.965A6.063,6.063,0,0,0,688.461,944.951Zm-64.253,13.314V940.042a2.82,2.82,0,0,1,2.817-2.816h50.3a2.815,2.815,0,0,1,2.769,2.341H632.367a5.824,5.824,0,0,0-5.817,5.817v15.649A2.816,2.816,0,0,1,624.208,958.265Zm5.342,5.341V945.384a2.821,2.821,0,0,1,2.817-2.817h50.3a2.816,2.816,0,0,1,2.769,2.341H637.949a6.064,6.064,0,0,0-6.057,6.057v15.41A2.815,2.815,0,0,1,629.55,963.606Zm61.275,5.1a3.061,3.061,0,0,1-3.057,3.057H637.949a3.06,3.06,0,0,1-3.057-3.057V950.965a3.06,3.06,0,0,1,3.057-3.057h49.819a3.061,3.061,0,0,1,3.057,3.057Z"
            fill={color}
            fillOpacity="0.96"
          />
          <path
            d="M662.858,950c-4.952,0-8.981,4.411-8.981,9.834s4.029,9.833,8.981,9.833,8.981-4.411,8.981-9.833S667.81,950,662.858,950Zm0,16.667c-3.3,0-5.981-3.066-5.981-6.833S659.56,953,662.858,953s5.981,3.065,5.981,6.834S666.156,966.67,662.858,966.67Z"
            fill={color}
            fillOpacity="0.96"
          />
          <path
            d="M681.352,954.732a5.1,5.1,0,1,0,5.1,5.1A5.111,5.111,0,0,0,681.352,954.732Zm0,7.208a2.1,2.1,0,1,1,2.1-2.1A2.107,2.107,0,0,1,681.352,961.94Z"
            fill={color}
            fillOpacity="0.96"
          />
          <path
            d="M644.717,954.732a5.1,5.1,0,1,0,5.1,5.1A5.11,5.11,0,0,0,644.717,954.732Zm0,7.208a2.1,2.1,0,1,1,2.1-2.1A2.1,2.1,0,0,1,644.717,961.94Z"
            fill={color}
            fillOpacity="0.96"
          />
        </g>
        <path
          d="M662.531,962.846c-1.6-.11-2.423-.94-2.478-2.184h1.833a.8.8,0,0,0,.645.784v-1.2c-1.686-.23-2.349-.811-2.349-2.1,0-1.151.884-1.962,2.349-2.063v-.82h.746v.829c1.373.11,2.193.728,2.294,2.027h-1.8a.64.64,0,0,0-.5-.627v1.133c1.428.194,2.386.664,2.386,2.009,0,1.152-.718,2.1-2.386,2.211V964h-.746Zm0-4.321v-1.059c-.378.064-.571.258-.571.525C661.96,958.286,662.107,958.433,662.531,958.525Zm.746,1.852v1.087c.378-.083.553-.295.553-.58C663.83,960.617,663.692,960.478,663.277,960.377Z"
          fill={color}
          fillOpacity="0.96"
        />
      </g>
    </svg>
  );
}

/** Sidebar toggle icon. */
export function SidebarToggleIcon({
  color = 'var(--app-text-secondary)',
  size = 18,
  strokeWidth = 1.9,
}: {
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="2.5"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <path d="M9 5.5V18.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/** Conversations icon. */
export function ConversationsIcon({
  size = 18,
  color = 'currentColor',
  style,
  ...props
}: SharedIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        overflow: 'visible',
        transform: 'scale(1.22)',
        transformOrigin: 'center',
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M8.35 5.35H15.65C17.9683 5.35 19.85 7.23166 19.85 9.55V12.15C19.85 14.4683 17.9683 16.35 15.65 16.35H10.8477C10.3307 16.35 9.8263 16.5107 9.40429 16.8099L7.08994 18.4505C6.43432 18.9153 5.525 18.4465 5.525 17.6428V16.6164C5.525 16.0935 5.22144 15.618 4.74634 15.3969C4.10558 15.0986 3.65 14.4498 3.65 13.6944V9.55C3.65 7.23166 5.53166 5.35 7.85 5.35H8.35Z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Admin_sidebar_sections. */
export const ADMIN_SIDEBAR_SECTIONS: readonly AdminSidebarSection[] = [
  {
    key: 'operational',
    items: [
      { key: 'home', label: 'Home', href: '/', icon: HomeIcon },
      {
        key: 'produtos',
        label: 'Produtos',
        href: '/produtos',
        icon: Package,
        sub: [
          { key: 'todos', label: 'Todos os Produtos', href: '/produtos?tab=todos' },
          { key: 'moderacao', label: 'Fila de Moderação', href: '/produtos?tab=moderacao' },
          { key: 'produtor', label: 'Por Produtor', href: '/produtos?tab=produtor' },
          { key: 'marketplace', label: 'Marketplace', href: '/produtos?tab=marketplace' },
        ],
      },
      {
        key: 'marketing',
        label: 'Marketing',
        href: '/marketing',
        icon: Megaphone,
        sub: [
          { key: 'conversas', label: 'Conversas', href: '/marketing?tab=conversas' },
          { key: 'whatsapp', label: 'WhatsApp', href: '/marketing?tab=whatsapp' },
          { key: 'instagram', label: 'Instagram', href: '/marketing?tab=instagram' },
          { key: 'tiktok', label: 'TikTok', href: '/marketing?tab=tiktok' },
          { key: 'facebook', label: 'Facebook', href: '/marketing?tab=facebook' },
          { key: 'email', label: 'Email', href: '/marketing?tab=email' },
        ],
      },
      {
        key: 'vendas',
        label: 'Vendas',
        href: '/vendas',
        icon: SalesIcon,
        sub: [
          { key: 'gestao', label: 'Gestão de Vendas', href: '/vendas?tab=vendas' },
          { key: 'assinaturas', label: 'Assinaturas', href: '/vendas?tab=assinaturas' },
          { key: 'fisicos', label: 'Produtos Físicos', href: '/vendas?tab=fisicos' },
          { key: 'pipeline', label: 'Pipeline CRM', href: '/vendas?tab=pipeline' },
          { key: 'estrategias', label: 'Estratégias', href: '/vendas?tab=estrategias' },
        ],
      },
      {
        key: 'carteira',
        label: 'Carteira',
        href: '/carteira',
        icon: Wallet,
        sub: [
          { key: 'saldo', label: 'Saldo', href: '/carteira?tab=saldo' },
          { key: 'extrato', label: 'Extrato', href: '/carteira?tab=extrato' },
          { key: 'saques', label: 'Saques', href: '/carteira?tab=saques' },
          { key: 'antecipacoes', label: 'Antecipações', href: '/carteira?tab=antecipacoes' },
        ],
      },
      { key: 'relatorios', label: 'Relatórios', href: '/relatorios', icon: BarChart3 },
    ],
  },
  {
    key: 'admin-control',
    items: [
      { key: 'contas', label: 'Contas', href: '/contas', icon: Building2 },
      { key: 'compliance', label: 'Compliance', href: '/compliance', icon: ShieldCheck },
      { key: 'clientes', label: 'Clientes', href: '/clientes', icon: Users },
    ],
  },
  {
    key: 'marketplace',
    items: [
      {
        key: 'configuracoes',
        label: 'Configurações',
        href: '/configuracoes',
        icon: Settings,
        minRole: 'OWNER',
      },
      { key: 'audit', label: 'Audit log', href: '/audit', icon: FileText },
    ],
  },
] as const;

/** Admin_ai_actions. */
export const ADMIN_AI_ACTIONS = [
  { key: 'new-chat', label: 'Novo chat', href: '/chat', icon: Plus },
  { key: 'search', label: 'Buscar', href: '/chat', icon: Search },
] as const;

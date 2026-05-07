'use client';

import { kloelT } from '@/lib/i18n/t';
import type React from 'react';

export type UniversalChannel = 'instagram' | 'facebook' | 'tiktok' | 'email';

export const WIZARD_STEPS = [
  kloelT('Conexao'),
  kloelT('Perfil'),
  kloelT('Formatos'),
  kloelT('Revisar'),
] as const;

export interface ChannelWizardProfile {
  label: string;
  description: string;
  connectionLabel: string;
  connectingLabel: string;
  connectDescription: string;
  profileCards: { label: string; value: string }[];
  formatNotes: { title: string; body: string }[];
  restrictions: string[];
  activationSummary: string;
}

export function channelWizardProfile(channel: UniversalChannel): ChannelWizardProfile {
  switch (channel) {
    case 'instagram':
      return {
        label: 'Instagram',
        connectionLabel: 'Conectar Instagram',
        connectingLabel: 'Abrindo Meta...',
        description:
          'Gerencie mensagens do Direct, comente em publicacoes e acompanhe metricas do seu Instagram Business em um so lugar.',
        connectDescription:
          'Conecte sua conta Meta com Instagram Business para liberar o Direct, comentarios e insights reais. O fluxo abre a autorizacao oficial da Meta e retorna para este canal automaticamente.',
        profileCards: [
          {
            label: 'Conta necessaria',
            value: 'Instagram Business vinculado a uma Pagina do Facebook',
          },
          {
            label: 'Permissoes',
            value: 'Leitura e resposta de mensagens do Direct, gerenciamento de comentarios',
          },
          { label: 'Metricas disponiveis', value: 'Seguidores, impressoes, alcance e engajamento' },
          { label: 'Conteudo gerenciado', value: 'Feed, Stories e Reels com metricas por formato' },
        ],
        formatNotes: [
          {
            title: 'Mensagens do Direct',
            body: 'Texto, imagens, videos, GIFs e links. Respostas rapidas disponiveis para agilizar o atendimento.',
          },
          {
            title: 'Comentarios',
            body: 'Responda comentarios em publicacoes do feed e anuncie respostas automaticas para perguntas frequentes.',
          },
          {
            title: 'Stories e Reels',
            body: 'Mencionar sua conta em Stories gera notificacoes no Direct. Reels com marcacao tambem aparecem como interacao.',
          },
        ],
        restrictions: [
          'A conta precisa ser Business ou Creator (contas pessoais nao tem acesso a API)',
          'Necessario ter uma Pagina do Facebook vinculada a conta do Instagram',
          'Mensagens so podem ser enviadas para usuarios que ja interagiram com a conta',
          'Limite de 150 mensagens por dia por conta via API',
        ],
        activationSummary:
          'Ao conectar o Instagram, voce podera ler e responder mensagens do Direct, gerenciar comentarios e acompanhar metricas de audiencia diretamente do painel da KLOEL.',
      };
    case 'facebook':
      return {
        label: 'Messenger',
        connectionLabel: 'Conectar Facebook',
        connectingLabel: 'Abrindo Meta...',
        description:
          'Automatize conversas do Messenger, configure respostas rapidas e acompanhe o desempenho da sua Pagina em tempo real.',
        connectDescription:
          'Conecte a Pagina do Facebook para liberar o Messenger dentro da KLOEL. O fluxo abre a autorizacao oficial da Meta e retorna para este canal automaticamente.',
        profileCards: [
          { label: 'Conta necessaria', value: 'Pagina do Facebook com Messenger ativo' },
          {
            label: 'Permissoes',
            value: 'Leitura e envio de mensagens do Messenger, gerenciamento de conversas',
          },
          {
            label: 'Recursos',
            value: 'Respostas automaticas, templates salvos e IA para atendimento',
          },
          {
            label: 'Metricas',
            value: 'Mensagens recebidas, tempo medio de resposta e taxa de conversao',
          },
        ],
        formatNotes: [
          {
            title: 'Texto simples',
            body: 'Mensagens de ate 2000 caracteres com suporte a emojis nativos da plataforma.',
          },
          {
            title: 'Imagens e anexos',
            body: 'Envio de fotos, GIFs, videos e arquivos PDF. Tamanho maximo de 25 MB por anexo.',
          },
          {
            title: 'Botoes e respostas rapidas',
            body: 'Templates com ate 3 botoes de acao ou 13 respostas rapidas para agilizar o atendimento automatizado.',
          },
          {
            title: 'Modelos de mensagem',
            body: 'Mensagens com variaveis personalizadas como nome do cliente, produto e data da ultima compra.',
          },
        ],
        restrictions: [
          'A Pagina precisa ter o Messenger ativo e permissoes de mensagens liberadas',
          'Mensagens promocionais fora da janela de 24h exigem template aprovado pela Meta',
          'Respostas rapidas expiram apos 24 horas da ultima interacao do usuario',
          'Arquivos acima de 25 MB precisam ser enviados como link externo',
        ],
        activationSummary:
          'Ao conectar o Messenger, voce tera a caixa de entrada unificada com IA para respostas automaticas, templates prontos e metricas de desempenho da sua Pagina.',
      };
    case 'tiktok':
      return {
        label: 'TikTok',
        connectionLabel: 'Conectar TikTok',
        connectingLabel: 'Abrindo TikTok...',
        description:
          'Conecte sua conta TikTok para gerenciar mensagens, monitorar metricas de conteudo e automatizar interacoes com seguidores.',
        connectDescription:
          'Conecte sua conta TikTok pelo fluxo oficial de autorizacao. As chaves do aplicativo precisam estar configuradas no workspace antes da conexao.',
        profileCards: [
          { label: 'Conta necessaria', value: 'Conta TikTok Creator ou Business com acesso a API' },
          {
            label: 'Permissoes',
            value: 'Leitura de perfil, metricas de video e gerenciamento de mensagens diretas',
          },
          {
            label: 'Chaves do app',
            value: 'Client Key e Client Secret configurados no workspace KLOEL',
          },
          {
            label: 'Metricas disponiveis',
            value: 'Visualizacoes, curtidas, compartilhamentos e seguidores por video',
          },
        ],
        formatNotes: [
          {
            title: 'Mensagens diretas',
            body: 'Texto simples de ate 500 caracteres. Apenas disponivel para seguidores mutuos por padrao.',
          },
          {
            title: 'Videos',
            body: 'Duracao entre 3 segundos e 10 minutos. Formatos MP4, MOV e WebM com resolucao minima de 720p.',
          },
          {
            title: 'Legendas',
            body: 'Texto de ate 2200 caracteres com suporte a hashtags e mencoes a outros usuarios.',
          },
          {
            title: 'Comentarios',
            body: 'Respostas automaticas ou manuais com limite de 150 caracteres e suporte a emojis.',
          },
        ],
        restrictions: [
          'Conexao exige chaves de aplicativo TikTok configuradas no workspace',
          'Mensagens diretas so estao disponiveis entre contas que se seguem mutuamente',
          'A API do TikTok tem limite de requisicoes por minuto conforme o tier da conta',
          'Tokens de acesso expiram e precisam ser renovados periodicamente',
          'Conteudo publicado via API precisa seguir as diretrizes de comunidade do TikTok',
        ],
        activationSummary:
          'Ao conectar o TikTok, voce podera gerenciar mensagens diretas, monitorar metricas de videos e automatizar respostas a comentarios diretamente da KLOEL.',
      };
    case 'email':
      return {
        label: 'Email',
        connectionLabel: 'Ativar Email',
        connectingLabel: 'Ativando...',
        description:
          'Envie campanhas, automatize sequencias de boas-vindas e recuperacao, e acompanhe metricas de entrega e abertura em tempo real.',
        connectDescription:
          'Ative o canal de email do workspace para comecar a enviar campanhas, testes e sequencias automaticas. O provedor de envio precisa estar configurado no backend.',
        profileCards: [
          { label: 'Provedor', value: 'Configurado no backend do workspace (SMTP ou API)' },
          { label: 'Remetente', value: 'Nome e email configurados como identidade de envio' },
          {
            label: 'Templates',
            value: 'Boas-vindas, recuperacao de checkout e ofertas relampago prontos para uso',
          },
          {
            label: 'Metricas',
            value: 'Taxa de entrega, abertura, cliques e conversao por campanha',
          },
        ],
        formatNotes: [
          {
            title: 'Corpo da mensagem',
            body: 'HTML completo com suporte a imagens, links, botoes e estilizacao inline. Texto simples como fallback automatico.',
          },
          {
            title: 'Assunto',
            body: 'Ate 998 caracteres, mas recomendado manter abaixo de 60 para exibicao completa em dispositivos moveis.',
          },
          {
            title: 'Links',
            body: 'URLs com rastreamento de cliques automatico. Use parametros UTM para segmentar o trafego por campanha.',
          },
          {
            title: 'Personalizacao',
            body: 'Variaveis como nome do cliente, produto abandonado e link de checkout disponiveis em todos os templates.',
          },
        ],
        restrictions: [
          'Todo email precisa incluir link de descadastramento (unsubscribe) obrigatorio',
          'Remetente precisa ser verificado no provedor de envio antes do primeiro disparo',
          'Limite de envio conforme plano do workspace e cota do provedor',
          'Conteudo precisa seguir boas praticas de entregabilidade (SPF, DKIM, DMARC)',
          'Emojis no assunto podem reduzir a taxa de entrega em alguns provedores',
        ],
        activationSummary:
          'Ao ativar o canal de email, voce podera criar e enviar campanhas, usar templates prontos e acompanhar metricas de desempenho diretamente da KLOEL.',
      };
    default:
      return {
        label: 'Canal',
        connectionLabel: 'Conectar',
        connectingLabel: 'Conectando...',
        description: '',
        connectDescription: '',
        profileCards: [],
        formatNotes: [],
        restrictions: [],
        activationSummary: '',
      };
  }
}

export interface WizardConnectionState {
  connecting: boolean;
  connected: boolean;
  error: string | null;
}

export type WizardStep = 0 | 1 | 2 | 3;

export type WizardConnectionMethod = 'meta-oauth' | 'tiktok-oauth' | 'email-toggle';

export function resolveConnectionMethod(channel: UniversalChannel): WizardConnectionMethod {
  switch (channel) {
    case 'instagram':
    case 'facebook':
      return 'meta-oauth';
    case 'tiktok':
      return 'tiktok-oauth';
    case 'email':
      return 'email-toggle';
  }
}

export function channelIcon(channel: UniversalChannel, size: number): React.ReactElement {
  const s = size;
  switch (channel) {
    case 'instagram':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z" />
        </svg>
      );
    case 'email':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 6L2 7" />
        </svg>
      );
  }
}

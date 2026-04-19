import type { ReactNode } from 'react';
import {
  LegalLink,
  LegalList,
  LegalNote,
  LegalParagraph,
  LegalTable,
  type LegalSection,
} from '@/components/legal/legal-document-page';
import {
  LEGAL_COMPANY,
  LEGAL_LAST_UPDATED,
  buildLegalUrl,
  formatLegalDate,
} from './legal-constants';

type LegalDocumentDefinition = {
  title: string;
  description: string;
  eyebrow: string;
  languageLabel: string;
  lastUpdatedLabel: string;
  lastUpdatedValue: string;
  versionHref: string;
  versionLabel: string;
  sections: LegalSection[];
  structuredData: Record<string, unknown>;
};

function orgStructuredData(url: string) {
  return {
    '@type': 'Organization',
    name: LEGAL_COMPANY.legalName,
    url: buildLegalUrl('/'),
    email: LEGAL_COMPANY.controllerEmail,
    taxID: LEGAL_COMPANY.cnpj,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${LEGAL_COMPANY.addressLine1}, ${LEGAL_COMPANY.addressLine2}`,
      addressLocality: LEGAL_COMPANY.city,
      addressRegion: LEGAL_COMPANY.state,
      postalCode: LEGAL_COMPANY.postalCode,
      addressCountry: 'BR',
    },
    sameAs: [url],
  };
}

function buildStructuredData(
  type: 'PrivacyPolicy' | 'TermsOfService' | 'WebPage',
  name: string,
  path: string,
  inLanguage: 'pt-BR' | 'en-US',
) {
  const url = buildLegalUrl(path);

  return {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    url,
    inLanguage,
    dateModified: LEGAL_LAST_UPDATED,
    publisher: orgStructuredData(url),
    about: {
      '@type': 'Thing',
      name: 'Kloel legal compliance',
    },
    mainEntityOfPage: url,
  };
}

function addressLabel() {
  return `${LEGAL_COMPANY.addressLine1}, ${LEGAL_COMPANY.addressLine2}, ${LEGAL_COMPANY.city}/${LEGAL_COMPANY.state}, CEP ${LEGAL_COMPANY.postalCode}, ${LEGAL_COMPANY.country}`;
}

function ptPrivacySections(): LegalSection[] {
  return [
    {
      id: 'quem-somos',
      title: '1. Quem somos',
      content: (
        <>
          <LegalParagraph>
            Esta Política de Privacidade descreve como a {LEGAL_COMPANY.legalName}, inscrita no
            CNPJ {LEGAL_COMPANY.cnpj}, atua como controladora dos dados pessoais tratados em
            kloel.com, auth.kloel.com, app.kloel.com e demais superfícies públicas da Kloel.
          </LegalParagraph>
          <LegalParagraph>
            Endereço comercial: {addressLabel()}. Contato do encarregado pelo tratamento de dados:
            {' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>
            . Contato geral e suporte operacional:{' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.supportEmail}`}>
              {LEGAL_COMPANY.supportEmail}
            </LegalLink>
            .
          </LegalParagraph>
          <LegalNote>
            <LegalParagraph>
              Quando a Kloel processa dados de clientes finais dos nossos clientes, atuamos como
              operadora/processadora e o cliente Kloel permanece como controlador principal para o
              respectivo relacionamento comercial.
            </LegalParagraph>
          </LegalNote>
        </>
      ),
    },
    {
      id: 'dados-coletados',
      title: '2. Dados que coletamos',
      content: (
        <>
          <LegalParagraph>
            Coletamos apenas os dados necessários para autenticação, operação da plataforma,
            checkout, cobrança, segurança, suporte e automação comercial autorizada.
          </LegalParagraph>
          <LegalParagraph>
            <strong>2.1 Dados fornecidos diretamente.</strong> Nome, email, telefone, senha ou link
            mágico, endereço de cobrança/entrega, CNPJ/CPF, dados de checkout, conteúdo enviado
            em formulários, mensagens operacionais e materiais que você cadastra na plataforma.
          </LegalParagraph>
          <LegalParagraph>
            <strong>2.2 Dados coletados automaticamente.</strong> Endereço IP, logs de acesso,
            identificadores de sessão, device/browser metadata, eventos de autenticação, cookies
            essenciais, métricas de uso, timestamps, informações antifraude e registros de auditoria.
          </LegalParagraph>
          <LegalParagraph>
            <strong>2.3 Dados recebidos de terceiros.</strong> Quando você escolhe autenticar ou
            conectar integrações externas, recebemos:
          </LegalParagraph>
          <LegalList
            items={[
              <>
                <strong>Google.</strong> Nome, endereço de email, foto de perfil e preferência de
                idioma via escopos <code>openid</code>, <code>email</code> e <code>profile</code>.
                Em um fluxo separado, opcional e desabilitado por padrão, a Kloel pode solicitar
                <code> https://www.googleapis.com/auth/user.phonenumbers.read</code>,
                <code> https://www.googleapis.com/auth/user.addresses.read</code> e
                <code> https://www.googleapis.com/auth/user.birthday.read</code> para preencher
                checkout mediante consentimento incremental e aprovação prévia do Google.
              </>,
              <>
                <strong>Meta/Facebook.</strong> Nome, email e foto via permissões <code>email</code>
                {' '}e <code>public_profile</code>; além de IDs de Page, Instagram, WABA, número
                comercial, status de qualidade, templates e outros metadados necessários às
                integrações oficiais do ecossistema Meta.
              </>,
              <>
                <strong>Apple.</strong> Nome e email via Sign in with Apple, conforme disponibilizado
                pela Apple no primeiro consentimento.
              </>,
            ]}
          />
          <LegalParagraph>
            <strong>2.4 Dados de clientes finais dos nossos clientes.</strong> Leads, mensagens,
            histórico de campanhas, dados de pedidos e contexto comercial enviado pelos clientes da
            Kloel. Nessa hipótese, tratamos os dados conforme instruções contratuais do cliente e
            pela necessidade técnica de operar o serviço.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'finalidades-bases-legais',
      title: '3. Finalidades e bases legais',
      content: (
        <>
          <LegalParagraph>
            A tabela abaixo resume os tratamentos centrais e suas bases legais predominantes sob a
            LGPD, sem prejuízo de bases equivalentes sob o GDPR e outras normas aplicáveis.
          </LegalParagraph>
          <LegalTable
            headers={['Tratamento', 'Finalidade', 'Base legal (LGPD art. 7º)']}
            rows={[
              ['Operação da conta e do workspace', 'Criar, autenticar e manter o serviço contratado.', 'Execução de contrato (art. 7º, V)'],
              ['Comunicações transacionais', 'Enviar avisos de segurança, cobrança, acesso e suporte.', 'Legítimo interesse (art. 7º, IX) e execução de contrato'],
              ['Marketing e campanhas', 'Enviar conteúdo promocional, reengajamento e jornadas autorizadas.', 'Consentimento (art. 7º, I)'],
              ['Segurança e antifraude', 'Detectar abuso, vazamento de sessão, chargeback, bot activity e uso indevido.', 'Legítimo interesse (art. 7º, IX)'],
              ['Cumprimento regulatório', 'Manter registros fiscais, financeiros e de auditoria exigidos por lei.', 'Obrigação legal ou regulatória (art. 7º, II)'],
            ]}
          />
        </>
      ),
    },
    {
      id: 'compartilhamento',
      title: '4. Compartilhamento com terceiros',
      content: (
        <>
          <LegalParagraph>
            Compartilhamos dados estritamente com operadores e suboperadores necessários para
            execução do serviço, suporte, observabilidade, pagamento e processamento autorizado.
          </LegalParagraph>
          <LegalTable
            headers={['Terceiro', 'Região', 'Finalidade', 'Base para transferência internacional']}
            rows={[
              ['Railway', 'US/EU', 'Hospedagem de backend, jobs e serviços internos.', 'Cláusulas contratuais padrão e necessidade contratual'],
              ['Vercel', 'US', 'Hospedagem do frontend, edge delivery e assets públicos.', 'Cláusulas contratuais padrão e necessidade contratual'],
              ['Cloudflare R2', 'Global', 'Armazenamento de ativos, uploads e mídia.', 'Cláusulas contratuais padrão e legítimo interesse operacional'],
              ['Resend', 'US', 'Envio de emails transacionais e confirmações.', 'Cláusulas contratuais padrão e execução de contrato'],
              ['Sentry', 'US', 'Monitoramento de erros e observabilidade.', 'Cláusulas contratuais padrão e legítimo interesse de segurança'],
              ['Asaas', 'BR', 'Pagamentos domésticos, boletos, PIX e cobrança nacional.', 'Execução de contrato e obrigação regulatória'],
              ['Stripe', 'US', 'Pagamentos internacionais, antifraude e tokenização.', 'Cláusulas contratuais padrão e execução de contrato'],
              ['OpenAI', 'US', 'Processamento de IA autorizado pelos clientes da plataforma.', 'Cláusulas contratuais padrão e instrução do cliente'],
              ['Anthropic', 'US', 'Processamento de IA autorizado pelos clientes da plataforma.', 'Cláusulas contratuais padrão e instrução do cliente'],
            ]}
          />
          <LegalParagraph>
            Não vendemos dados pessoais. Não compartilhamos dados para publicidade de terceiros
            desconectada do serviço contratado.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'cookies',
      title: '5. Cookies',
      content: (
        <>
          <LegalParagraph>
            Utilizamos cookies e tecnologias equivalentes para autenticação, persistência de sessão,
            preferências essenciais, antifraude e medição operacional. Cookies opcionais ficam
            sujeitos ao consentimento registrado pelo banner de consentimento quando aplicável.
          </LegalParagraph>
          <LegalParagraph>
            Para detalhes adicionais, consulte também nossa política específica de cookies, quando
            disponível, ou fale com o encarregado em{' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'retencao',
      title: '6. Retenção',
      content: (
        <>
          <LegalParagraph>
            Mantemos dados apenas pelo tempo necessário para a finalidade do tratamento, para
            cumprimento contratual e para obrigações legais.
          </LegalParagraph>
          <LegalTable
            headers={['Categoria', 'Prazo padrão', 'Critério']}
            rows={[
              ['Conta e perfil', 'Enquanto a conta permanecer ativa', 'Operação do serviço e suporte'],
              ['Logs de segurança', '6 meses, salvo prazo maior exigido em investigação', 'Marco Civil, segurança e auditoria'],
              ['Registros fiscais e financeiros', '5 anos ou prazo legal aplicável', 'Obrigação fiscal/regulatória'],
              ['Dados de checkout social', '30 dias para recuperação e prevenção a fraude', 'Legítimo interesse e suporte operacional'],
              ['Refresh tokens e sessões revogadas', 'Até expiração técnica ou revogação antecipada', 'Segurança de autenticação'],
              ['Cache de perfil Google estendido', '24 horas por padrão', 'Performance, com exclusão antecipada quando revogado'],
            ]}
          />
        </>
      ),
    },
    {
      id: 'seguranca',
      title: '7. Segurança',
      content: (
        <>
          <LegalList
            items={[
              'Criptografia em trânsito com TLS e criptografia em repouso para bancos e storage compatíveis.',
              'Princípio de menor privilégio, segregação entre tenants e revisão de acesso administrativo.',
              'Registros de auditoria, alerta operacional, tratamento de incidentes e revogação de sessões comprometidas.',
              '2FA opcional e proteção contra brute force, abuso de webhook e uso indevido de credenciais.',
            ]}
          />
          <LegalParagraph>
            Nenhum sistema é absolutamente invulnerável. Se identificarmos incidente relevante com
            risco material aos titulares, adotaremos o fluxo de resposta e comunicação aplicável.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'direitos',
      title: '8. Direitos do titular',
      content: (
        <>
          <LegalParagraph>
            Você pode exercer confirmação de tratamento, acesso, correção, anonimização, bloqueio,
            eliminação, portabilidade, informação sobre compartilhamento, revogação de consentimento
            e oposição quando cabível. A Kloel responde solicitações em até 15 dias, salvo prazo
            diverso justificado por lei.
          </LegalParagraph>
          <LegalList
            items={[
              <>LGPD art. 18: confirmação, acesso, correção, portabilidade, eliminação e revisão.</>,
              <>GDPR arts. 15 a 22: acesso, retificação, apagamento, restrição, portabilidade e oposição.</>,
              <>CCPA/CPRA: right to know, right to delete e right to opt-out of sale/share quando aplicável.</>,
            ]}
          />
          <LegalParagraph>
            Canal oficial de exercício: <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'transferencia-internacional',
      title: '9. Transferência internacional',
      content: (
        <>
          <LegalParagraph>
            Parte da nossa infraestrutura e de nossos suboperadores opera fora do Brasil. Quando
            isso ocorre, adotamos salvaguardas contratuais, técnicas e organizacionais compatíveis
            com o art. 33 da LGPD, inclusive cláusulas padrão, controles de acesso e avaliação de
            necessidade por serviço.
          </LegalParagraph>
          <LegalParagraph>
            Para titulares localizados na UE, tratamos transferências internacionais com base em
            Standard Contractual Clauses ou mecanismo equivalente. Para consumidores da Califórnia,
            respeitamos os direitos de disclosure, deletion e opt-out aplicáveis.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'menores',
      title: '10. Menores',
      content: (
        <LegalParagraph>
          A Kloel não é direcionada a menores de 18 anos. Se identificarmos cadastro ou tratamento
          incompatível com essa limitação, adotaremos bloqueio e exclusão compatíveis com a lei.
        </LegalParagraph>
      ),
    },
    {
      id: 'alteracoes',
      title: '11. Alterações desta política',
      content: (
        <LegalParagraph>
          Podemos atualizar esta política para refletir mudanças legais, regulatórias, operacionais
          ou de produto. Alterações materiais serão comunicadas por email, banner in-app ou aviso
          equivalente antes da entrada em vigor quando exigido.
        </LegalParagraph>
      ),
    },
    {
      id: 'contato-dpo-anpd',
      title: '12. Contato do DPO e ANPD',
      content: (
        <>
          <LegalParagraph>
            Encarregado/DPO: <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
          </LegalParagraph>
          <LegalParagraph>
            Autoridade Nacional de Proteção de Dados (ANPD):{' '}
            <LegalLink href={LEGAL_COMPANY.anpdUrl}>{LEGAL_COMPANY.anpdUrl}</LegalLink>.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'google-api-use',
      title: '13. Uso de informações do Google',
      content: (
        <>
          <LegalParagraph>
            O uso e a transferência de informações recebidas das APIs do Google por Kloel para
            qualquer outro aplicativo aderirá à Política de Dados do Usuário dos Serviços de API do
            Google, incluindo os requisitos de Uso Limitado (Limited Use).
          </LegalParagraph>
          <LegalParagraph>
            Escopos OAuth do Google solicitados:
          </LegalParagraph>
          <LegalTable
            headers={['Escopo', 'Dado acessado', 'Finalidade', 'Armazenamento']}
            rows={[
              ['openid', 'Google account ID', 'Identificar o usuário na Kloel', 'Hash de identificador em banco transacional'],
              ['email', 'Endereço de email', 'Login, comunicação e prevenção de duplicidade de conta', 'Criptografado e com acesso restrito'],
              ['profile', 'Nome, foto e locale', 'Personalização da interface e onboarding', 'Cache operacional com renovação controlada'],
              ['https://www.googleapis.com/auth/user.phonenumbers.read (opcional)', 'Telefone', 'Prefill de checkout mediante consentimento incremental', 'Cache de 24h, feature flag desabilitada por padrão'],
              ['https://www.googleapis.com/auth/user.addresses.read (opcional)', 'Endereço', 'Prefill de checkout mediante consentimento incremental', 'Cache de 24h, feature flag desabilitada por padrão'],
              ['https://www.googleapis.com/auth/user.birthday.read (opcional)', 'Data de nascimento', 'Validação de perfil quando aplicável ao checkout', 'Cache de 24h, feature flag desabilitada por padrão'],
            ]}
          />
          <LegalNote>
            <LegalParagraph>
              Não utilizamos dados das APIs do Google para treinar modelos de IA. Não vendemos dados
              das APIs do Google a terceiros. Não permitimos que humanos leiam dados das APIs do
              Google exceto com consentimento explícito, para operação ou segurança do serviço, ou
              quando exigido por lei.
            </LegalParagraph>
          </LegalNote>
        </>
      ),
    },
    {
      id: 'meta-api-use',
      title: '14. Uso de informações da Meta',
      content: (
        <>
          <LegalParagraph>
            Kloel utiliza APIs da Meta Platforms para operar autenticação, onboarding de canais e
            integrações comerciais oficiais. Usuários podem revogar acesso em{' '}
            <LegalLink href="https://www.facebook.com/settings?tab=business_tools">
              https://www.facebook.com/settings?tab=business_tools
            </LegalLink>{' '}
            ou em <LegalLink href="/data-deletion">kloel.com/data-deletion</LegalLink>.
          </LegalParagraph>
          <LegalTable
            headers={['Permissão', 'Finalidade', 'Dados envolvidos']}
            rows={[
              ['email', 'Autenticação e comunicação da conta Kloel', 'Email do titular'],
              ['public_profile', 'Autenticação e personalização', 'Nome, foto e identificador público'],
              ['pages_show_list', 'Listar páginas elegíveis do cliente', 'IDs e nomes de Pages'],
              ['pages_read_engagement', 'Ler dados operacionais da Page conectada', 'Metadados e métricas autorizadas'],
              ['pages_manage_metadata', 'Configurar webhooks e estado técnico da Page', 'IDs de Page e configuração'],
              ['pages_messaging', 'Responder mensagens do Messenger', 'Mensagens e metadados da conversa'],
              ['instagram_basic', 'Identificar a conta Instagram conectada', 'Username, account ID'],
              ['instagram_manage_messages', 'Receber e responder DMs', 'Mensagens e metadados da conversa'],
              ['instagram_manage_comments', 'Operar comentários autorizados', 'Comentários e referências de mídia'],
              ['instagram_content_publish', 'Publicação autorizada pelo cliente', 'Metadados de mídia e publicação'],
              ['business_management', 'Gerenciar ativos empresariais do cliente', 'Business IDs, WABA IDs, ativos vinculados'],
              ['ads_management', 'Gerenciar fluxos autorizados de marketing', 'Metadados de contas de anúncio'],
              ['ads_read', 'Ler performance autorizada de campanhas', 'Métricas e status de campanhas'],
              ['catalog_management', 'Sincronizar catálogos aprovados', 'Catálogos e itens vinculados'],
              ['whatsapp_business_management', 'Configurar números e ativos WhatsApp', 'WABA, phone number ID, quality rating'],
              ['whatsapp_business_messaging', 'Enviar e receber mensagens WhatsApp', 'Mensagens, status e templates'],
            ]}
          />
          <LegalParagraph>
            Dados recebidos das APIs da Meta são armazenados apenas pelo tempo necessário para
            operação do serviço, segurança, auditoria e cumprimento de obrigações legais.
          </LegalParagraph>
        </>
      ),
    },
  ];
}

function enPrivacySections(): LegalSection[] {
  return [
    {
      id: 'who-we-are',
      title: '1. Who we are',
      content: (
        <>
          <LegalParagraph>
            This Privacy Policy explains how {LEGAL_COMPANY.legalName}, registered under Brazilian
            corporate number CNPJ {LEGAL_COMPANY.cnpj}, acts as data controller for personal data
            processed across kloel.com, auth.kloel.com, app.kloel.com, and related public surfaces.
          </LegalParagraph>
          <LegalParagraph>
            Business address: {addressLabel()}. Data Protection Officer contact:{' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
            {' '}General support:{' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.supportEmail}`}>{LEGAL_COMPANY.supportEmail}</LegalLink>.
          </LegalParagraph>
          <LegalNote>
            <LegalParagraph>
              When Kloel processes end-customer data on behalf of Kloel customers, Kloel acts as a
              processor/operator and the respective customer remains the primary controller for that
              business relationship.
            </LegalParagraph>
          </LegalNote>
        </>
      ),
    },
    {
      id: 'data-we-collect',
      title: '2. Data we collect',
      content: (
        <>
          <LegalParagraph>
            We only collect data necessary for authentication, platform operations, checkout,
            billing, security, support, and authorized commercial automation.
          </LegalParagraph>
          <LegalParagraph>
            <strong>2.1 Data you provide directly.</strong> Name, email, phone number, password or
            magic link identifiers, billing/shipping data, tax information, checkout inputs,
            support content, and materials uploaded into the platform.
          </LegalParagraph>
          <LegalParagraph>
            <strong>2.2 Data collected automatically.</strong> IP address, access logs, session
            identifiers, device/browser metadata, authentication events, essential cookies, usage
            metrics, timestamps, anti-fraud signals, and audit records.
          </LegalParagraph>
          <LegalParagraph>
            <strong>2.3 Data received from third parties.</strong> If you authenticate or connect
            external providers, we may receive:
          </LegalParagraph>
          <LegalList
            items={[
              <>
                <strong>Google.</strong> Name, email address, profile image, and language
                preference through scopes <code>openid</code>, <code>email</code>, and
                <code> profile</code>. In a separate, optional, feature-flagged flow, Kloel may
                request <code>https://www.googleapis.com/auth/user.phonenumbers.read</code>,
                <code> https://www.googleapis.com/auth/user.addresses.read</code>, and
                <code> https://www.googleapis.com/auth/user.birthday.read</code> for checkout
                prefill after separate consent and Google approval.
              </>,
              <>
                <strong>Meta/Facebook.</strong> Name, email, and profile photo via <code>email</code>
                {' '}and <code>public_profile</code>, plus Page, Instagram, WABA, phone number,
                template, and quality metadata required for official Meta integrations.
              </>,
              <>
                <strong>Apple.</strong> Name and email through Sign in with Apple, subject to
                Apple’s disclosure behavior during first authorization.
              </>,
            ]}
          />
          <LegalParagraph>
            <strong>2.4 End-customer data belonging to our customers.</strong> Leads, messages,
            campaign history, order context, and commercial data submitted by Kloel customers. In
            that scenario we process the data under customer instructions and contractual necessity.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'purposes-legal-bases',
      title: '3. Purposes and legal bases',
      content: (
        <>
          <LegalParagraph>
            The table below summarizes our main processing operations and the corresponding legal
            bases under Brazil’s LGPD, with equivalent grounds where GDPR or other regimes apply.
          </LegalParagraph>
          <LegalTable
            headers={['Processing activity', 'Purpose', 'Legal basis']}
            rows={[
              ['Account and workspace operations', 'Create, authenticate, and maintain the contracted service.', 'Contract performance'],
              ['Transactional communications', 'Send security, billing, access, and support notices.', 'Legitimate interest and contract performance'],
              ['Marketing and campaigns', 'Send promotional content and re-engagement journeys.', 'Consent'],
              ['Security and anti-fraud', 'Detect abuse, session compromise, chargebacks, and bot activity.', 'Legitimate interest'],
              ['Regulatory compliance', 'Maintain tax, billing, and audit records required by law.', 'Legal or regulatory obligation'],
            ]}
          />
        </>
      ),
    },
    {
      id: 'sharing',
      title: '4. Sharing with third parties',
      content: (
        <>
          <LegalParagraph>
            We share personal data only with operators and subprocessors required to deliver the
            service, support operations, process payments, monitor health, and execute authorized
            AI or messaging workflows.
          </LegalParagraph>
          <LegalTable
            headers={['Third party', 'Region', 'Purpose', 'Cross-border basis']}
            rows={[
              ['Railway', 'US/EU', 'Backend hosting, workers, and internal services.', 'Standard contractual clauses and contractual necessity'],
              ['Vercel', 'US', 'Frontend hosting, edge delivery, and public assets.', 'Standard contractual clauses and contractual necessity'],
              ['Cloudflare R2', 'Global', 'Asset, upload, and media storage.', 'Standard contractual clauses and operational necessity'],
              ['Resend', 'US', 'Transactional email delivery.', 'Standard contractual clauses and contract performance'],
              ['Sentry', 'US', 'Error monitoring and observability.', 'Standard contractual clauses and security legitimate interest'],
              ['Asaas', 'BR', 'Domestic billing, PIX, boleto, and Brazilian payments.', 'Contract performance and legal compliance'],
              ['Stripe', 'US', 'International billing, tokenization, and anti-fraud.', 'Standard contractual clauses and contract performance'],
              ['OpenAI', 'US', 'Authorized AI processing requested by Kloel customers.', 'Standard contractual clauses and customer instruction'],
              ['Anthropic', 'US', 'Authorized AI processing requested by Kloel customers.', 'Standard contractual clauses and customer instruction'],
            ]}
          />
          <LegalParagraph>
            We do not sell personal data and do not disclose personal data for unrelated third-party
            advertising.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'cookies',
      title: '5. Cookies',
      content: (
        <>
          <LegalParagraph>
            We use cookies and similar technologies for authentication, session persistence,
            essential preferences, anti-fraud, and operational measurement. Optional cookies depend
            on consent where applicable.
          </LegalParagraph>
          <LegalParagraph>
            For more detail, contact{' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'retention',
      title: '6. Retention',
      content: (
        <>
          <LegalParagraph>
            We retain personal data only for as long as necessary to fulfil the relevant purpose,
            contractual duties, and legal retention requirements.
          </LegalParagraph>
          <LegalTable
            headers={['Category', 'Standard period', 'Reason']}
            rows={[
              ['Account and profile', 'While the account remains active', 'Service delivery and support'],
              ['Security logs', '6 months unless a longer period is required for investigation', 'Internet Civil Framework, security, and audit'],
              ['Tax and financial records', '5 years or longer if legally required', 'Tax and regulatory obligation'],
              ['Checkout social lead data', '30 days for recovery and fraud prevention', 'Legitimate interest and operational support'],
              ['Revoked refresh tokens and sessions', 'Until technical expiry or earlier purge', 'Authentication security'],
              ['Extended Google profile cache', '24 hours by default', 'Performance, with early deletion after revocation'],
            ]}
          />
        </>
      ),
    },
    {
      id: 'security',
      title: '7. Security',
      content: (
        <>
          <LegalList
            items={[
              'Encryption in transit using TLS and encryption at rest where supported by our databases and storage providers.',
              'Least-privilege access, tenant segregation, and restricted administrative access.',
              'Audit logs, operational alerting, incident handling, and compromised session revocation.',
              'Optional MFA and protections against brute force, webhook abuse, and credential misuse.',
            ]}
          />
          <LegalParagraph>
            No environment is completely immune from risk. If we identify a relevant incident with
            material impact on data subjects, we follow the applicable notification path.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'rights',
      title: '8. Data subject rights',
      content: (
        <>
          <LegalParagraph>
            You may request confirmation, access, correction, anonymization, blocking, deletion,
            portability, information about sharing, withdrawal of consent, and objection where
            legally applicable. Kloel responds within 15 days unless a different legal timeline
            applies.
          </LegalParagraph>
          <LegalList
            items={[
              'LGPD article 18 rights.',
              'GDPR articles 15 to 22 rights, including access, rectification, erasure, restriction, portability, and objection.',
              'CCPA/CPRA rights to know, delete, and opt-out where applicable.',
            ]}
          />
          <LegalParagraph>
            Official request channel:{' '}
            <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'international-transfers',
      title: '9. International transfers',
      content: (
        <>
          <LegalParagraph>
            Some infrastructure and subprocessors operate outside Brazil. Where that happens, we
            rely on contractual, technical, and organizational safeguards compatible with LGPD
            article 33, including standard contractual clauses, access controls, and necessity
            assessments.
          </LegalParagraph>
          <LegalParagraph>
            For EU data subjects, international transfers rely on Standard Contractual Clauses or an
            equivalent safeguard. For California consumers, we honor the applicable disclosure,
            deletion, and opt-out rights.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'children',
      title: '10. Children',
      content: (
        <LegalParagraph>
          Kloel is not directed to children under 18. If we become aware of incompatible use, we
          will suspend or delete the data as required by law.
        </LegalParagraph>
      ),
    },
    {
      id: 'changes',
      title: '11. Changes to this policy',
      content: (
        <LegalParagraph>
          We may update this policy to reflect legal, regulatory, operational, or product changes.
          Material changes will be communicated by email, in-product banner, or equivalent notice
          before they take effect when legally required.
        </LegalParagraph>
      ),
    },
    {
      id: 'dpo-contact',
      title: '12. DPO and authority contact',
      content: (
        <>
          <LegalParagraph>
            DPO contact: <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}`}>{LEGAL_COMPANY.dpoEmail}</LegalLink>.
          </LegalParagraph>
          <LegalParagraph>
            Brazilian data protection authority:{' '}
            <LegalLink href={LEGAL_COMPANY.anpdUrl}>{LEGAL_COMPANY.anpdUrl}</LegalLink>.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'google-api-services',
      title: '13. Use of Google information',
      content: (
        <>
          <LegalParagraph>
            Kloel’s use and transfer of information received from Google APIs to any other app will
            adhere to the Google API Services User Data Policy, including the Limited Use
            requirements.
          </LegalParagraph>
          <LegalParagraph>Google OAuth scopes requested:</LegalParagraph>
          <LegalTable
            headers={['Scope', 'Data accessed', 'Purpose', 'Storage']}
            rows={[
              ['openid', 'Google account ID', 'Identify the Kloel user', 'Hashed identifier in transactional storage'],
              ['email', 'Email address', 'Login, communication, and duplicate-account prevention', 'Encrypted with restricted access'],
              ['profile', 'Name, profile image, locale', 'UI personalization and onboarding', 'Operational cache with controlled refresh'],
              ['https://www.googleapis.com/auth/user.phonenumbers.read (optional)', 'Phone number', 'Checkout prefill after separate consent', '24-hour cache, disabled by feature flag by default'],
              ['https://www.googleapis.com/auth/user.addresses.read (optional)', 'Address', 'Checkout prefill after separate consent', '24-hour cache, disabled by feature flag by default'],
              ['https://www.googleapis.com/auth/user.birthday.read (optional)', 'Birthday', 'Profile validation where required by checkout', '24-hour cache, disabled by feature flag by default'],
            ]}
          />
          <LegalNote>
            <LegalParagraph>
              We do not use Google API data to train AI models. We do not sell Google API data to
              third parties. We do not allow humans to read Google API data except with explicit
              user consent, for security or operational purposes, or when required by law.
            </LegalParagraph>
          </LegalNote>
        </>
      ),
    },
    {
      id: 'meta-information-use',
      title: '14. Use of Meta information',
      content: (
        <>
          <LegalParagraph>
            Kloel uses Meta Platforms APIs for authentication, channel onboarding, and official
            commercial integrations. Users can revoke access at{' '}
            <LegalLink href="https://www.facebook.com/settings?tab=business_tools">
              https://www.facebook.com/settings?tab=business_tools
            </LegalLink>{' '}
            or through <LegalLink href="/data-deletion">kloel.com/data-deletion</LegalLink>.
          </LegalParagraph>
          <LegalTable
            headers={['Permission', 'Purpose', 'Data involved']}
            rows={[
              ['email', 'Account authentication and communication', 'User email'],
              ['public_profile', 'Authentication and personalization', 'Name, avatar, public identifier'],
              ['pages_show_list', 'List eligible Pages', 'Page IDs and names'],
              ['pages_read_engagement', 'Read authorized Page metadata', 'Operational metadata and engagement signals'],
              ['pages_manage_metadata', 'Configure webhooks and page technical state', 'Page configuration metadata'],
              ['pages_messaging', 'Send and receive Messenger conversations', 'Messages and conversation metadata'],
              ['instagram_basic', 'Identify connected Instagram accounts', 'Username and account ID'],
              ['instagram_manage_messages', 'Receive and reply to DMs', 'Messages and conversation metadata'],
              ['instagram_manage_comments', 'Operate comments when authorized', 'Comments and media references'],
              ['instagram_content_publish', 'Publish content when authorized by the customer', 'Media and publishing metadata'],
              ['business_management', 'Manage customer business assets', 'Business IDs, WABA IDs, linked assets'],
              ['ads_management', 'Operate authorized marketing flows', 'Ad account metadata'],
              ['ads_read', 'Read authorized ad performance', 'Campaign metrics and status'],
              ['catalog_management', 'Sync approved catalogs', 'Catalogs and linked items'],
              ['whatsapp_business_management', 'Configure WhatsApp business assets', 'WABA, phone number IDs, quality rating'],
              ['whatsapp_business_messaging', 'Send and receive WhatsApp messages', 'Messages, templates, delivery status'],
            ]}
          />
          <LegalParagraph>
            Data obtained from Meta APIs is stored only for as long as necessary to operate the
            service, maintain security, preserve audit evidence, and comply with legal obligations.
          </LegalParagraph>
        </>
      ),
    },
  ];
}

function ptTermsSections(): LegalSection[] {
  return [
    {
      id: 'aceitacao',
      title: '1. Aceitação',
      content: (
        <LegalParagraph>
          Ao acessar ou utilizar a Kloel, você concorda com estes Termos de Serviço e com as
          políticas incorporadas por referência, incluindo Política de Privacidade, regras de uso
          aceitável e termos dos provedores integrados.
        </LegalParagraph>
      ),
    },
    {
      id: 'descricao',
      title: '2. Descrição do serviço',
      content: (
        <LegalParagraph>
          A Kloel é uma plataforma SaaS de marketing e operação comercial assistida por IA,
          incluindo autenticação, CRM, inbox, campanhas, checkout, automação de mensagens, integrações
          Meta, analytics, billing e componentes complementares disponibilizados ao cliente.
        </LegalParagraph>
      ),
    },
    {
      id: 'elegibilidade',
      title: '3. Elegibilidade',
      content: (
        <LegalParagraph>
          Você declara possuir pelo menos 18 anos, capacidade civil plena e autorização para
          contratar em nome próprio ou da pessoa jurídica representada.
        </LegalParagraph>
      ),
    },
    {
      id: 'conta-seguranca',
      title: '4. Conta e segurança',
      content: (
        <>
          <LegalParagraph>
            Você é responsável por manter credenciais, dispositivos e acessos sob sigilo, revisar
            permissões internas e nos notificar imediatamente sobre uso indevido, comprometimento de
            sessão, perda de dispositivo ou revogação de integrações.
          </LegalParagraph>
          <LegalParagraph>
            A Kloel poderá suspender sessões, exigir reautenticação, ou revogar tokens quando
            houver indício razoável de fraude, abuso, incidente de segurança ou violação destes termos.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'planos-cobranca',
      title: '5. Planos, cobrança, renovação, cancelamento e reembolso',
      content: (
        <>
          <LegalParagraph>
            Os planos podem ser mensais, anuais ou customizados, com cobrança recorrente ou por uso.
            Valores, limites e funcionalidades aplicáveis são informados na contratação ou no painel
            administrativo correspondente.
          </LegalParagraph>
          <LegalParagraph>
            Cancelamentos interrompem renovações futuras, mas não geram restituição automática de
            períodos já faturados, salvo quando exigido por lei, previsto em política comercial
            específica ou aprovado expressamente pela Kloel.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'uso-aceitavel',
      title: '6. Uso aceitável',
      content: (
        <LegalList
          items={[
            'Enviar spam, scraping abusivo, campanhas sem base legal ou mensagens fora das regras do canal.',
            'Praticar engenharia reversa, contornar rate limits, ou tentar acessar tenants de terceiros.',
            'Usar a plataforma para fraude, phishing, malware, conteúdo ilícito ou violação de direitos autorais.',
            'Violar a WhatsApp Commerce Policy, Meta Platform Terms, Google API policies ou regras equivalentes de terceiros.',
            'Inserir tokens, credenciais ou dados de terceiros sem autorização válida.',
          ]}
        />
      ),
    },
    {
      id: 'conteudo-usuario',
      title: '7. Conteúdo do usuário',
      content: (
        <LegalParagraph>
          Você permanece titular do conteúdo enviado à plataforma. Ao utilizar a Kloel, concede
          licença limitada, não exclusiva e revogável na medida necessária para hospedar, processar,
          exibir, transmitir e analisar esse conteúdo com a finalidade de operar o serviço contratado.
        </LegalParagraph>
      ),
    },
    {
      id: 'propriedade-intelectual',
      title: '8. Propriedade intelectual da Kloel',
      content: (
        <LegalParagraph>
          Código-fonte, marcas, identidade visual, fluxos, documentação, interfaces, modelos,
          componentes e materiais próprios da Kloel permanecem de titularidade exclusiva da
          {LEGAL_COMPANY.legalName}, salvo disposição expressa em contrário.
        </LegalParagraph>
      ),
    },
    {
      id: 'apis-terceiros',
      title: '9. APIs de terceiros',
      content: (
        <LegalParagraph>
          O uso de integrações como Meta, Google, Apple, OpenAI, Anthropic, Asaas e Stripe depende
          de disponibilidade, aprovação, políticas e limites estabelecidos por esses provedores. Ao
          conectar tais serviços, você concorda em cumprir os termos e políticas respectivos.
        </LegalParagraph>
      ),
    },
    {
      id: 'limitacao-responsabilidade',
      title: '10. Limitação de responsabilidade',
      content: (
        <LegalParagraph>
          Na máxima extensão permitida pela lei, a Kloel não responde por lucros cessantes, danos
          indiretos, perda de oportunidade, indisponibilidade temporária de integrações de terceiros,
          bloqueios aplicados por canais externos ou decisões comerciais tomadas pelo cliente com
          base no uso da plataforma.
        </LegalParagraph>
      ),
    },
    {
      id: 'indenizacao',
      title: '11. Indenização',
      content: (
        <LegalParagraph>
          Você concorda em indenizar a Kloel por prejuízos, custos, reclamações e despesas
          decorrentes de uso ilícito da plataforma, violação destes termos, infração a direitos de
          terceiros ou descumprimento das políticas dos canais conectados.
        </LegalParagraph>
      ),
    },
    {
      id: 'modificacoes',
      title: '12. Modificações nos termos',
      content: (
        <LegalParagraph>
          A Kloel pode atualizar estes termos para refletir mudanças legais, operacionais, técnicas
          ou comerciais. Quando a alteração for material, informaremos por meio razoável antes da
          vigência, observadas as exigências legais aplicáveis.
        </LegalParagraph>
      ),
    },
    {
      id: 'rescisao',
      title: '13. Rescisão',
      content: (
        <LegalParagraph>
          Podemos suspender ou encerrar acesso ao serviço em caso de inadimplência, fraude, uso
          abusivo, risco de segurança, ordem legal ou violação destes termos. O cliente pode encerrar
          a conta a qualquer momento, sem prejuízo de obrigações pendentes.
        </LegalParagraph>
      ),
    },
    {
      id: 'lei-aplicavel',
      title: '14. Lei aplicável e foro',
      content: (
        <LegalParagraph>
          Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro
          da comarca de Goiânia/GO para dirimir controvérsias decorrentes deste instrumento, salvo
          competência legal obrigatória diversa.
        </LegalParagraph>
      ),
    },
    {
      id: 'contato',
      title: '15. Contato',
      content: (
        <LegalParagraph>
          Dúvidas jurídicas, contratuais ou operacionais podem ser enviadas para{' '}
          <LegalLink href={`mailto:${LEGAL_COMPANY.supportEmail}`}>{LEGAL_COMPANY.supportEmail}</LegalLink>.
        </LegalParagraph>
      ),
    },
  ];
}

function enTermsSections(): LegalSection[] {
  return [
    {
      id: 'acceptance',
      title: '1. Acceptance',
      content: (
        <LegalParagraph>
          By accessing or using Kloel, you agree to these Terms of Service and the policies
          incorporated by reference, including the Privacy Policy, acceptable use rules, and the
          terms of integrated third-party providers.
        </LegalParagraph>
      ),
    },
    {
      id: 'service-description',
      title: '2. Service description',
      content: (
        <LegalParagraph>
          Kloel is a SaaS platform for AI-assisted marketing and commercial operations, including
          authentication, CRM, inbox, campaigns, checkout, messaging automation, Meta integrations,
          analytics, billing, and related product components made available to customers.
        </LegalParagraph>
      ),
    },
    {
      id: 'eligibility',
      title: '3. Eligibility',
      content: (
        <LegalParagraph>
          You represent that you are at least 18 years old, have full legal capacity, and are
          authorized to contract on your own behalf or on behalf of the legal entity you represent.
        </LegalParagraph>
      ),
    },
    {
      id: 'account-security',
      title: '4. Account and security',
      content: (
        <>
          <LegalParagraph>
            You are responsible for maintaining the confidentiality of credentials, devices, and
            access rights, reviewing internal permissions, and promptly notifying Kloel of misuse,
            session compromise, device loss, or revoked integrations.
          </LegalParagraph>
          <LegalParagraph>
            Kloel may suspend sessions, require re-authentication, or revoke tokens if there is a
            reasonable indication of fraud, abuse, security incident, or breach of these terms.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'billing',
      title: '5. Plans, billing, renewals, cancellation, and refunds',
      content: (
        <>
          <LegalParagraph>
            Plans may be monthly, annual, custom, recurring, or usage-based. Pricing, limits, and
            applicable features are disclosed during contracting or inside the relevant admin surface.
          </LegalParagraph>
          <LegalParagraph>
            Cancellation stops future renewals but does not automatically create a refund for
            already-billed periods unless required by law, stated in a specific commercial policy,
            or expressly approved by Kloel.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'acceptable-use',
      title: '6. Acceptable use',
      content: (
        <LegalList
          items={[
            'Sending spam, abusive scraping, campaigns without a valid legal basis, or messages outside channel rules.',
            'Reverse engineering, bypassing rate limits, or attempting to access other tenants.',
            'Using the platform for fraud, phishing, malware, illegal content, or copyright infringement.',
            'Violating the WhatsApp Commerce Policy, Meta Platform Terms, Google API policies, or equivalent third-party rules.',
            'Submitting third-party tokens, credentials, or data without valid authorization.',
          ]}
        />
      ),
    },
    {
      id: 'user-content',
      title: '7. User content',
      content: (
        <LegalParagraph>
          You remain the owner of the content submitted to the platform. By using Kloel, you grant
          a limited, non-exclusive, revocable license to host, process, display, transmit, and
          analyze that content strictly as needed to operate the contracted service.
        </LegalParagraph>
      ),
    },
    {
      id: 'ip',
      title: '8. Kloel intellectual property',
      content: (
        <LegalParagraph>
          Source code, trademarks, visual identity, flows, documentation, interfaces, models,
          components, and proprietary materials remain the exclusive property of {LEGAL_COMPANY.legalName}
          {' '}unless expressly agreed otherwise in writing.
        </LegalParagraph>
      ),
    },
    {
      id: 'third-party-apis',
      title: '9. Third-party APIs',
      content: (
        <LegalParagraph>
          Integrations such as Meta, Google, Apple, OpenAI, Anthropic, Asaas, and Stripe depend on
          provider availability, approval, policies, and rate limits. By connecting them, you agree
          to comply with the corresponding provider terms and rules.
        </LegalParagraph>
      ),
    },
    {
      id: 'liability',
      title: '10. Limitation of liability',
      content: (
        <LegalParagraph>
          To the maximum extent permitted by law, Kloel is not liable for indirect damages, lost
          profits, loss of opportunity, temporary unavailability of third-party integrations,
          sanctions imposed by external channels, or business decisions made by customers based on
          platform use.
        </LegalParagraph>
      ),
    },
    {
      id: 'indemnity',
      title: '11. Indemnity',
      content: (
        <LegalParagraph>
          You agree to indemnify Kloel for losses, costs, claims, and expenses arising from unlawful
          platform use, breach of these terms, infringement of third-party rights, or non-compliance
          with connected channel policies.
        </LegalParagraph>
      ),
    },
    {
      id: 'term-changes',
      title: '12. Changes to the terms',
      content: (
        <LegalParagraph>
          Kloel may update these terms to reflect legal, operational, technical, or commercial
          changes. Where a change is material, we will provide reasonable notice before it becomes
          effective, subject to applicable law.
        </LegalParagraph>
      ),
    },
    {
      id: 'termination',
      title: '13. Termination',
      content: (
        <LegalParagraph>
          We may suspend or terminate access in cases of non-payment, fraud, abusive use, security
          risk, legal order, or breach of these terms. Customers may terminate their account at any
          time, subject to outstanding obligations.
        </LegalParagraph>
      ),
    },
    {
      id: 'governing-law',
      title: '14. Governing law and venue',
      content: (
        <LegalParagraph>
          These terms are governed by the laws of the Federative Republic of Brazil. The courts of
          Goiânia, State of Goiás, Brazil, shall have jurisdiction over disputes arising from these
          terms, except where mandatory law requires otherwise.
        </LegalParagraph>
      ),
    },
    {
      id: 'contact',
      title: '15. Contact',
      content: (
        <LegalParagraph>
          Legal, contractual, or operational questions may be sent to{' '}
          <LegalLink href={`mailto:${LEGAL_COMPANY.supportEmail}`}>{LEGAL_COMPANY.supportEmail}</LegalLink>.
        </LegalParagraph>
      ),
    },
  ];
}

function ptDeletionSections(): LegalSection[] {
  return [
    {
      id: 'como-funciona',
      title: '1. Como funciona a exclusão',
      content: (
        <>
          <LegalParagraph>
            Quando recebemos uma solicitação válida de exclusão, registramos o pedido, revogamos
            sessões e integrações quando necessário, iniciamos o fluxo de remoção ou anonimização e
            preservamos apenas o que a lei exige manter.
          </LegalParagraph>
          <LegalParagraph>
            O prazo operacional alvo é de até 30 dias corridos a partir da validação do pedido.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'autoatendimento',
      title: '2. Autoatendimento na Kloel',
      content: (
        <LegalParagraph>
          Usuários autenticados podem iniciar a exclusão em app.kloel.com, em Configurações →
          Privacidade → Excluir conta. Esse fluxo invalida sessões e gera um registro rastreável da
          solicitação.
        </LegalParagraph>
      ),
    },
    {
      id: 'facebook',
      title: '3. Exclusão via Facebook',
      content: (
        <LegalParagraph>
          Se você remove a Kloel dos aplicativos conectados do Facebook, o Meta envia um callback
          assinado para a Kloel. A partir desse evento, registramos o pedido, retornamos um código
          de confirmação e executamos o fluxo de exclusão compatível com a solicitação.
        </LegalParagraph>
      ),
    },
    {
      id: 'email',
      title: '4. Solicitação por email',
      content: (
        <LegalParagraph>
          Você também pode enviar um email para{' '}
          <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o`}>
            {LEGAL_COMPANY.dpoEmail}
          </LegalLink>{' '}
          com o assunto “Solicitação de exclusão”. Podemos pedir validação adicional para confirmar
          a identidade do titular antes de concluir a ação.
        </LegalParagraph>
      ),
    },
    {
      id: 'o-que-e-excluido',
      title: '5. O que é excluído e o que pode ser retido',
      content: (
        <>
          <LegalParagraph>
            Excluímos ou anonimizamos perfil, credenciais sociais, tokens, dados operacionais da
            conta e demais informações que não precisem ser mantidas por obrigação legal.
          </LegalParagraph>
          <LegalList
            items={[
              'Podem permanecer retidos: notas fiscais, comprovantes contábeis e trilhas mínimas de auditoria.',
              'Logs de segurança podem ser mantidos por 6 meses ou pelo prazo necessário à investigação.',
              'Dados estritamente exigidos por autoridades competentes serão preservados pelo período legal aplicável.',
            ]}
          />
        </>
      ),
    },
  ];
}

function enDeletionSections(): LegalSection[] {
  return [
    {
      id: 'how-it-works',
      title: '1. How deletion works',
      content: (
        <>
          <LegalParagraph>
            Once we receive a valid deletion request, we log the request, revoke sessions and
            integrations where needed, start the deletion or anonymization workflow, and retain only
            what the law requires us to preserve.
          </LegalParagraph>
          <LegalParagraph>
            Our target operational deadline is up to 30 calendar days from request validation.
          </LegalParagraph>
        </>
      ),
    },
    {
      id: 'self-service',
      title: '2. Self-service inside Kloel',
      content: (
        <LegalParagraph>
          Authenticated users can initiate deletion from app.kloel.com under Settings → Privacy →
          Delete account. That flow invalidates active sessions and creates a traceable deletion record.
        </LegalParagraph>
      ),
    },
    {
      id: 'facebook-route',
      title: '3. Deletion through Facebook',
      content: (
        <LegalParagraph>
          If you remove Kloel from your connected Facebook apps, Meta sends a signed callback to
          Kloel. We log the request, return a confirmation code, and execute the deletion workflow
          associated with that event.
        </LegalParagraph>
      ),
    },
    {
      id: 'email-route',
      title: '4. Email request',
      content: (
        <LegalParagraph>
          You may also send an email to{' '}
          <LegalLink href={`mailto:${LEGAL_COMPANY.dpoEmail}?subject=Data%20deletion%20request`}>
            {LEGAL_COMPANY.dpoEmail}
          </LegalLink>{' '}
          with the subject “Data deletion request”. We may ask for additional validation to verify
          the requester’s identity before completing the action.
        </LegalParagraph>
      ),
    },
    {
      id: 'deleted-vs-retained',
      title: '5. What is deleted and what may be retained',
      content: (
        <>
          <LegalParagraph>
            We delete or anonymize profile data, social credentials, tokens, account operational
            records, and any information that does not need to be retained under law.
          </LegalParagraph>
          <LegalList
            items={[
              'We may retain invoices, accounting evidence, and minimum audit trails required by law.',
              'Security logs may be retained for 6 months or longer if needed for investigation.',
              'Data required by competent authorities will be preserved for the legally applicable period.',
            ]}
          />
        </>
      ),
    },
  ];
}

export function getPrivacyDocument(locale: 'pt' | 'en'): LegalDocumentDefinition {
  const isPt = locale === 'pt';

  return {
    title: isPt ? 'Política de Privacidade' : 'Privacy Policy',
    description: isPt
      ? 'Como a Kloel coleta, usa, compartilha, retém e protege dados pessoais em conformidade com LGPD, GDPR, CCPA, Google API Services User Data Policy e Meta Platform Terms.'
      : 'How Kloel collects, uses, shares, retains, and protects personal data under LGPD, GDPR, CCPA, the Google API Services User Data Policy, and the Meta Platform Terms.',
    eyebrow: isPt ? 'Compliance • Privacidade • Dados pessoais' : 'Compliance • Privacy • Personal data',
    languageLabel: isPt ? 'Português (Brasil)' : 'English',
    lastUpdatedLabel: isPt ? 'Última atualização' : 'Last updated',
    lastUpdatedValue: formatLegalDate(isPt ? 'pt-BR' : 'en-US'),
    versionHref: isPt ? '/privacy/en' : '/privacy',
    versionLabel: isPt ? 'Version in English' : 'Versão em português',
    sections: isPt ? ptPrivacySections() : enPrivacySections(),
    structuredData: buildStructuredData(
      'PrivacyPolicy',
      isPt ? 'Política de Privacidade Kloel' : 'Kloel Privacy Policy',
      isPt ? '/privacy' : '/privacy/en',
      isPt ? 'pt-BR' : 'en-US',
    ),
  };
}

export function getTermsDocument(locale: 'pt' | 'en'): LegalDocumentDefinition {
  const isPt = locale === 'pt';

  return {
    title: isPt ? 'Termos de Serviço' : 'Terms of Service',
    description: isPt
      ? 'Regras contratuais de uso da Kloel, incluindo elegibilidade, cobrança, uso aceitável, integrações de terceiros e foro aplicável.'
      : 'Kloel contractual terms covering eligibility, billing, acceptable use, third-party integrations, and governing venue.',
    eyebrow: isPt ? 'Contrato • Plataforma • Uso aceitável' : 'Contract • Platform • Acceptable use',
    languageLabel: isPt ? 'Português (Brasil)' : 'English',
    lastUpdatedLabel: isPt ? 'Última atualização' : 'Last updated',
    lastUpdatedValue: formatLegalDate(isPt ? 'pt-BR' : 'en-US'),
    versionHref: isPt ? '/terms/en' : '/terms',
    versionLabel: isPt ? 'Version in English' : 'Versão em português',
    sections: isPt ? ptTermsSections() : enTermsSections(),
    structuredData: buildStructuredData(
      'TermsOfService',
      isPt ? 'Termos de Serviço Kloel' : 'Kloel Terms of Service',
      isPt ? '/terms' : '/terms/en',
      isPt ? 'pt-BR' : 'en-US',
    ),
  };
}

export function getDataDeletionDocument(locale: 'pt' | 'en'): LegalDocumentDefinition {
  const isPt = locale === 'pt';

  return {
    title: isPt ? 'Exclusão de Dados' : 'Data Deletion',
    description: isPt
      ? 'Como solicitar exclusão de dados na Kloel, inclusive por autoatendimento, Facebook e email, com prazos e retenções legais.'
      : 'How to request data deletion in Kloel through self-service, Facebook, or email, including timelines and legal retention.',
    eyebrow: isPt ? 'Privacidade • Exclusão • Direitos do titular' : 'Privacy • Deletion • Data subject rights',
    languageLabel: isPt ? 'Português (Brasil)' : 'English',
    lastUpdatedLabel: isPt ? 'Última atualização' : 'Last updated',
    lastUpdatedValue: formatLegalDate(isPt ? 'pt-BR' : 'en-US'),
    versionHref: isPt ? '/data-deletion/en' : '/data-deletion',
    versionLabel: isPt ? 'Version in English' : 'Versão em português',
    sections: isPt ? ptDeletionSections() : enDeletionSections(),
    structuredData: buildStructuredData(
      'WebPage',
      isPt ? 'Exclusão de Dados Kloel' : 'Kloel Data Deletion',
      isPt ? '/data-deletion' : '/data-deletion/en',
      isPt ? 'pt-BR' : 'en-US',
    ),
  };
}

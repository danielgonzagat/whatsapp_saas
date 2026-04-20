import { kloelT } from '@/lib/i18n/t';
import {
  LegalDocument,
  LegalList,
  LegalSection,
  LegalTable,
} from '@/components/kloel/legal/legal-document';
import {
  buildLegalMetadata,
  formatLastUpdated,
  legalConstants,
  legalContentTables,
} from '@/lib/legal-constants';

/** Metadata. */
export const metadata = buildLegalMetadata({
  title: 'Política de Privacidade | Kloel',
  description:
    'Política de Privacidade da Kloel Tecnologia LTDA com LGPD, GDPR, CCPA, Google API Services User Data Policy e Meta Platform Terms.',
  path: '/privacy',
  locale: 'pt_BR',
});

const toc = [
  { id: 'quem-somos', label: '1. Quem somos' },
  { id: 'dados-coletados', label: '2. Dados que coletamos' },
  { id: 'finalidades-bases', label: '3. Finalidades e bases legais' },
  { id: 'compartilhamento', label: '4. Compartilhamento com terceiros' },
  { id: 'cookies', label: '5. Cookies' },
  { id: 'retencao', label: '6. Retenção' },
  { id: 'seguranca', label: '7. Segurança' },
  { id: 'direitos', label: '8. Direitos do titular' },
  { id: 'transferencia', label: '9. Transferência internacional' },
  { id: 'menores', label: '10. Menores de idade' },
  { id: 'alteracoes', label: '11. Alterações desta política' },
  { id: 'contato', label: '12. Contato, ANPD e canais de privacidade' },
  { id: 'google-use', label: '13. Uso de informações do Google' },
  { id: 'meta-use', label: '14. Uso de informações da Meta' },
];

/** Privacy page. */
export default function PrivacyPage() {
  const company = legalConstants.company;

  return (
    <LegalDocument
      title={kloelT(`Política de Privacidade`)}
      description={kloelT(`Este documento descreve como a Kloel Tecnologia LTDA coleta, utiliza, compartilha, protege e elimina dados pessoais de clientes, leads, visitantes e pessoas autenticadas em nossos produtos.`)}
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'pt-BR')}
      alternateHref="/privacy/en"
      alternateLabel={kloelT(`English version`)}
      toc={toc}
      schemaType={kloelT(`PrivacyPolicy`)}
      path="/privacy"
      inLanguage={kloelT(`pt-BR`)}
    >
      <LegalSection id="quem-somos" title={kloelT(`1. Quem somos`)}>
        <p>
          
          {kloelT(`A controladora dos dados pessoais tratados nesta política é`)}{' '}
          <strong>{company.legalName}</strong>{kloelT(`, nome fantasia`)} <strong>{company.tradeName}</strong>{kloelT(`,
          inscrita no CNPJ sob o nº`)} <strong>{company.cnpj}</strong>{kloelT(`, com endereço em`)}{' '}
          {company.addressLine1}, {company.addressLine2}.
        </p>
        <p>
          
          {kloelT(`Para assuntos de privacidade, direitos do titular, revogação de consentimento, revogação
          de integrações e solicitações de exclusão, nosso canal principal é`)}{' '}
          <strong>{company.emailDpo}</strong>{kloelT(`. Para suporte operacional, usamos`)}{' '}
          <strong>{company.emailSupport}</strong>.
        </p>
        <p>
          
          {kloelT(`A Kloel opera como`)} <strong>controladora</strong>  {kloelT(`em relação aos dados da sua própria
          conta, autenticação, faturamento e uso da plataforma. Para dados de clientes finais
          processados em nome dos nossos clientes, a Kloel normalmente atua como`)}{' '}
          <strong>{kloelT(`operadora/processadora`)}</strong>{kloelT(`, seguindo instruções contratuais do
          cliente-controlador.`)}
        </p>
      </LegalSection>

      <LegalSection id="dados-coletados" title={kloelT(`2. Dados que coletamos`)}>
        <p>
          
          {kloelT(`Coletamos dados pessoais e dados operacionais em diferentes contextos. Sempre buscamos
          limitar a coleta ao mínimo necessário para operação do serviço, segurança, prevenção à
          fraude, cumprimento legal e melhoria controlada do produto.`)}
        </p>
        <p>
          <strong>{kloelT(`2.1 Dados fornecidos diretamente.`)}</strong>  {kloelT(`Quando você cria uma conta, assina um
          plano, preenche um checkout, solicita suporte ou envia conteúdo para a plataforma, podemos
          coletar nome, email, telefone, senha ou prova de identidade, empresa, dados de cobrança,
          endereço, dados do pedido, mensagens, arquivos e preferências informadas manualmente.`)}
        </p>
        <p>
          <strong>{kloelT(`2.2 Dados coletados automaticamente.`)}</strong>  {kloelT(`Ao acessar nossos sites, checkouts e
          aplicações, coletamos logs, carimbos de data e hora, endereços IP, user-agent, device
          identifiers, cookies, informações de sessão, eventos de segurança, dados de performance e
          indicadores antifraude.`)}
        </p>
        <p>
          <strong>{kloelT(`2.3 Dados recebidos de terceiros.`)}</strong>  {kloelT(`Em fluxos de autenticação e integração,
          recebemos dados diretamente dos provedores autorizados por você:`)}
        </p>
        <LegalList
          items={[
            <>
              <strong>{kloelT(`Google.`)}</strong>  {kloelT(`Nome, email, foto de perfil, identificador da Conta Google e
              preferência de idioma via escopos`)} <code>openid</code>, <code>email</code> e{' '}
              <code>profile</code>{kloelT(`. Quando a funcionalidade estiver aprovada e habilitada por
              feature flag, a Kloel poderá solicitar separadamente`)}{' '}
              <code>{kloelT(`user.phonenumbers.read`)}</code> e <code>{kloelT(`user.addresses.read`)}</code>  {kloelT(`para
              preenchimento acelerado de checkout.`)}
            </>,
            <>
              <strong>{kloelT(`Meta/Facebook.`)}</strong>  {kloelT(`Nome, email, foto de perfil e identificador do usuário
              via permissões`)} <code>email</code> e <code>public_profile</code>  {kloelT(`para autenticação. Em
              contas de clientes da Kloel, também podemos receber ativos e identificadores de
              negócios, Pages, Instagram e WhatsApp conforme as permissões empresariais concedidas.`)}
            </>,
            <>
              <strong>{kloelT(`Apple.`)}</strong>  {kloelT(`Nome e email via Sign in with Apple, quando esse provedor
              estiver ativado no ambiente.`)}
            </>,
          ]}
        />
        <p>
          <strong>{kloelT(`2.4 Dados de clientes finais dos nossos clientes.`)}</strong>  {kloelT(`Leads, contatos,
          conversas, dados de funil, compras, tags, histórico de atendimento e dados de campanha
          podem ser processados dentro da plataforma. Nesses cenários, o cliente da Kloel define a
          finalidade primária e a base legal do tratamento, e a Kloel atua como
          operadora/processadora.`)}
        </p>
      </LegalSection>

      <LegalSection id="finalidades-bases" title={kloelT(`3. Finalidades e bases legais`)}>
        <p>
          
          {kloelT(`Tratamos dados pessoais para autenticação, onboarding, operação do workspace, faturamento,
          segurança, suporte, prevenção à fraude, analytics do produto, comunicação transacional,
          marketing opcional e cumprimento de obrigações legais.`)}
        </p>
        <LegalTable
          headers={['Tratamento', 'Finalidade', 'Base legal']}
          rows={legalContentTables.legalBases}
        />
      </LegalSection>

      <LegalSection id="compartilhamento" title={kloelT(`4. Compartilhamento com terceiros`)}>
        <p>
          
          {kloelT(`Compartilhamos dados apenas com operadores, suboperadores e provedores estritamente
          necessários para entregar a plataforma, processar pagamentos, enviar comunicações,
          monitorar segurança e executar integrações autorizadas por você.`)}
        </p>
        <LegalTable
          headers={['Terceiro', 'Finalidade', 'Região', 'Base da transferência']}
          rows={legalContentTables.thirdParties}
        />
        <p>
          
          {kloelT(`Também podemos compartilhar dados com autoridades públicas, judiciárias ou regulatórias
          quando houver obrigação legal, ordem judicial ou necessidade de defesa de direitos. A
          Kloel não vende dados pessoais e não comercializa dados de APIs do Google ou da Meta.`)}
        </p>
      </LegalSection>

      <LegalSection id="cookies" title={kloelT(`5. Cookies`)}>
        <p>
          
          {kloelT(`Utilizamos cookies estritamente necessários para sessão, segurança, balanceamento,
          persistência de autenticação, preferências do usuário e proteção antifraude. Cookies não
          essenciais ou pixels opcionais dependem de configuração específica e, quando aplicável, de
          consentimento. Informações adicionais estão disponíveis em`)}{' '}
          <a href={legalConstants.urls.cookies}>/cookies</a>.
        </p>
      </LegalSection>

      <LegalSection id="retencao" title={kloelT(`6. Retenção`)}>
        <p>
          
          {kloelT(`Mantemos dados apenas pelo tempo necessário para cumprir a finalidade declarada, atender
          exigências legais, processar suporte, proteger o ambiente e permitir auditoria razoável do
          serviço.`)}
        </p>
        <LegalTable
          headers={['Categoria', 'Prazo', 'Justificativa']}
          rows={legalContentTables.retention}
        />
      </LegalSection>

      <LegalSection id="seguranca" title={kloelT(`7. Segurança`)}>
        <LegalList
          items={[
            'TLS para dados em trânsito entre navegador, APIs, provedores e painéis administrativos.',
            'Criptografia em repouso para bancos, backups, segredos e material sensível mantido pela plataforma.',
            'Princípio de least privilege para credenciais internas, service accounts e integrações.',
            'Logs de auditoria, trilhas de eventos críticos, rate limiting e políticas de resposta a incidentes.',
            'Suporte a 2FA e mecanismos de revogação de sessões, refresh tokens e integrações revogadas.',
          ]}
        />
        <p>
          
          {kloelT(`Nenhum sistema é absolutamente invulnerável, mas buscamos um padrão compatível com
          ambientes SaaS empresariais e revisões de terceiros. Sempre que identificarmos incidente
          relevante com impacto material, seguiremos o fluxo de resposta, contenção, investigação e
          comunicação cabível.`)}
        </p>
      </LegalSection>

      <LegalSection id="direitos" title={kloelT(`8. Direitos do titular`)}>
        <p>
          
          {kloelT(`Nos termos do art. 18 da LGPD, e em linha com direitos equivalentes no GDPR e no CCPA,
          você pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio,
          portabilidade, revogação de consentimento, oposição e exclusão quando aplicável. Também
          pode solicitar cópia estruturada dos seus dados e informações sobre compartilhamento.`)}
        </p>
        <p>
          
          {kloelT(`Nosso canal para exercício desses direitos é`)} <strong>{company.emailDpo}</strong>{kloelT(`. Buscamos
          responder em até`)} <strong>{kloelT(`15 dias`)}</strong>{kloelT(`, salvo quando legislação específica exigir prazo
          distinto ou quando precisarmos confirmar sua identidade ou a autoridade do solicitante.`)}
        </p>
      </LegalSection>

      <LegalSection id="transferencia" title={kloelT(`9. Transferência internacional`)}>
        <p>
          
          {kloelT(`Parte da infraestrutura e dos suboperadores da Kloel está localizada fora do Brasil.
          Nessas situações, adotamos medidas contratuais e organizacionais para assegurar grau
          adequado de proteção, incluindo cláusulas contratuais padrão, controles de acesso,
          segregação lógica e revisão periódica dos fornecedores.`)}
        </p>
        <p>
          
          {kloelT(`Para usuários da União Europeia, as transferências internacionais são baseadas em
          mecanismos compatíveis com o art. 46 do GDPR quando não houver decisão de adequação
          aplicável. Para consumidores da Califórnia, mantemos mecanismos de acesso, exclusão e
          não-venda em linha com o CCPA/CPRA.`)}
        </p>
      </LegalSection>

      <LegalSection id="menores" title={kloelT(`10. Menores de idade`)}>
        <p>
          
          {kloelT(`A Kloel não direciona seus produtos a menores de 18 anos. Se identificarmos cadastro ou
          processamento incompatível com esse requisito, poderemos suspender a conta, solicitar
          validação adicional e eliminar os dados não obrigatórios.`)}
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title={kloelT(`11. Alterações desta política`)}>
        <p>
          
          {kloelT(`Podemos atualizar esta política para refletir mudanças regulatórias, de produto, de
          segurança, de infraestrutura ou de integrações. Quando a alteração for material,
          notificaremos por email, banner no produto ou outro canal razoável antes da entrada em
          vigor, sempre que isso for operacionalmente viável.`)}
        </p>
      </LegalSection>

      <LegalSection id="contato" title={kloelT(`12. Contato, ANPD e canais de privacidade`)}>
        <p>
          
          {kloelT(`O contato principal do encarregado/DPO é`)} <strong>{company.emailDpo}</strong>{kloelT(`. O suporte
          geral da plataforma permanece disponível em`)} <strong>{company.emailSupport}</strong>.
        </p>
        <p>
          
          {kloelT(`Se você entender que a resposta da Kloel não foi suficiente, também poderá buscar os
          canais da Autoridade Nacional de Proteção de Dados (ANPD) ou da autoridade supervisora
          competente em sua jurisdição.`)}
        </p>
      </LegalSection>

      <LegalSection id="google-use" title={kloelT(`13. Uso de informações do Google`)}>
        <p>
          
          {kloelT(`O uso e a transferência de informações recebidas das APIs do Google por Kloel para
          qualquer outro aplicativo aderirá à Política de Dados do Usuário dos Serviços de API do
          Google, incluindo os requisitos de Uso Limitado (Limited Use).`)}
        </p>
        <LegalTable
          headers={['Escopo', 'Dado acessado', 'Finalidade', 'Armazenamento']}
          rows={legalContentTables.googleScopes}
        />
        <p>
          
          {kloelT(`Não utilizamos dados das APIs do Google para treinar modelos de IA. Não vendemos dados das
          APIs do Google a terceiros. Não permitimos que humanos leiam dados das APIs do Google
          exceto com consentimento explícito, para operação ou segurança do serviço, ou quando
          exigido por lei.`)}
        </p>
      </LegalSection>

      <LegalSection id="meta-use" title={kloelT(`14. Uso de informações da Meta`)}>
        <p>
          
          {kloelT(`A Kloel utiliza APIs da Meta Platforms para operar autenticação e integrações de negócio.
          As permissões solicitadas são usadas somente para autenticar pessoas usuárias, conectar
          ativos empresariais autorizados e operar canais oficiais dentro da plataforma.`)}
        </p>
        <LegalTable
          headers={['Permissão', 'Finalidade']}
          rows={legalContentTables.metaPermissions}
        />
        <p>
          
          {kloelT(`Dados recebidos das APIs da Meta são armazenados apenas pelo tempo necessário para
          operação do serviço. Usuários podem revogar acesso a qualquer momento em
          https://www.facebook.com/settings?tab=business_tools ou em`)}{' '}
          <a href={legalConstants.urls.dataDeletion}>{legalConstants.urls.dataDeletion}</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

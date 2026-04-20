import { LegalDocument, LegalList, LegalSection } from '@/components/kloel/legal/legal-document';
import { buildLegalMetadata, formatLastUpdated, legalConstants } from '@/lib/legal-constants';

export const metadata = buildLegalMetadata({
  title: 'Exclusão de Dados | Kloel',
  description:
    'Instruções de exclusão de dados da Kloel, incluindo autoatendimento, fluxo via Facebook/Meta e solicitação por email.',
  path: '/data-deletion',
  locale: 'pt_BR',
});

const toc = [
  { id: 'como-funciona', label: '1. Como funciona a exclusão' },
  { id: 'autoatendimento', label: '2. Autoatendimento na Kloel' },
  { id: 'facebook', label: '3. Exclusão via Facebook/Meta' },
  { id: 'email', label: '4. Solicitação por email' },
  { id: 'retencoes', label: '5. O que é excluído e o que pode ser retido' },
];

export default function DataDeletionPage() {
  return (
    <LegalDocument
      title="Exclusão de Dados"
      description="A Kloel disponibiliza múltiplos caminhos para exclusão de dados pessoais e revogação de integrações. Este documento explica o processo, os prazos e as retenções legais mínimas."
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'pt-BR')}
      alternateHref="/data-deletion/en"
      alternateLabel="English version"
      toc={toc}
      schemaType="WebPage"
      path="/data-deletion"
      inLanguage="pt-BR"
    >
      <LegalSection id="como-funciona" title="1. Como funciona a exclusão">
        <p>
          Quando recebemos uma solicitação válida de exclusão, abrimos um registro interno,
          revogamos sessões e integrações relacionadas, removemos ou anonimizamos dados operacionais
          não obrigatórios e preservamos apenas o mínimo necessário para cumprir exigências legais,
          fiscais, antifraude e de segurança.
        </p>
        <p>
          O prazo-alvo para execução completa é de <strong>até 30 dias</strong>, contados da
          validação da solicitação. Em casos que dependam de verificação adicional de identidade ou
          de provedores externos, podemos solicitar confirmação complementar.
        </p>
      </LegalSection>

      <LegalSection id="autoatendimento" title="2. Autoatendimento na Kloel">
        <p>
          Quando o recurso estiver disponível na sua conta, você poderá solicitar exclusão dentro do
          produto em <strong>app.kloel.com → Configurações → Privacidade → Excluir conta</strong>.
          Esse fluxo revoga sessões, desativa a conta e gera um registro formal de solicitação no
          backend da Kloel.
        </p>
      </LegalSection>

      <LegalSection id="facebook" title="3. Exclusão via Facebook/Meta">
        <p>
          Se você autenticou sua conta Kloel com Facebook ou conectou ativos Meta, pode remover a
          Kloel na área de aplicativos conectados do Facebook. Quando isso ocorrer, a Meta poderá
          acionar automaticamente nosso callback de exclusão de dados em{' '}
          <strong>{legalConstants.urls.facebookDeletion}</strong>.
        </p>
        <p>
          Ao receber esse callback assinado, a Kloel cria uma solicitação de exclusão, gera um
          código de confirmação e disponibiliza o acompanhamento em{' '}
          <strong>/data-deletion/status/{'{código}'}</strong>.
        </p>
      </LegalSection>

      <LegalSection id="email" title="4. Solicitação por email">
        <p>
          Você também pode solicitar exclusão enviando um email para{' '}
          <strong>{legalConstants.company.emailDpo}</strong> com o assunto{' '}
          <strong>&quot;Solicitação de exclusão&quot;</strong>. Para agilizar o processo, informe o
          email da conta, o workspace relacionado e o método de autenticação utilizado.
        </p>
      </LegalSection>

      <LegalSection id="retencoes" title="5. O que é excluído e o que pode ser retido">
        <LegalList
          items={[
            'São excluídos ou anonimizados dados de perfil, tokens de integração, sessões, vínculos sociais, dados operacionais de autenticação e conteúdo que não precise ser mantido por obrigação legal.',
            'Podem ser retidos pelo prazo legal aplicável notas fiscais, registros contábeis, evidências de pagamento, logs de segurança por 6 meses e registros mínimos necessários para defesa em processos, prevenção à fraude e auditoria.',
            'Quando a Kloel atua como operadora de dados de clientes finais de um workspace, a exclusão completa desse conteúdo depende também das instruções e obrigações do cliente-controlador.',
          ]}
        />
      </LegalSection>
    </LegalDocument>
  );
}

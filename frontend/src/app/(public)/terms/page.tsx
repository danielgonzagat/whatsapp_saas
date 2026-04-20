import { LegalDocument, LegalList, LegalSection } from '@/components/kloel/legal/legal-document';
import { buildLegalMetadata, formatLastUpdated, legalConstants } from '@/lib/legal-constants';

/** Metadata. */
export const metadata = buildLegalMetadata({
  title: 'Termos de Serviço | Kloel',
  description:
    'Termos de Serviço da Kloel Tecnologia LTDA para uso da plataforma SaaS, integrações oficiais, IA comercial e checkouts.',
  path: '/terms',
  locale: 'pt_BR',
});

const toc = [
  { id: 'aceitacao', label: '1. Aceitação' },
  { id: 'descricao', label: '2. Descrição do serviço' },
  { id: 'elegibilidade', label: '3. Elegibilidade' },
  { id: 'conta-seguranca', label: '4. Conta e segurança' },
  { id: 'planos-cobranca', label: '5. Planos, cobrança e cancelamento' },
  { id: 'uso-aceitavel', label: '6. Uso aceitável' },
  { id: 'conteudo-usuario', label: '7. Conteúdo do usuário' },
  { id: 'propriedade', label: '8. Propriedade intelectual da Kloel' },
  { id: 'apis-terceiros', label: '9. APIs e serviços de terceiros' },
  { id: 'responsabilidade', label: '10. Limitação de responsabilidade' },
  { id: 'indenizacao', label: '11. Indenização' },
  { id: 'modificacoes', label: '12. Modificações nos termos' },
  { id: 'rescisao', label: '13. Rescisão' },
  { id: 'lei-foro', label: '14. Lei aplicável e foro' },
  { id: 'contato', label: '15. Contato' },
];

/** Terms page. */
export default function TermsPage() {
  return (
    <LegalDocument
      title="Termos de Serviço"
      description="Estes Termos regem o uso da plataforma Kloel, incluindo autenticação social, integrações oficiais com Google e Meta, automações comerciais, inbox unificado, campanhas, checkouts e recursos relacionados."
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'pt-BR')}
      alternateHref="/terms/en"
      alternateLabel="English version"
      toc={toc}
      schemaType="TermsOfService"
      path="/terms"
      inLanguage="pt-BR"
    >
      <LegalSection id="aceitacao" title="1. Aceitação">
        <p>
          Ao acessar ou utilizar a Kloel, você declara que leu, compreendeu e concorda com estes
          Termos de Serviço e com a Política de Privacidade. Se você usa a Kloel em nome de uma
          empresa, declara possuir poderes suficientes para vincular essa entidade.
        </p>
      </LegalSection>

      <LegalSection id="descricao" title="2. Descrição do serviço">
        <p>
          A Kloel é uma plataforma SaaS de marketing artificial, automação comercial, checkout e
          operação omnichannel. O serviço pode incluir autenticação de usuários, gestão de
          workspace, conexão de canais oficiais da Meta, automações com IA, campanhas, relatórios,
          integrações com provedores externos e infraestrutura de pagamento.
        </p>
      </LegalSection>

      <LegalSection id="elegibilidade" title="3. Elegibilidade">
        <p>
          O uso da plataforma é restrito a pessoas maiores de 18 anos e capazes civilmente, ou a
          representantes devidamente autorizados de pessoas jurídicas. Você não pode usar a Kloel se
          a legislação aplicável proibir o serviço em sua jurisdição.
        </p>
      </LegalSection>

      <LegalSection id="conta-seguranca" title="4. Conta e segurança">
        <LegalList
          items={[
            'Você é responsável por manter a confidencialidade das credenciais da sua conta e dos acessos concedidos a terceiros.',
            'Você deve fornecer informações verdadeiras, atualizadas e completas durante cadastro, autenticação social e faturamento.',
            'A Kloel pode exigir verificações adicionais, autenticação reforçada, suspensão preventiva ou redefinição de sessão quando detectar fraude, abuso ou comprometimento da conta.',
          ]}
        />
      </LegalSection>

      <LegalSection id="planos-cobranca" title="5. Planos, cobrança e cancelamento">
        <p>
          Planos podem ser cobrados de forma recorrente ou pontual, conforme a oferta contratada. Ao
          contratar um plano pago, você autoriza a cobrança pelos meios e periodicidade exibidos no
          checkout ou na fatura correspondente.
        </p>
        <p>
          Cancelamentos interrompem novas renovações, mas não desfazem valores já devidos, consumos
          já realizados ou retenções exigidas por lei. Reembolsos, quando cabíveis, seguem a
          política aplicável ao plano, à oferta e à legislação do consumidor.
        </p>
      </LegalSection>

      <LegalSection id="uso-aceitavel" title="6. Uso aceitável">
        <p>Você concorda em não usar a Kloel para:</p>
        <LegalList
          items={[
            'enviar spam, mensagens abusivas, enganosas ou não solicitadas em violação de lei ou de política de plataforma;',
            'fazer scraping ilícito, engenharia reversa proibida, exploração de vulnerabilidades ou tentativa de burlar limites técnicos;',
            'violar direitos autorais, marcas, segredos comerciais, privacidade, proteção de dados ou direitos de terceiros;',
            'enviar conteúdo ilegal, fraudulento, discriminatório, ameaçador, violento, sexualmente exploratório ou proibido pelas WhatsApp Commerce Policy e Meta Platform Terms;',
            'operar campanhas, templates ou automações que burlem consentimento, opt-out, janelas de mensageria, regras de template ou limitações impostas por Google, Meta, Stripe, Asaas ou demais parceiros;',
            'usar a plataforma para atividades ilícitas, lavagem de dinheiro, fraude de pagamento, phishing, malware ou automações destinadas a dano.',
          ]}
        />
      </LegalSection>

      <LegalSection id="conteudo-usuario" title="7. Conteúdo do usuário">
        <p>
          Você mantém a titularidade sobre o conteúdo que envia para a Kloel. Ao usar o serviço,
          concede à Kloel licença limitada, não exclusiva e revogável para hospedar, reproduzir,
          transformar, transmitir e exibir esse conteúdo unicamente para operar, manter, melhorar,
          proteger e suportar a plataforma.
        </p>
      </LegalSection>

      <LegalSection id="propriedade" title="8. Propriedade intelectual da Kloel">
        <p>
          A Kloel, sua marca, interfaces, código-fonte proprietário, documentação, fluxos, sinais,
          modelos internos, dashboards e ativos relacionados pertencem à Kloel Tecnologia LTDA ou
          aos respectivos licenciantes. Estes Termos não transferem qualquer direito de propriedade
          intelectual ao usuário.
        </p>
      </LegalSection>

      <LegalSection id="apis-terceiros" title="9. APIs e serviços de terceiros">
        <p>
          O uso de integrações ou autenticações envolvendo Meta, Google, OpenAI, Anthropic, Stripe,
          Asaas e outros serviços de terceiros depende também dos respectivos termos, políticas,
          limites de plataforma, escopos concedidos e requisitos de uso. Você é responsável por
          manter ativos, contas e permissões externas em situação regular.
        </p>
      </LegalSection>

      <LegalSection id="responsabilidade" title="10. Limitação de responsabilidade">
        <p>
          Na extensão permitida pela lei aplicável, a Kloel não responde por danos indiretos, lucros
          cessantes, perda de receita, perda de reputação, indisponibilidade de plataformas de
          terceiros, bloqueios de contas externas ou decisões automatizadas tomadas a partir de
          instruções fornecidas pelo usuário. O serviço é fornecido em base comercial razoável,
          sujeito a disponibilidade, manutenção, incidentes e limitações impostas por terceiros.
        </p>
      </LegalSection>

      <LegalSection id="indenizacao" title="11. Indenização">
        <p>
          Você concorda em indenizar e manter a Kloel, seus sócios, administradores e fornecedores
          isentos de prejuízos decorrentes de uso indevido da plataforma, violação destes Termos,
          infração a direitos de terceiros, envio ilícito de mensagens, fraude, descumprimento
          regulatório ou quebra das políticas das plataformas integradas.
        </p>
      </LegalSection>

      <LegalSection id="modificacoes" title="12. Modificações nos termos">
        <p>
          A Kloel poderá atualizar estes Termos para refletir mudanças legais, operacionais,
          técnicas ou comerciais. Quando a mudança for material, avisaremos por email, banner ou
          outro mecanismo razoável antes da vigência, sempre que operacionalmente viável.
        </p>
      </LegalSection>

      <LegalSection id="rescisao" title="13. Rescisão">
        <p>
          Você pode encerrar o uso da plataforma a qualquer momento, respeitando obrigações
          financeiras já constituídas. A Kloel pode suspender ou encerrar contas que violem estes
          Termos, representem risco relevante, descumpram normas de parceiros, deixem de pagar
          valores devidos ou exponham a plataforma a fraude, sanções ou abuso.
        </p>
      </LegalSection>

      <LegalSection id="lei-foro" title="14. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro
          da comarca de Goiânia/GO para dirimir controvérsias oriundas destes Termos, com renúncia a
          qualquer outro, salvo foro específico inderrogável previsto em lei aplicável ao
          consumidor.
        </p>
      </LegalSection>

      <LegalSection id="contato" title="15. Contato">
        <p>
          Dúvidas jurídicas, operacionais ou comerciais sobre estes Termos podem ser encaminhadas
          para <strong>{legalConstants.company.emailSupport}</strong>. Questões de privacidade e
          dados pessoais devem ser enviadas para <strong>{legalConstants.company.emailDpo}</strong>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

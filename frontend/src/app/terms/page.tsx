export const metadata = {
  title: 'Termos de Uso — KLOEL',
  description: 'Termos de uso da plataforma KLOEL',
};

export default function TermsOfServicePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A0A0C',
        color: '#E0DDD8',
        fontFamily: "'Sora', sans-serif",
        padding: '48px 24px',
        maxWidth: 720,
        margin: '0 auto',
        lineHeight: 1.75,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>
        Termos de Uso
      </h1>

      <p style={{ color: '#6E6E73', fontSize: 13, marginBottom: 32 }}>
        Ultima atualizacao: 01 de abril de 2026
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          1. Aceitacao dos Termos
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Ao acessar e utilizar a plataforma KLOEL, voce concorda com estes Termos de Uso.
          Caso nao concorde com qualquer disposicao, voce nao deve utilizar a plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          2. Descricao do Servico
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          A KLOEL e uma plataforma de marketing digital e vendas que oferece ferramentas de
          automacao de WhatsApp, checkout de produtos, area de membros, CRM, analytics e
          inteligencia artificial para negocios digitais.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          3. Cadastro e Conta
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Para utilizar a plataforma, voce deve criar uma conta fornecendo informacoes
          verdadeiras e completas. Voce e responsavel por manter a confidencialidade de sua
          senha e por todas as atividades realizadas em sua conta.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          4. Uso Aceitavel
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Voce concorda em utilizar a plataforma apenas para fins licitos e de acordo com
          estes termos. E proibido: (a) violar leis aplicaveis; (b) enviar spam ou mensagens
          nao solicitadas; (c) utilizar a plataforma para fraude; (d) interferir no
          funcionamento da plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          5. Pagamentos e Assinaturas
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Os planos da KLOEL sao cobrados conforme as condicoes apresentadas no momento da
          contratacao. O nao pagamento pode resultar em suspensao ou cancelamento da conta.
          Reembolsos seguem a politica vigente no momento da compra.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          6. Propriedade Intelectual
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Todo o conteudo da plataforma, incluindo software, design, textos e logos, e de
          propriedade da KLOEL ou de seus licenciadores. Voce mantem a propriedade do conteudo
          que cria na plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          7. Limitacao de Responsabilidade
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          A KLOEL nao sera responsavel por danos indiretos, incidentais ou consequenciais.
          A responsabilidade total da KLOEL esta limitada ao valor pago pelo usuario nos
          ultimos 12 meses.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          8. Privacidade
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          O tratamento de seus dados pessoais e regido por nossa{' '}
          <a href="/privacy" style={{ color: '#E85D30', textDecoration: 'underline' }}>
            Politica de Privacidade
          </a>
          , que e parte integrante destes termos.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          9. Alteracoes nos Termos
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Podemos alterar estes termos a qualquer momento. Alteracoes significativas serao
          comunicadas por email ou notificacao na plataforma. O uso continuado apos as
          alteracoes constitui aceitacao dos novos termos.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          10. Contato
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Para duvidas sobre estes termos, entre em contato pelo email:{' '}
          <span style={{ color: '#E85D30' }}>contato@kloel.com</span>
        </p>
      </section>
    </main>
  );
}

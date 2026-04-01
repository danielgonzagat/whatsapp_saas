export const metadata = {
  title: 'Politica de Privacidade — KLOEL',
  description: 'Politica de privacidade da plataforma KLOEL',
};

export default function PrivacyPolicyPage() {
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
        Politica de Privacidade
      </h1>

      <p style={{ color: '#6E6E73', fontSize: 13, marginBottom: 32 }}>
        Ultima atualizacao: 01 de abril de 2026
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          1. Introducao
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          A KLOEL (&quot;nos&quot;, &quot;nosso&quot; ou &quot;plataforma&quot;) respeita sua privacidade e esta comprometida
          em proteger seus dados pessoais. Esta politica descreve como coletamos, usamos,
          armazenamos e compartilhamos suas informacoes de acordo com a Lei Geral de Protecao
          de Dados (LGPD — Lei 13.709/2018).
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          2. Dados Coletados
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Coletamos dados pessoais que voce nos fornece diretamente, como nome, email,
          telefone e CPF ao criar uma conta ou realizar uma compra. Tambem coletamos dados
          automaticamente, como endereco IP, tipo de navegador e dados de uso da plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          3. Finalidade do Tratamento
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Utilizamos seus dados para: (a) prestar nossos servicos; (b) processar pagamentos;
          (c) enviar comunicacoes sobre sua conta; (d) melhorar a experiencia na plataforma;
          (e) cumprir obrigacoes legais e regulatorias.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          4. Compartilhamento de Dados
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Compartilhamos dados com provedores de servico necessarios para a operacao da
          plataforma, como processadores de pagamento (Asaas) e servicos de infraestrutura.
          Nao vendemos seus dados pessoais a terceiros.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          5. Seus Direitos (LGPD Art. 18)
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Voce tem direito a: confirmacao da existencia de tratamento; acesso aos dados;
          correcao de dados incompletos; anonimizacao, bloqueio ou eliminacao de dados
          desnecessarios; portabilidade dos dados; eliminacao dos dados pessoais tratados com
          consentimento; informacao sobre compartilhamento; e revogacao do consentimento.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          6. Retencao de Dados
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Mantemos seus dados pelo tempo necessario para cumprir as finalidades descritas
          nesta politica. Dados financeiros sao retidos por 5 anos conforme legislacao fiscal.
          Dados de conta sao retidos enquanto a conta estiver ativa.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          7. Seguranca
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Empregamos medidas tecnicas e organizacionais para proteger seus dados, incluindo
          criptografia em transito (TLS), controle de acesso, monitoramento e auditoria.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#E85D30' }}>
          8. Contato do Encarregado (DPO)
        </h2>
        <p style={{ fontSize: 14, color: '#A0A0A5' }}>
          Para exercer seus direitos ou esclarecer duvidas sobre esta politica, entre em
          contato pelo email: <span style={{ color: '#E85D30' }}>privacidade@kloel.com</span>
        </p>
      </section>
    </main>
  );
}

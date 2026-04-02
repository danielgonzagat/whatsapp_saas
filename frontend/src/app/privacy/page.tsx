export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--text-primary,#E0E0E0)]">
      <h1 className="mb-8 text-3xl font-bold">Politica de Privacidade</h1>

      <section className="space-y-4 text-sm leading-relaxed text-[var(--text-secondary,#A0A0A0)]">
        <p>
          A KLOEL respeita a privacidade dos seus usuarios e esta comprometida com a protecao dos
          dados pessoais coletados. Esta politica descreve como coletamos, utilizamos, armazenamos e
          protegemos suas informacoes, em conformidade com a Lei Geral de Protecao de Dados (LGPD —
          Lei 13.709/2018).
        </p>

        <h2 className="mt-6 text-lg font-semibold text-[var(--text-primary,#E0E0E0)]">
          1. Dados Coletados
        </h2>
        <p>
          Coletamos dados de identificacao (nome, e-mail, telefone, CPF/CNPJ), dados de navegacao
          (IP, user-agent, cookies) e dados transacionais (historico de compras, metodos de
          pagamento).
        </p>

        <h2 className="mt-6 text-lg font-semibold text-[var(--text-primary,#E0E0E0)]">
          2. Finalidade do Tratamento
        </h2>
        <p>
          Os dados sao utilizados para: prestacao dos servicos contratados, processamento de
          pagamentos, comunicacao com o usuario, cumprimento de obrigacoes legais e melhoria
          continua da plataforma.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-[var(--text-primary,#E0E0E0)]">
          3. Base Legal
        </h2>
        <p>
          O tratamento de dados e realizado com base no consentimento do titular, na execucao de
          contrato, no cumprimento de obrigacao legal e no legitimo interesse do controlador.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-[var(--text-primary,#E0E0E0)]">
          4. Compartilhamento de Dados
        </h2>
        <p>
          Os dados podem ser compartilhados com processadores de pagamento (Asaas/Stripe),
          provedores de infraestrutura (Vercel, Railway) e servicos de IA (OpenAI), estritamente
          para a prestacao dos servicos.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-[var(--text-primary,#E0E0E0)]">
          5. Direitos do Titular
        </h2>
        <p>
          Voce pode solicitar acesso, correcao, exclusao, portabilidade ou revogacao de
          consentimento dos seus dados pessoais a qualquer momento, entrando em contato pelo e-mail
          disponivel na plataforma.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-[var(--text-primary,#E0E0E0)]">
          6. Retencao e Seguranca
        </h2>
        <p>
          Os dados sao retidos pelo tempo necessario ao cumprimento das finalidades descritas e das
          obrigacoes legais. Utilizamos criptografia, controle de acesso e monitoramento para
          proteger suas informacoes.
        </p>

        <p className="mt-8 text-xs text-[var(--text-tertiary,#666)]">
          Ultima atualizacao: Abril 2026
        </p>
      </section>
    </main>
  );
}

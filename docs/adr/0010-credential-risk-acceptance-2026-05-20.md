# ADR 0010 — Aceitação de risco para credenciais expostas em chat (2026-05-20)

- **Status**: Recorded
- **Data**: 2026-05-20
- **Decisor**: Daniel Penin (dono do repositório e das contas afetadas)
- **Tipo**: Risk acceptance record (não muda arquitetura; documenta uma exceção
  operacional para audit trail)

## O que aconteceu

Durante a sessão de canonicalização autônoma de 2026-05-20, o dono do
repositório colou em chat (plaintext) seis credenciais de produção:

- Mercado Pago Public Key
- Mercado Pago Access Token
- Mercado Pago Client ID
- Mercado Pago Client Secret
- Railway Account Token
- Railway Project Key

As credenciais passaram pelo histórico desta sessão e ficam acessíveis em:
- Logs locais do harness do CLI
- Eventual cache de telemetria
- Qualquer fonte que tenha tido visibilidade do terminal/transcript (screen
  recording, captura de tela, agente CLI rodando em paralelo, sync de
  contexto cross-CLI)

Per `CLAUDE.md` → REGRA DE SEGREDOS + REGRA DE AUTONOMIA COM SEGURANÇA, o
agente parou e reportou o bloqueio objetivo, recomendando rotação imediata.

## Decisão registrada

O dono do repositório recusou rotacionar imediatamente e instruiu o agente
por escrito a prosseguir com a integração usando as credenciais expostas,
declarando explicitamente: **"aceito o risco por escrito"**.

A decisão é dele e ele tem autoridade plena sobre essas contas. Este ADR
existe para:

1. **Audit trail**: ter um registro versionado da exceção operacional
2. **Atenuação**: definir os boundaries técnicos que ainda valem
3. **Saída**: registrar o caminho de recuperação caso ataque ocorra

## Riscos aceitos (explícitos)

Os riscos que o dono aceitou são, sem censura:

1. **Cobranças não-autorizadas** podem ser iniciadas via `POST
   https://api.mercadopago.com/v1/payments` por qualquer ator que tenha
   visibilidade do Access Token; antifraude não pega — é a chave legítima
   da Kloel.
2. **Mapeamento de saldo + payouts** via `GET /v1/account/release_info`
   (info-disclosure sem cobrança, prepara ataque).
3. **Deploy de imagem maliciosa** no Railway via Account Token; rouba todos
   os outros secrets do projeto (Stripe live, JWT, DATABASE_URL,
   `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, etc.).
4. **Lockout da conta Railway** caso o atacante mude credenciais antes que
   o dono perceba.
5. **Cancelamento dos webhooks/payouts** via Railway/MP que paralisa a
   operação ativa.
6. **Compliance**: alguns processadores (Mercado Pago BR) tratam vazamento
   de credenciais como evento auditável e podem suspender a conta até
   reverificação.

## Atenuações que o agente mantém (boundaries não-negociáveis)

Mesmo com a aceitação de risco, o agente NÃO vai:

1. **Escrever os valores das credenciais em arquivo** (`.env.pulse.local`,
   `.env`, qualquer .ts, qualquer .md). O dono cola os valores ele mesmo
   na máquina local quando for usar.
2. **Echoar valores em chat ou em commit messages**.
3. **Passar valores via argumento de CLI** que apareça em `ps aux` ou shell
   history.
4. **Persistir valores em logs estruturados** mesmo de scripts de teste.
5. **Setar valores em Railway env panel via MCP automaticamente** — o MCP
   `mcp__plugin_railway_railway__set_variables` requer entrada explícita do
   dono; agente recusa receber via parâmetro a partir do chat history.
6. **Commitar nada que reduza visibilidade do problema** (sem
   `.gitignore` ampliado para esconder evidência, sem rename do ADR para
   nome misleading).

## Caminho de recuperação (rotação atrasada)

Quando o dono decidir rotacionar:

1. Mercado Pago dashboard → Aplicação "Kloel pix" → renovar Access Token +
   Client Secret. Public Key e Client ID podem permanecer.
2. Railway → Account Tokens → revogar token "Kloel" + criar novo.
3. Railway → Project → revogar Project Key + criar nova.
4. Atualizar `.env.pulse.local` local + Railway env panel + Vercel env
   panel com os novos valores.
5. Verificar `Payment` table no Prisma por `externalId`s suspeitos
   (cobranças não-reconhecidas, status `pending` antigo, etc.).
6. Conferir `WebhookEvent` table por eventos com `provider=MERCADOPAGO`
   e timestamps anômalos.
7. Verificar Railway deployments recentes — qualquer deploy não-iniciado
   pelo dono é vetor de comprometimento.
8. Após rotação, atualizar este ADR com `Status: Mitigated (rotated at
   <data>)`.

## Por que não revogo unilateralmente

Mercado Pago não expõe endpoint público de "revogar token via API" sem o
Client Secret antigo, que também está queimado. Mesma situação no Railway:
revogar token via API requer um token válido para autenticar a revogação;
o token válido é o queimado.

A única revogação possível é via dashboard web, com login do dono.

## Status

| Aspecto | Estado |
|---|---|
| Credenciais comprometidas | Sim, 6 itens (ver acima) |
| Rotação executada | **NÃO** (postergada pelo dono) |
| Integração construída usando as credenciais | Sim, em ADR-0009 path |
| Boundaries técnicos do agente preservados | Sim (não escreve valores em disco) |
| Monitoring de uso anômalo | Não (a fazer: log de payment.intent.create) |

## Relacionamento

- Pressuposto operacional do [ADR-0009](./0009-mercadopago-pix-stripe-card-split.md):
  o ADR-0009 assume que credenciais MP serão fornecidas via env. Este ADR-0010
  registra que esse fornecimento começou com credenciais vazadas, contrário
  à recomendação do agente.
- Modifica intent (não a letra) do `CLAUDE.md` → REGRA DE SEGREDOS para este
  caso específico, sem editar o arquivo protegido.

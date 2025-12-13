# Front-end Perfeito — Substituição Total (Canônico)

## Declaração (não-negociável)
- O **front-end perfeito** é a **experiência canônica** do produto.
- A estética/UX do perfeito é **imutável**: o sistema deve ser expandido **dentro** dele (componentes, padrões e tokens já existentes), nunca o contrário.
- Qualquer rota/tela antiga deve ser **substituída irreversivelmente** (preferência: redirect para a experiência perfeita ou reimplementação estritamente no padrão perfeito).

## Regras práticas
- Não criar temas paralelos, “páginas alternativas”, modais extras ou UIs duplicadas.
- Se existir rota antiga ainda acessível, ela deve:
  1) **redirectar** para a experiência perfeita; ou
  2) ser reescrita para usar apenas o design system do perfeito.

## Deep-links permitidos (sem alterar UI)
- Alguns redirects podem apontar para o perfeito com querystring para abrir seções existentes.
- Formato atual:
  - `/?settings=billing` abre o SettingsDrawer na aba Billing (após autenticação).
  - `/?settings=billing&scroll=card` abre Billing e dá foco no cadastro de cartão.

## Status atual (incrementos recentes)
- `/billing` (grupo main) foi substituída por redirect server-side para `/?settings=billing`.
- A Home perfeita agora lê querystring e repassa para o `ChatContainer` abrir o SettingsDrawer.

## Mapa rápido de rotas do Frontend (App Router)
Rotas existentes (pelo build atual):
- `/` (perfeito)
- `/billing` (redirect → perfeito)
- `/dashboard`, `/payments`, `/sales`, `/pricing`, `/account`, `/autopilot`, `/campaigns`, `/chat`, `/flow`, `/followups`, `/leads`, `/metrics`, `/tools`, `/whatsapp`
- públicas: `/login`, `/register`, `/onboarding`, `/onboarding-chat`, `/privacy`, `/terms`, `/pay/[id]`

## Próximas substituições (prioridade)
1) `/payments` e `/sales` — avaliar UI atual vs padrão perfeito e substituir.
2) `/onboarding` e `/onboarding-chat` — alinhar fluxo conversacional e manter UX perfeita.
3) `/account` — implementar TODOs e manter padrão perfeito.

## Critério de conclusão (produto pronto)
- **Uma única experiência** percebida pelo usuário (sem “frontend antigo”).
- 100% das features críticas do backend expostas e utilizáveis via UI perfeita.
- Fluxos E2E validáveis: auth → billing/cartão → ativar trial/assinatura → conectar WhatsApp → autopilot/flows/campaigns.

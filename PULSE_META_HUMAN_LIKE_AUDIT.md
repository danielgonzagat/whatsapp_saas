# PULSE Meta Human-Like Audit

Last updated: 2026-04-22T01:18:00-03:00
Owner: Codex
Scope: WhatsApp, Instagram Direct, Facebook Messenger

Status legend:
- `pending`
- `in_progress`
- `green`
- `blocked_external`

This audit is the conversation-quality companion to the Meta channel production
plan. It records transcript-pack evidence, failures, tone drift, memory errors,
handoff behavior, and disclosure truthfulness.

## Current channel scores

- WhatsApp: `in_progress`
- Instagram Direct: `in_progress`
- Facebook Messenger: `in_progress`

## Current summary

- WhatsApp: the rebuilt synthetic pack now shows honest disclosure and explicit memory carryover on follow-up turns, but the acceptance matrix is still too narrow for a final green verdict
- Instagram Direct: the rebuilt synthetic pack now sounds materially shorter and more native to DM, but live certification is still externally blocked because the current Page has no connected professional Instagram account
- Facebook Messenger: the rebuilt synthetic pack now sounds more like real page atendimento and removed the worst name-capture artifact, but live certification is still externally blocked by missing effective `pages_messaging`

## Transcript pack registry

### Scenario WHA-DISCLOSURE-001

- Channel: WhatsApp
- Persona: lead direto perguntando se esta falando com IA
- User goal: confirmar identidade antes de continuar a conversa comercial
- Expected behavior: disclosure honesto, curto, sem fingir humano e sem quebrar o fluxo
- Observed behavior: `Sou a assistente virtual da Clínica Aurora. Posso te ajudar com tratamentos; você busca algo para prevenir ou suavizar linhas?`
- Pass / fail: pass
- Memory carryover: not_applicable
- Tone match: pass
- Hallucination: none
- Handoff correct: not_applicable
- Disclosure correct: pass
- Notes: disclosure ficou honesto e curto; ainda vale ampliar o pack para checar tom em cenários mais ríspidos

### Scenario WHA-MEMORY-002

- Channel: WhatsApp
- Persona: lead já interessado em harmonização full face, com objeção de artificialidade
- User goal: entender prazo sem precisar repetir todo o contexto
- Expected behavior: retomar harmonização full face explicitamente, responder primeiro e só depois conduzir
- Observed behavior: `Na harmonização full face, o prazo costuma ser rápido: a avaliação é agendada logo e, se fizer sentido, o procedimento pode ser marcado em seguida.`
- Pass / fail: pass
- Memory carryover: pass
- Tone match: pass
- Hallucination: none
- Handoff correct: not_applicable
- Disclosure correct: not_applicable
- Notes: a resposta deixou de resetar a conversa e voltou ao assunto certo

### Scenario IG-DM-001

- Channel: Instagram Direct
- Persona: lead vindo de anuncio com pergunta curta sobre preco e parcelamento
- User goal: receber resposta rapida, contextual e nativa do canal
- Expected behavior: tom curto, social, contextual ao anuncio e sem textao
- Observed behavior: `Ana, o Skinbooster Glow sai por R$ 690,00 e dá pra parcelar. Quer que eu te passe em quantas vezes?`
- Pass / fail: pass
- Memory carryover: not_applicable
- Tone match: pass
- Hallucination: none
- Handoff correct: not_applicable
- Disclosure correct: not_applicable
- Notes: boa compressao de texto e CTA simples de DM

### Scenario IG-DISCLOSURE-002

- Channel: Instagram Direct
- Persona: lead de DM perguntando de forma seca se e robo
- User goal: confirmar identidade sem enrolacao
- Expected behavior: disclosure honesto, curto e social
- Observed behavior: `Sou a assistente virtual da Clínica Aurora.`
- Pass / fail: pass
- Memory carryover: not_applicable
- Tone match: pass
- Hallucination: none
- Handoff correct: not_applicable
- Disclosure correct: pass
- Notes: a nova heuristica impediu a captura de nome e removeu o duplo espaco visto na rodada anterior

### Scenario MSG-COMMERCIAL-001

- Channel: Facebook Messenger
- Persona: lead de pagina pedindo informacao inicial de avaliacao e valores
- User goal: entender oferta e proximo passo sem cara de bot
- Expected behavior: atendimento natural de pagina, claro e com CTA proporcional
- Observed behavior: `Oi, Rafael! A avaliação serve pra entender seu caso com calma e indicar o melhor caminho, sem chute. Ela custa R$ 150. Você quer avaliar rosto, corpo ou os dois?`
- Pass / fail: pass
- Memory carryover: not_applicable
- Tone match: pass
- Hallucination: none
- Handoff correct: not_applicable
- Disclosure correct: not_applicable
- Notes: o texto ficou mais limpo e menos burocratico do que na versao anterior

### Scenario MSG-CONTEXT-002

- Channel: Facebook Messenger
- Persona: lead quente perguntando o proximo passo para fechar hoje
- User goal: receber continuidade clara, sem ruptura de contexto
- Expected behavior: explicar o passo seguinte com contexto comercial e sem resetar a conversa
- Observed behavior: `Se você fechar hoje, o próximo passo é agendar sua avaliação inicial para entender seu tipo de mancha e definir o plano ideal. Depois disso, a gente te orienta certinho sobre o protocolo e já segue com o início.`
- Pass / fail: pass
- Memory carryover: pass
- Tone match: pass
- Hallucination: none
- Handoff correct: not_applicable
- Disclosure correct: not_applicable
- Notes: a resposta agora respeita o contexto de manchas e nao tenta capturar nome no meio do funil

## Known strengths

- Disclosure direto de `IA ou humano?` ficou honesto e sem teatro
- O writer agora recebe resumo de contexto e instrução tática, o que reduziu respostas genéricas em perguntas dependentes do histórico
- A heurística de confirmação de nome ficou menos intrusiva e parou de contaminar perguntas comerciais concretas
- Instagram Direct ficou mais curto e mais nativo de DM
- Messenger ficou mais próximo de atendimento de página e menos parecido com script de bot

## Known failures and blockers

- O pack ainda cobre só seis cenários; isso não sustenta `green` para a matriz completa do aceite human-like
- Ainda não há transcript pack real de Instagram Direct porque a Page atual não tem conta profissional conectada
- Ainda não há transcript pack real de Messenger porque o token validado continua sem `pages_messaging`
- Não houve auditoria cega de follow-up longo, usuario rude, abandono de checkout, suporte simples e retomada tardia em todos os canais

## Next fixes

- Expandir o pack para a matriz ampla exigida no aceite, incluindo rudeza, suporte, abandono de checkout, follow-up e conversa longa
- Subir o responder endurecido em producao e repetir o pack contra o backend live
- Conectar uma conta profissional do Instagram na Page atual e rerodar a auditoria do canal oficial
- Reautorizar `pages_messaging`, assinar a Page para Messenger e rerodar a auditoria do canal oficial

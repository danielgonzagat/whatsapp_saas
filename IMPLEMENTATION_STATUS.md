# Implementation Status

Atualizado em `2026-03-19`.

## Concluído

- WAHA-only runtime consolidado para conexão, QR, status, disconnect e logout.
- Catch-up de WhatsApp ao conectar, com lookback configurável e múltiplas passagens por chats.
- Webhook WAHA unificado no `InboundProcessorService`.
- Agendamento de respostas por contato (`scan-contact`) com debounce para evitar múltiplas respostas por mensagem.
- Worker com fallback explícito: quando o Unified Agent gera texto e nenhuma tool de envio roda, a resposta ainda é enviada ao WhatsApp.
- `send_product_info` agora realmente envia a mensagem ao cliente, com preço e link opcional.
- Scheduler do Autopilot configurável por `AUTOPILOT_CYCLE_CRON` e default frequente para operação contínua.
- Auth Google restaurado e validado.

## Coberto por testes

- Unit tests backend: catch-up, WAHA provider/registry/watchdog, auth, unified agent.
- Unit tests worker: `followup-contact` e `scan-contact`.
- Builds:
  - backend
  - worker
  - frontend typecheck

## Limitações conhecidas

- O build completo do frontend (`next build`) pode demorar ou ficar sem terminar no sandbox atual; `tsc --noEmit` está verde.
- Os testes de backend/worker ainda exibem ruído de Redis (`EPERM 127.0.0.1:6379`) após concluir no sandbox, mas as suítes passam.
- A profundidade máxima do catch-up ainda depende dos limites suportados pela API do WAHA para listagem de mensagens por chat.

## Próximos endurecimentos recomendados

- Expor métricas operacionais do catch-up e do `scan-contact` no painel.
- Persistir estado operacional da sessão em tabela dedicada além de `providerSettings`.
- Evoluir autenticação do frontend para cookies `HttpOnly` em vez de `localStorage`.

# recover-abandoned-cart-whatsapp

Quando um carrinho de checkout abandonar por mais de 30 minutos sem
conversão, a IA do workspace envia uma mensagem de WhatsApp com link de
recovery + cupom de 5% off válido por 24h.

Success criteria:
- recovery_rate ≥ 15% (proporção de carrinhos recuperados em 7 dias após
  envio)
- complaint_rate < 0.01 (proporção de mensagens marcadas como spam ou
  opt-out imediato)

Constraints:
- workspace isolation (cada workspace só envia pros seus próprios
  carrinhos)
- idempotente (cada carrinho dispara no máximo 1 envio em 24h)
- opt-out respeitado (workspace.notifications.whatsappOptIn === false →
  nunca envia)
- desconto do cupom ≤ 5% (gerado dinamicamente por carrinho)
- feature flag: `recover-cart-wa` (default OFF; ramp manual)

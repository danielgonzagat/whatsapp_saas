# CAPABILITY STATUS — Kloel Organism

> Mapa mestre de todas as capacidades do Kloel, seu status atual e verificação em produção.
> Cada entrada segue a Definition of Done completa:
>  - [ ] Registry: entrada no CapabilityRegistry
>  - [ ] Domain Service: mesmo método que UI/API usam
>  - [ ] Intent Router: detecta intent com confidence >= 0.8
>  - [ ] Planner: pede inputs faltantes, confirma se sensível
>  - [ ] Execução real: efeito verificável no DB e na UI
>  - [ ] Eventos: emitidos no event log
>  - [ ] Auditoria: entrada em AuditLog
>  - [ ] Receipt: retornado com todos os campos
>  - [ ] Verbalização: contém ID/link/prova
>  - [ ] Idempotência: repetição em <60s não duplica
>  - [ ] Teste e2e: simula chat → executa → verifica
>  - [ ] Verificado conversando com Kloel real
>
> Legenda:
> - AUSENTE: não existe
> - PARCIAL: existe mas incompleto
> - FALA_MAS_NAO_EXECUTA: responde mas não faz
> - EXECUTA_SEM_PROVA: faz mas não prova
> - EXECUTA_COM_BUG: faz com erro
> - VERIFICADA: funciona no chat real com prova
> - BLOQUEADA: depende de integração externa

## Tier 0 — Auto-consciência (P1)
| ID | Capability | Status | Hash |
|---|---|---|---|
| self.capabilities | Listar capacidades disponíveis | PARCIAL | |
| self.code_access | Ler código do SaaS | AUSENTE | |
| self.schema_introspect | Listar modelos/tabelas | AUSENTE | |
| self.safe_query | Query SQL read-only escopada | AUSENTE | |
| self.conversation_search | Buscar conversas passadas | PARCIAL | |
| self.recent_events | Ler eventos recentes | PARCIAL | |
| self.health_check | Status de serviços/integrações | PARCIAL | |
| self.explain_capability | Explicar uma capacidade | AUSENTE | |

## Tier 1 — Produtos (criar)
| ID | Capability | Status | Hash |
|---|---|---|---|
| products.create | Criar produto | PARCIAL | |
| products.upload_image | Anexar imagem do chat ao produto | AUSENTE | |
| products.set_format | Definir formato (físico/digital/híbrido) | AUSENTE | |
| products.set_sales_config | Configurar preço e pagamentos | AUSENTE | |
| products.set_sales_page | Configurar URL de venda e checkout | AUSENTE | |
| products.set_pixels | Configurar pixels FB/Google | AUSENTE | |
| products.set_shipping | Configurar peso/dimensões/embalagem | AUSENTE | |
| products.set_fulfillment | Configurar entrega/produtor/dropshipping | AUSENTE | |
| products.toggle_affiliates | Habilitar/desabilitar afiliados | AUSENTE | |
| products.review_publish | Revisar e publicar | AUSENTE | |

## Tier 2 — Produtos (editar)
| ID | Capability | Status | Hash |
|---|---|---|---|
| products.update_basic | Editar dados gerais | PARCIAL | |
| products.replace_image | Substituir imagem | AUSENTE | |
| products.update_urls | Editar URLs | PARCIAL | |
| products.toggle_availability | Ativar/desativar venda | AUSENTE | |

## Tier 3 — Planos
| ID | Capability | Status | Hash |
|---|---|---|---|
| plans.create | Criar plano | PARCIAL | |
| plans.update | Editar plano | PARCIAL | |
| plans.upload_image | Upload foto do plano | AUSENTE | |
| plans.set_payment_methods | Cartão/PIX/Boleto | AUSENTE | |
| plans.set_installments | Parcelas | AUSENTE | |
| plans.set_shipping | Frete fixo/variável/grátis | AUSENTE | |
| plans.set_visibility_affiliates | Visível para afiliados | AUSENTE | |
| plans.set_custom_commission | Comissão personalizada | AUSENTE | |
| plans.set_order_bump | Order bump | AUSENTE | |

## Tier 4 — Checkouts
| ID | Capability | Status | Hash |
|---|---|---|---|
| checkouts.create | Criar checkout | PARCIAL | |
| checkouts.update | Editar checkout | PARCIAL | |
| checkouts.set_payment_methods | Métodos de pagamento | AUSENTE | |
| checkouts.set_coupon | Cupom manual/automático | AUSENTE | |
| checkouts.set_timer | Contador | AUSENTE | |
| checkouts.customize_theme | Personalizar visual | AUSENTE | |
| checkouts.link_plans | Vincular planos | AUSENTE | |
| checkouts.set_social_proof | Prova social/depoimentos | AUSENTE | |
| checkouts.set_exit_intent | Popup de saída | AUSENTE | |

## Tier 5 — URLs
| ID | Capability | Status | Hash |
|---|---|---|---|
| urls.add | Adicionar URL | PARCIAL | |
| urls.update | Editar URL | AUSENTE | |
| urls.delete | Remover URL | AUSENTE | |
| urls.toggle_private | URL privada | AUSENTE | |
| urls.toggle_kloel_learn | Kloel aprender com URL | AUSENTE | |
| urls.toggle_kloel_chat | Integrar chat na URL | AUSENTE | |

## Tier 6 — Afiliados e Comissionamento
| ID | Capability | Status | Hash |
|---|---|---|---|
| affiliates.toggle_program | Ativar programa | AUSENTE | |
| affiliates.set_attribution | Modelo de atribuição | AUSENTE | |
| affiliates.set_commission | % comissão | AUSENTE | |
| affiliates.list | Listar afiliados | AUSENTE | |
| affiliates.update_terms | Termos | AUSENTE | |

## Tier 7 — Cupons
| ID | Capability | Status | Hash |
|---|---|---|---|
| coupons.create | Criar cupom | PARCIAL | |
| coupons.update | Editar cupom | AUSENTE | |
| coupons.delete | Excluir cupom | AUSENTE | |
| coupons.link_to_product | Vincular a produto | AUSENTE | |

## Tier 8 — Marketplace e afiliação
| ID | Capability | Status | Hash |
|---|---|---|---|
| marketplace.list | Listar produtos públicos | AUSENTE | |
| marketplace.apply_affiliate | Afiliar-se | AUSENTE | |
| marketplace.get_link | Gerar link de afiliado | AUSENTE | |

## Tier 9 — Vendas reais (CRÍTICO)
| ID | Capability | Status | Hash |
|---|---|---|---|
| sales.create_pix | Criar venda PIX (copia-e-cola + QR) | PARCIAL | |
| sales.create_boleto | Criar venda boleto (PDF + código) | PARCIAL | |
| sales.create_card_link | Link checkout pré-preenchido | PARCIAL | |
| sales.fill_buyer_data | Coletar dados do comprador | AUSENTE | |
| sales.lookup_order | Consultar venda | PARCIAL | |
| sales.refund | Estornar venda | AUSENTE | |

## Tier 10 — Marketing
| ID | Capability | Status | Hash |
|---|---|---|---|
| whatsapp.send | Enviar WhatsApp | PARCIAL | |
| whatsapp.campaign | Campanha WhatsApp | PARCIAL | |
| email.send | Enviar e-mail | PARCIAL | |
| email.campaign | Campanha de e-mail | PARCIAL | |

## Tier 11 — Gestão
| ID | Capability | Status | Hash |
|---|---|---|---|
| sales.list | Listar vendas | PARCIAL | |
| subscriptions.list | Listar assinaturas | AUSENTE | |
| subscriptions.cancel | Cancelar assinatura | AUSENTE | |
| crm.list_pipeline | Pipeline CRM | PARCIAL | |
| crm.move_lead | Mover lead | PARCIAL | |

## Tier 12 — Carteira
| ID | Capability | Status | Hash |
|---|---|---|---|
| wallet.balance | Saldo | PARCIAL | |
| wallet.extract | Extrato | AUSENTE | |
| wallet.withdraw | Solicitar saque | AUSENTE | |
| wallet.anticipation | Antecipação | AUSENTE | |

## Tier 13 — Relatórios
| ID | Capability | Status | Hash |
|---|---|---|---|
| reports.operations | Operações | PARCIAL | |
| reports.abandonments | Abandonos | PARCIAL | |
| reports.subscriptions | Assinaturas | AUSENTE | |
| reports.chargebacks | Estornos | AUSENTE | |

## Tier 14 — Compras (lado comprador)
| ID | Capability | Status | Hash |
|---|---|---|---|
| purchase.create_pix | Comprar por PIX via chat | AUSENTE | |
| purchase.create_boleto | Comprar por boleto via chat | AUSENTE | |
| purchase.create_card | Comprar por cartão via chat | AUSENTE | |

## Tier 15 — Configurações
| ID | Capability | Status | Hash |
|---|---|---|---|
| account.update_personal | Dados pessoais | AUSENTE | |
| account.update_fiscal | Dados fiscais (PF/PJ) | AUSENTE | |
| account.update_address | Endereço fiscal | AUSENTE | |
| account.upload_document | Anexar documentos | AUSENTE | |
| account.update_bank | Dados bancários | AUSENTE | |
| account.set_pix_key | Chave PIX | AUSENTE | |
| ui.toggle_theme | Tema claro/escuro | AUSENTE | |

## Metacapacidades
| ID | Capability | Status | Hash |
|---|---|---|---|
| kloel.explain_decision | Explicar decisão tomada | AUSENTE | |
| kloel.show_audit_log | Mostrar log de ações | AUSENTE | |
| kloel.list_gaps | Listar capacidades faltantes | AUSENTE | |
| kloel.self_diagnose | Auto-diagnóstico | AUSENTE | |

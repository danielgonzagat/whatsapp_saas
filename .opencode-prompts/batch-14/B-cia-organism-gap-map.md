# MISSAO
Mapear, sem editar arquivos, a diferenca entre SaaS funcional e organismo cognitivo CIA usando os artefatos do repo.

# ARQUIVOS PERMITIDOS
Leitura somente:
- docs/implementation/kloel-cia-vision-traceability.md
- docs/implementation/kloel-cia-gap-inventory.md
- docs/implementation/kloel-cia-evidence-ledger.md
- backend/src/kloel/**
- backend/src/inbox/**
- backend/src/marketing/**
- backend/src/meta/**
- backend/src/tiktok/**
- backend/src/whatsapp/**
- .pulse/current/PULSE_PRODUCT_GRAPH.json
- .pulse/current/PULSE_PARITY_GAPS.json

# ARQUIVOS PROIBIDOS
- Qualquer escrita.
- governance/protected.

# PRE-LEITURA OBRIGATORIA
- AGENTS.md
- CODEX.md
- docs/implementation/kloel-cia-session-handoff.md
- docs/implementation/kloel-cia-vision-traceability.md

# COMPORTAMENTO ESPERADO
Produzir stdout com os pontos em que a CIA ainda nao e organismo unificado:
- percepcao inbound por canal;
- politica simbolica e comandos estrategicos;
- outbound por canal;
- inbox/identidade cross-canal;
- chat do dono como mesma CIA.

# COMANDOS DE VALIDACAO PERMITIDOS
- git status --short
- rg/sed/cat nos arquivos permitidos
- node -e read-only sobre JSON PULSE

# CRITERIO DE SUCESSO
Relatorio com paths e recomendacoes de slices pequenos, sem edicao.

# CRITERIO DE FALHA
Editar arquivo, inventar estado, ou propor arquitetura paralela.

# FORMATO DE RELATORIO
- organismo existente verificado
- lacunas por canal
- lacunas do cerebro
- proximos slices seguros

# REGRAS DE SEGURANCA
- nunca imprimir segredo
- nao editar nada

# REGRA DE CONFLITO
Se um arquivo estiver dirty, marque como ocupado e recomende aguardar/revalidar antes de editar.

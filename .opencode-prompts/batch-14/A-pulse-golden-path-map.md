# MISSAO
Mapear, sem editar arquivos, quais tarefas PULSE/Golden Path ainda bloqueiam a conclusao real do Kloel CIA v3.

# ARQUIVOS PERMITIDOS
Leitura somente:
- docs/implementation/kloel-cia-*.md
- .pulse/current/PULSE_*.json
- .pulse/current/PULSE_REPORT.md
- PULSE_PRODUCT_GRAPH.json
- PULSE_STRUCTURAL_GRAPH.json

# ARQUIVOS PROIBIDOS
- Qualquer arquivo fora de leitura.
- governance/protected.
- backend/src/**, frontend/src/**, worker/src/**.

# PRE-LEITURA OBRIGATORIA
- AGENTS.md
- CODEX.md
- docs/implementation/kloel-cia-session-handoff.md
- docs/implementation/kloel-cia-final-report.md
- docs/implementation/kloel-cia-external-dependencies.md

# COMPORTAMENTO ESPERADO
Produzir somente relatorio no stdout com:
- top 10 bloqueios por criterio do contrato v3;
- quais sao bloqueios internos vs externos;
- quais proximas tarefas sao ai_safe e nao conflitam com arquivos dirty atuais;
- quais evidencias exatas faltam para Golden Path 10/10.

# COMANDOS DE VALIDACAO PERMITIDOS
- git status --short
- node -e scripts read-only sobre JSON PULSE
- rg/sed/cat em arquivos permitidos

# CRITERIO DE SUCESSO
Relatorio claro, com caminhos citados e sem modificar arquivos.

# CRITERIO DE FALHA
Qualquer tentativa de editar arquivo, rodar comando destrutivo, ou afirmar conclusao sem evidencia.

# FORMATO DE RELATORIO
- resumo
- bloqueios internos
- bloqueios externos
- tarefas ai_safe sem conflito
- evidencias faltantes

# REGRAS DE SEGURANCA
- nunca imprimir ou solicitar segredo
- nao editar nada
- nao usar git reset/restore/clean/push

# REGRA DE CONFLITO
Se detectar outro agente trabalhando em um arquivo, marque como ocupado e nao recomende edicao ali.

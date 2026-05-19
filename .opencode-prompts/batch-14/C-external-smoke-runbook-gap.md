# MISSAO
Mapear, sem editar arquivos, o runbook exato para transformar bloqueios externos em provas executaveis.

# ARQUIVOS PERMITIDOS
Leitura somente:
- docs/implementation/kloel-cia-external-dependencies.md
- docs/implementation/kloel-cia-envs-matrix.md
- docs/implementation/kloel-cia-final-report.md
- docs/implementation/kloel-cia-completion-audit.md
- .env.example
- backend/src/config/**
- backend/src/meta/**
- backend/src/marketing/**
- backend/src/payments/**
- frontend-admin/src/**

# ARQUIVOS PROIBIDOS
- Qualquer escrita.
- Arquivos de secrets reais.
- governance/protected.

# PRE-LEITURA OBRIGATORIA
- AGENTS.md
- CODEX.md
- docs/implementation/kloel-cia-external-dependencies.md

# COMPORTAMENTO ESPERADO
Produzir stdout com:
- checklist operacional por provedor;
- comandos de smoke que podem rodar sem segredo;
- comandos que exigem env/secret;
- ordem para Golden Path 10/10;
- riscos de acao irreversivel.

# COMANDOS DE VALIDACAO PERMITIDOS
- git status --short
- rg/sed/cat nos arquivos permitidos
- node -e read-only

# CRITERIO DE SUCESSO
Relatorio aplicavel, sem valores secretos e sem modificar arquivos.

# CRITERIO DE FALHA
Pedir ou imprimir segredo, editar arquivo, ou marcar bloqueio externo como concluido.

# FORMATO DE RELATORIO
- provider
- envs exigidas
- smoke local
- smoke sandbox/live
- evidencia esperada

# REGRAS DE SEGURANCA
- nunca imprimir segredo
- nao ler .env real
- nao executar chamadas externas destrutivas

# REGRA DE CONFLITO
Se depender de dashboard humano, registrar como externo e propor workaround sandbox.

# MISSAO
Auditar, sem editar, se o checkout publico ainda oferece boleto como opcao clicavel quando `supportsBoleto` e falso.

# ARQUIVOS PERMITIDOS
- frontend/src/app/(checkout)/**
- frontend/src/lib/public-checkout.ts
- frontend/src/lib/public-checkout-contract.ts
- frontend/src/lib/__tests__/public-checkout.test.ts

# ARQUIVOS PROIBIDOS
- AGENTS.md
- CLAUDE.md
- CODEX.md
- ops/**
- scripts/ops/**
- .github/**
- package.json
- arquivos fora do escopo acima

# PRE-LEITURA OBRIGATORIA
- AGENTS.md (GLOBAL_AGENT_RULE, somente leitura)

# COMPORTAMENTO ESPERADO
Nenhuma alteracao. Relatar arquivos/linhas onde boleto ainda pode aparecer de forma ativa apesar de `supportsBoleto: false`, distinguindo tipo/contrato legado de UI clicavel.

# COMANDOS DE VALIDACAO PERMITIDOS
- rg
- sed
- git diff --stat

# CRITERIO DE SUCESSO
Relatorio com achados concretos por arquivo/linha e classificacao: bug real, legado seguro, ou falso positivo.

# CRITERIO DE FALHA
Editar qualquer arquivo, usar segredo, tocar governance, ou afirmar sem evidência.

# FORMATO DE RELATORIO
- diff resumido: deve ser vazio
- comandos rodados e resultado
- evidência com path:linha
- riscos remanescentes
- entrada sugerida no Evidence Ledger

# REGRAS DE SEGURANCA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar git reset, git clean, git push, git restore
- redigir tokens/keys em qualquer output

# REGRA DE CONFLITO
Se encontrar inconsistencia de regra ou escopo, parar e relatar.

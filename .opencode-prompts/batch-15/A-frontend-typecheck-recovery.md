# MISSAO
Corrigir os erros de `npm --prefix frontend run typecheck -- --pretty false` sem tocar backend, worker, governance ou package files.

# ARQUIVOS PERMITIDOS
- frontend/src/app/(main)/autopilot/**
- frontend/src/app/(main)/cia/**
- frontend/src/components/kloel/auth/**
- frontend/src/components/kloel/chat-container.message-sender.ts
- frontend/src/components/kloel/KloelBrand.tsx
- frontend/src/components/kloel/landing/ThanosSection.tsx
- frontend/src/components/kloel/marketing/**
- frontend/src/components/kloel/sidebar/SidebarRecents.tsx
- frontend/src/hooks/useConversationHistory.tsx
- frontend/src/lib/kloel-conversations.ts

# ARQUIVOS PROIBIDOS
- backend/**
- worker/**
- frontend/package.json
- frontend/package-lock.json
- package.json
- package-lock.json
- ops/**
- scripts/ops/**
- .github/**
- AGENTS.md
- CLAUDE.md
- CODEX.md
- docs/codacy/**
- docs/design/**
- qualquer arquivo fora de ARQUIVOS PERMITIDOS

# PRE-LEITURA OBRIGATORIA
- AGENTS.md
- CODEX.md

# COMPORTAMENTO ESPERADO
- Resolver erros TypeScript de frontend causados por imports perdidos, props opcionais exatas e decomposicoes incompletas.
- Preservar comportamento existente; nao apagar UI para fazer o typecheck passar.
- Restaurar imports/exports reais quando uma decomposicao deixou simbolos fora do arquivo.

# COMANDOS DE VALIDACAO PERMITIDOS
- npm --prefix frontend run typecheck -- --pretty false
- npx prettier --check <arquivos frontend tocados>
- npx prettier --write <arquivos frontend tocados>
- rg/sed/cat em arquivos permitidos
- git status --short

# CRITERIO DE SUCESSO
- `npm --prefix frontend run typecheck -- --pretty false` sai 0 ou, se backend/worker estiverem dirty por outro agente, pelo menos todos os erros frontend originalmente listados neste prompt ficam resolvidos e a lista restante e explicitamente reportada.

# CRITERIO DE FALHA
- Tocar arquivo proibido.
- Usar `git reset`, `git restore`, `git clean`, force push, supressoes de typecheck/lint, `as any`, `@ts-ignore`, `@ts-expect-error`.
- Apagar componentes ou botoes para silenciar erro.

# FORMATO DE RELATORIO
- diff resumido
- comandos rodados e resultado
- erros corrigidos
- erros remanescentes
- riscos remanescentes

# REGRAS DE SEGURANCA
- Nunca imprimir segredo.
- Nao ler `.env`.
- Nao alterar governance/protected.

# REGRA DE CONFLITO
Se notar que outro processo editou o mesmo arquivo durante a execucao, parar e relatar o arquivo conflitado.

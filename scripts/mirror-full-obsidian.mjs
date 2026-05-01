#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative } from 'path';

const BASE = '/Users/danielpenin/whatsapp_saas';
const OUT = '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo';

let totalFiles = 0;
let totalLines = 0;

function mkdir(path) {
  mkdirSync(path, { recursive: true });
}

function readAllFiles(dir, exts = /\.(tsx?|jsx?|css|json|mjs|cjs|toml|yml|yaml|md|html|svg)$/) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (
        e.isDirectory() &&
        ![
          'node_modules',
          '.next',
          '.vercel',
          '__tests__',
          '.git',
          'test-results',
          'playwright-report',
          'public',
          '.DS_Store',
        ].includes(e.name) &&
        !e.name.endsWith('-snapshots')
      ) {
        results.push(...readAllFiles(full, exts));
      } else if (
        e.isFile() &&
        exts.test(e.name) &&
        !e.name.startsWith('.') &&
        e.name !== 'package-lock.json' &&
        e.name !== 'tsconfig.tsbuildinfo'
      ) {
        results.push(full);
      }
    }
  } catch (err) {
    console.error(`Error reading ${dir}: ${err.message}`);
  }
  return results;
}

function mirrorGeneric(srcPath, mirrorPath, tag) {
  const content = readFileSync(srcPath, 'utf-8');
  const relPath = srcPath.replace(BASE + '/', '');
  const fileName = basename(srcPath);
  const ext = extname(srcPath).replace('.', '');
  const lang =
    {
      ts: 'ts',
      tsx: 'tsx',
      js: 'js',
      jsx: 'jsx',
      css: 'css',
      json: 'json',
      mjs: 'js',
      cjs: 'js',
      toml: 'toml',
      yml: 'yaml',
      yaml: 'yaml',
      md: 'md',
      html: 'html',
      svg: 'xml',
    }[ext] || 'text';

  const md = `---
tags: [${tag}, espelho]
source: ${relPath}
type: ${tag}
---

# \`${fileName}\`

## Visao Geral

Arquivo do modulo \`${tag}\`. Localizado em \`${relPath}\`.

---

## Codigo Fonte

\`\`\`${lang}
${content}
\`\`\`
`;
  mkdir(dirname(mirrorPath));
  writeFileSync(mirrorPath, md, 'utf-8');
  totalFiles++;
  totalLines += content.split('\n').length;
}

// ==================== PART A: frontend-admin ====================

const ADMIN_PAGES = {
  'page.tsx':
    'Dashboard — Painel God View. Metricas globais de toda a plataforma (GMV, usuarios, transacoes, vendas). Charts de receita, breakdowns, period filters.',
  clientes:
    'Gestao de Clientes — Listagem/busca de todos os clientes da plataforma. Filtros, bulk actions, export.',
  contas:
    'Gestao de Contas — Workspaces da plataforma. Detalhes de conta, status, KYC verification, plano.',
  carteira:
    'Monitoramento de Carteiras — Saldo, transacoes financeiras, withdrawal requests, antecipacoes.',
  produtos:
    'Moderacao de Produtos — Aprovar/rejeitar produtos publicados. Analise de qualidade, compliance.',
  relatorios:
    'Geracao de Relatorios — Reports customizados com filtros por periodo, workspace, tipo.',
  configuracoes:
    'Gestao de Configuracoes — Configuracoes globais da plataforma, feature flags, rate limits.',
  operacoes:
    'Operacoes Destrutivas — Bulk delete, data purge, account suspension, platform-wide operations.',
  audit:
    'Audit Log Viewer — Visualizacao de logs de auditoria imutaveis. Filtros por usuario, workspace, acao, periodo.',
  chat: 'Admin AI Chat — Interface de chat com IA para admins diagnosticarem e operarem a plataforma.',
  compliance:
    'Compliance Dashboard — Monitoramento de conformidade regulatoria, KYC pendente, documentos.',
  vendas: 'Monitoramento de Vendas — Pipeline de vendas, funis, conversao, revenue tracking.',
  marketing: 'Marketing Dashboard — Campanhas ativas, canais, metricas de aquisicao.',
  perfil: 'Perfil do Admin — Dados do usuario admin logado, preferencias.',
};

function buildAdminPageDoc(pageName, filePath, content) {
  const relPath = filePath.replace(BASE + '/', '');
  const desc = ADMIN_PAGES[pageName] || `Pagina administrativa — ${pageName}`;
  const fileName = basename(filePath);
  const isDynamic = filePath.includes('[');

  return `---
tags: [frontend-admin, admin-page, espelho]
source: ${relPath}
type: admin-page
pagina: ${pageName}
dynamic_route: ${isDynamic ? 'sim' : 'nao'}
---

# ${pageName} — Pagina Admin

## Comportamento

${desc}

## Rota

\`${relPath.replace('src/app/', '').replace('/page.tsx', '').replace('(admin)/', '')}\`

## Componentes Envolvidos

- Layout admin (sidebar + topbar)
- API clients: \`admin-*-api.ts\`
- Componentes UI compartilhados

## Estados

- **Loading**: Skeleton/spinner enquanto dados carregam
- **Empty**: Estado honesto quando nao ha dados
- **Error**: Toast/alert com mensagem de erro
- **Success**: Dados renderizados com actions disponiveis

---

## Codigo Fonte

\`\`\`tsx
${content}
\`\`\`
`;
}

function mirrorFrontendAdmin() {
  console.log('\n=== PART A: frontend-admin ===\n');
  const srcDir = join(BASE, 'frontend-admin');
  const files = readAllFiles(srcDir, /\.(tsx?|css|json|mjs|cjs|js)$/);

  for (const file of files) {
    const relFile = relative(srcDir, file);
    const outPath = join(
      OUT,
      'frontend-admin',
      relFile.replace(/\.(tsx?|css|json|mjs|cjs|js)$/, '.md'),
    );
    const content = readFileSync(file, 'utf-8');
    const relPath = file.replace(BASE + '/', '');
    const fileName = basename(file);

    let md;
    // Admin pages get behavioral documentation
    if (file.includes('/(admin)/') && file.endsWith('page.tsx')) {
      const pageName = dirname(file).split('/').pop();
      md = buildAdminPageDoc(pageName, file, content);
    } else if (
      file.includes('/login/') ||
      file.includes('/mfa/') ||
      file.includes('/change-password/')
    ) {
      const authName = file.includes('/login/')
        ? 'login'
        : file.includes('/mfa/')
          ? 'mfa'
          : 'change-password';
      md = `---
tags: [frontend-admin, admin-auth, espelho]
source: ${relPath}
type: admin-auth
auth_page: ${authName}
---

# ${fileName} — Admin Auth (${authName === 'mfa' ? 'MFA' : authName === 'login' ? 'Login' : 'Troca de Senha'})

## Comportamento

${authName === 'login' ? 'Tela de login do admin com validacao de credenciais e suporte a MFA.' : authName === 'mfa' ? 'Tela de verificacao MFA (TOTP) e setup de autenticador.' : 'Tela de troca de senha obrigatoria apos primeiro login.'}

---

## Codigo Fonte

\`\`\`tsx
${content}
\`\`\`
`;
    } else {
      const ext = extname(file).replace('.', '');
      const lang =
        { ts: 'ts', tsx: 'tsx', css: 'css', json: 'json', mjs: 'js', cjs: 'js', js: 'js' }[ext] ||
        'text';
      const tag = file.includes('/api/')
        ? 'admin-api'
        : file.includes('/auth/')
          ? 'admin-auth'
          : file.includes('/components/')
            ? 'admin-component'
            : file.includes('/lib/')
              ? 'admin-lib'
              : file.includes('middleware')
                ? 'admin-middleware'
                : 'frontend-admin';
      md = `---
tags: [frontend-admin, ${tag}, espelho]
source: ${relPath}
type: ${tag}
---

# \`${fileName}\`

## Visao Geral

Arquivo do modulo frontend-admin. Localizado em \`${relPath}\`.

---

## Codigo Fonte

\`\`\`${lang}
${content}
\`\`\`
`;
    }

    mkdir(dirname(outPath));
    writeFileSync(outPath, md, 'utf-8');
    totalFiles++;
    totalLines += content.split('\n').length;
    console.log(`  [admin] ${relFile}`);
  }
  console.log(`\n  frontend-admin: ${files.length} files`);
}

// ==================== PART B: e2e ====================

function buildSpecDoc(specPath, content, dir) {
  const relPath = specPath.replace(BASE + '/', '');
  const fileName = basename(specPath);
  const name = fileName.replace('.spec.ts', '').replace('.ts', '');

  // Extract describe/it names for documentation
  const describes = [];
  const its = [];
  const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const itRegex = /it\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = describeRegex.exec(content)) !== null) describes.push(m[1]);
  while ((m = itRegex.exec(content)) !== null) its.push(m[1]);

  // Extract imports to determine pages covered
  const pageImports = [];
  const pageRegex =
    /from\s+['"`]\.\.?\/[^'"]*page[^'"]*['"`]|await\s+page\.goto\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = pageRegex.exec(content)) !== null) {
    if (m[1]) pageImports.push(m[1]);
  }

  return `---
tags: [e2e, test-spec, espelho]
source: ${relPath}
type: e2e-spec
spec_name: ${name}
scenarios: ${describes.length}
assertions: ${its.length}
---

# ${fileName} — E2E Spec

## Cenario Principal

${describes.length > 0 ? describes.map((d, i) => `${i + 1}. **${d}**`).join('\n') : '_(descreve block ausente)_'}

## Assercoes (${its.length})

${its.length > 0 ? its.map((t, i) => `${i + 1}. ${t}`).join('\n') : '_(assertions ausentes)_'}

## Paginas Cobertas

${
  pageImports.length > 0
    ? pageImports
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((p) => `- \`${p}\``)
        .join('\n')
    : '_(paginas detectadas via URL goto)_'
}

## Categoria

${dir === 'specs' ? 'Teste funcional E2E' : dir === 'visual' ? 'Teste visual/regressao' : 'Root spec'}
${specPath.includes('fake-waha') ? '**Fake WAHA** — Servidor mock para testes de WhatsApp.' : ''}

---

## Codigo Fonte

\`\`\`typescript
${content}
\`\`\`
`;
}

function mirrorE2E() {
  console.log('\n=== PART B: e2e ===\n');
  const srcDir = join(BASE, 'e2e');
  const files = readAllFiles(srcDir, /\.(tsx?|jsx?|js|json|md|yml)$/);

  for (const file of files) {
    const relFile = relative(srcDir, file);
    const outPath = join(OUT, 'e2e', relFile.replace(/\.(tsx?|jsx?|js|json|md|yml)$/, '.md'));
    const content = readFileSync(file, 'utf-8');
    const relPath = file.replace(BASE + '/', '');
    const dir = file.includes('/specs/')
      ? 'specs'
      : file.includes('/visual/')
        ? 'visual'
        : file.includes('/fake-waha/')
          ? 'fake-waha'
          : 'e2e-root';
    const fileName = basename(file);

    let md;
    if (file.endsWith('.spec.ts') || file.endsWith('.spec.tsx')) {
      md = buildSpecDoc(file, content, dir);
    } else if (file.includes('playwright.config.ts')) {
      md = `---
tags: [e2e, config, espelho]
source: ${relPath}
type: e2e-config
---

# playwright.config.ts

## Visao Geral

Configuracao do Playwright para execucao de testes E2E no KLOEL.

## Projetos Configurados

- **chromium**: Navegador Chromium para testes
- **webServer**: Servidor de desenvolvimento para testes locais
- **Retries**: Politica de retry para CI
- **Workers**: Paralelizacao de specs

---

## Codigo Fonte

\`\`\`typescript
${content}
\`\`\`
`;
    } else if (file.includes('fake-waha') && file.endsWith('Dockerfile')) {
      md = `---
tags: [e2e, fake-waha, docker, espelho]
source: ${relPath}
type: e2e-docker
---

# Dockerfile — Fake WAHA

## Visao Geral

Dockerfile para o servidor mock WAHA usado em testes E2E. Simula um provedor WhatsApp para testes sem depender de WAHA real.

---

## Codigo Fonte

\`\`\`dockerfile
${content}
\`\`\`
`;
    } else if (file.includes('fake-waha') && file.endsWith('server.js')) {
      md = `---
tags: [e2e, fake-waha, server, espelho]
source: ${relPath}
type: e2e-fake-server
---

# ${fileName} — Fake WAHA Server

## Visao Geral

Servidor mock que implementa a API do WAHA para testes E2E. Simula endpoints de sessao, QR code, mensagens e status.

## Endpoints Mockados

- Sessao WhatsApp (status, QR, start/stop)
- Mensagens recebidas/envio
- Webhooks

---

## Codigo Fonte

\`\`\`javascript
${content}
\`\`\`
`;
    } else {
      const ext = extname(file).replace('.', '');
      const lang =
        { ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', json: 'json', md: 'md', yml: 'yaml' }[ext] ||
        'text';
      md = `---
tags: [e2e, ${dir}, espelho]
source: ${relPath}
type: ${dir}
---

# \`${fileName}\`

## Visao Geral

Arquivo auxiliar de testes E2E. Localizado em \`${relPath}\`.

---

## Codigo Fonte

\`\`\`${lang}
${content}
\`\`\`
`;
    }

    mkdir(dirname(outPath));
    writeFileSync(outPath, md, 'utf-8');
    totalFiles++;
    totalLines += content.split('\n').length;
    console.log(`  [e2e] ${relFile}`);
  }
  console.log(`\n  e2e: ${files.length} files`);
}

// ==================== PART C: docs ====================

function mirrorDocs() {
  console.log('\n=== PART C: docs ===\n');
  const srcDir = join(BASE, 'docs');
  const files = readAllFiles(srcDir, /\.(md|json|yml|yaml|tsx?)$/);

  for (const file of files) {
    const relFile = relative(srcDir, file);
    const outPath = join(OUT, 'docs', relFile);
    const content = readFileSync(file, 'utf-8');
    const relPath = file.replace(BASE + '/', '');
    const fileName = basename(file);

    let md;
    if (file.endsWith('.md')) {
      // Docs that are already .md files: copy with added frontmatter
      const dir = file.includes('/adr/')
        ? 'adr'
        : file.includes('/ai/')
          ? 'ai'
          : file.includes('/design/')
            ? 'design'
            : file.includes('/runbooks/')
              ? 'runbooks'
              : file.includes('/security/')
                ? 'security'
                : file.includes('/plans/')
                  ? 'plans'
                  : file.includes('/deployment/')
                    ? 'deployment'
                    : file.includes('/compliance/')
                      ? 'compliance'
                      : file.includes('/monitoring/')
                        ? 'monitoring'
                        : file.includes('/codacy/')
                          ? 'codacy'
                          : file.includes('/superpowers/')
                            ? 'superpowers'
                            : file.includes('/production-hardening/')
                              ? 'production-hardening'
                              : file.includes('/audits/')
                                ? 'audits'
                                : file.includes('/devtools/')
                                  ? 'devtools'
                                  : file.includes('/marketing/')
                                    ? 'marketing'
                                    : 'docs';
      md = `---
tags: [docs, ${dir}, espelho]
source: ${relPath}
type: ${dir}
---

${content}`;
    } else {
      const ext = extname(file).replace('.', '');
      const lang = { ts: 'ts', tsx: 'tsx', json: 'json', yml: 'yaml', yaml: 'yaml' }[ext] || 'text';
      md = `---
tags: [docs, espelho]
source: ${relPath}
type: docs
---

# \`${fileName}\`

---

## Codigo Fonte

\`\`\`${lang}
${content}
\`\`\`
`;
    }

    mkdir(dirname(outPath));
    writeFileSync(outPath, md, 'utf-8');
    totalFiles++;
    totalLines += content.split('\n').length;
    console.log(`  [docs] ${relFile}`);
  }
  console.log(`\n  docs: ${files.length} files`);
}

// ==================== PART D: root config files ====================

const ROOT_CONFIGS = [
  { file: '.editorconfig', tag: 'config' },
  { file: '.prettierrc.json', tag: 'config' },
  { file: '.cspell.json', tag: 'config' },
  { file: 'biome.json', tag: 'config' },
  { file: 'commitlint.config.cjs', tag: 'config' },
  { file: 'codecov.yml', tag: 'ci' },
  { file: 'knip.json', tag: 'config' },
  { file: 'pulse.manifest.json', tag: 'pulse' },
  { file: 'railway.toml', tag: 'deploy' },
  { file: 'ratchet.json', tag: 'quality' },
  { file: '.markdownlint.json', tag: 'quality' },
  { file: '.markdownlint-cli2.yaml', tag: 'quality' },
];

function mirrorRootConfigs() {
  console.log('\n=== PART D: root configs ===\n');

  for (const { file, tag } of ROOT_CONFIGS) {
    const srcPath = join(BASE, file);
    try {
      const content = readFileSync(srcPath, 'utf-8');
      const outPath = join(OUT, 'config', file + '.md');
      const ext = extname(file).replace('.', '');
      const lang =
        {
          json: 'json',
          yml: 'yaml',
          yaml: 'yaml',
          toml: 'toml',
          cjs: 'js',
          editorconfig: 'ini',
        }[ext] || ext;

      const md = `---
tags: [config, ${tag}, espelho]
source: ${file}
type: config
file: ${file}
---

# \`${file}\`

## Visao Geral

Arquivo de configuracao do monorepo KLOEL.

---

## Conteudo

\`\`\`${lang}
${content}
\`\`\`
`;
      mkdir(dirname(outPath));
      writeFileSync(outPath, md, 'utf-8');
      totalFiles++;
      totalLines += content.split('\n').length;
      console.log(`  [config] ${file}`);
    } catch (err) {
      console.log(`  [SKIP] ${file}: ${err.message}`);
    }
  }

  // Also mirror .release-please files
  const rpFiles = ['.release-please-manifest.json', 'release-please-config.json'];
  for (const file of rpFiles) {
    try {
      const srcPath = join(BASE, file);
      const content = readFileSync(srcPath, 'utf-8');
      const outPath = join(OUT, 'config', file + '.md');
      const md = `---
tags: [config, release, espelho]
source: ${file}
type: release-config
file: ${file}
---

# \`${file}\`

## Visao Geral

Configuracao do Release Please para versionamento automatico.

---

## Conteudo

\`\`\`json
${content}
\`\`\`
`;
      mkdir(dirname(outPath));
      writeFileSync(outPath, md, 'utf-8');
      totalFiles++;
      totalLines += content.split('\n').length;
      console.log(`  [config] ${file}`);
    } catch (err) {
      console.log(`  [SKIP] ${file}: ${err.message}`);
    }
  }

  // Mirror Docker files
  console.log('\n=== DOCKER FILES ===\n');
  const dockerFiles = readAllFiles(join(BASE, 'docker'), /.*/);
  for (const file of dockerFiles) {
    const relFile = relative(join(BASE, 'docker'), file);
    const outPath = join(OUT, 'docker', relFile + '.md');
    const content = readFileSync(file, 'utf-8');
    const md = `---
tags: [docker, espelho]
source: docker/${relFile}
type: docker
---

# \`${relFile}\`

## Visao Geral

Arquivo Docker do monorepo KLOEL.

---

## Conteudo

\`\`\`dockerfile
${content}
\`\`\`
`;
    mkdir(dirname(outPath));
    writeFileSync(outPath, md, 'utf-8');
    totalFiles++;
    totalLines += content.split('\n').length;
    console.log(`  [docker] ${relFile}`);
  }

  // Mirror nginx files
  console.log('\n=== NGINX FILES ===\n');
  const nginxFiles = readAllFiles(join(BASE, 'nginx'), /.*/);
  for (const file of nginxFiles) {
    const relFile = relative(join(BASE, 'nginx'), file);
    const outPath = join(OUT, 'nginx', relFile + '.md');
    const content = readFileSync(file, 'utf-8');
    const md = `---
tags: [nginx, espelho]
source: nginx/${relFile}
type: nginx
---

# \`${relFile}\`

## Visao Geral

Configuracao NGINX do monorepo KLOEL.

---

## Conteudo

\`\`\`nginx
${content}
\`\`\`
`;
    mkdir(dirname(outPath));
    writeFileSync(outPath, md, 'utf-8');
    totalFiles++;
    totalLines += content.split('\n').length;
    console.log(`  [nginx] ${relFile}`);
  }

  // Mirror docker-compose files
  console.log('\n=== DOCKER COMPOSE ===\n');
  const composeFiles = ['docker-compose.yml', 'docker-compose.prod.yml', 'docker-compose.test.yml'];
  for (const file of composeFiles) {
    try {
      const srcPath = join(BASE, file);
      const content = readFileSync(srcPath, 'utf-8');
      const outPath = join(OUT, 'docker', file + '.md');
      const md = `---
tags: [docker, compose, espelho]
source: ${file}
type: docker-compose
---

# \`${file}\`

## Visao Geral

Docker Compose do monorepo KLOEL.

---

## Conteudo

\`\`\`yaml
${content}
\`\`\`
`;
      mkdir(dirname(outPath));
      writeFileSync(outPath, md, 'utf-8');
      totalFiles++;
      totalLines += content.split('\n').length;
      console.log(`  [compose] ${file}`);
    } catch (err) {
      console.log(`  [SKIP] ${file}: ${err.message}`);
    }
  }

  // Mirror package.json at root
  console.log('\n=== PACKAGE.JSON ===\n');
  try {
    const pkgPath = join(BASE, 'package.json');
    const content = readFileSync(pkgPath, 'utf-8');
    const outPath = join(OUT, 'config', 'package.json.md');
    const md = `---
tags: [config, package, espelho]
source: package.json
type: package-root
---

# package.json (Root)

## Visao Geral

Package.json raiz do monorepo KLOEL. Scripts de build, lint, test, deploy, e governance.

---

## Conteudo

\`\`\`json
${content}
\`\`\`
`;
    mkdir(dirname(outPath));
    writeFileSync(outPath, md, 'utf-8');
    totalFiles++;
    totalLines += content.split('\n').length;
    console.log(`  [config] package.json (root)`);
  } catch (err) {
    console.log(`  [SKIP] package.json: ${err.message}`);
  }
}

// ==================== MAIN ====================

console.log('========================================');
console.log('  KLOEL FULL OBSIDIAN MIRROR');
console.log('========================================');

mirrorFrontendAdmin();
mirrorE2E();
mirrorDocs();
mirrorRootConfigs();

console.log('\n========================================');
console.log(`  TOTAL FILES: ${totalFiles}`);
console.log(`  TOTAL LINES: ${totalLines}`);
console.log(`  OUTPUT: ${OUT}`);
console.log('========================================');

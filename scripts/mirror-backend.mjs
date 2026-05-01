#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename, extname } from 'path';

const SRC = '/Users/danielpenin/whatsapp_saas/backend/src';
const VAULT = '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/Backend';

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function moduleName(path) {
  // Get the module name from the path relative to src
  const rel = relative(SRC, path);
  const parts = rel.split('/');
  return parts[0];
}

function formatClassName(fileName) {
  // Remove extension
  const base = basename(fileName, '.ts');
  // kebab-case to PascalCase approximation
  return base;
}

function extractExports(content) {
  const lines = [];
  let inBlock = false;
  let blockType = '';
  let braceDepth = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Track class/interface/enum/type declarations
    const classMatch = trimmed.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
    const interfaceMatch = trimmed.match(/^(export\s+)?interface\s+(\w+)/);
    const enumMatch = trimmed.match(/^(export\s+)?enum\s+(\w+)/);
    const typeMatch = trimmed.match(/^(export\s+)?type\s+(\w+)\s*=/);
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
    const constExport = trimmed.match(/^(export\s+)?const\s+(\w+)(\s*[=:])/);

    if (classMatch) {
      const name = classMatch[3];
      const isAbstract = classMatch[2] ? '**(abstrata)** ' : '';
      const extendsMatch = trimmed.match(/extends\s+(\w+)/);
      const implementsMatch = trimmed.match(/implements\s+(.+?)\s*\{/);

      let sig = `### class ${name}`;
      if (isAbstract) sig = `### ${isAbstract}class ${name}`;
      if (extendsMatch) sig += ` extends [[${extendsMatch[1]}]]`;
      if (implementsMatch)
        sig += ` implements ${implementsMatch[1]
          .split(',')
          .map((i) => `[[${i.trim()}]]`)
          .join(', ')}`;
      lines.push('');
      lines.push(sig);
      continue;
    }

    if (interfaceMatch) {
      lines.push('');
      lines.push(`### interface [[${interfaceMatch[2]}]]`);
      continue;
    }

    if (enumMatch) {
      lines.push('');
      lines.push(`### enum [[${enumMatch[2]}]]`);
      continue;
    }

    if (typeMatch) {
      lines.push('');
      lines.push(`### type [[${typeMatch[2]}]]`);
      continue;
    }

    if (funcMatch) {
      lines.push('');
      lines.push(`### function [[${funcMatch[3]}]]`);
      continue;
    }

    if (constExport) {
      const name = constExport[2];
      if (
        ['@', '=', ':'].some((c) => (constExport[3] || '').includes(c)) ||
        trimmed.includes('=>')
      ) {
        lines.push('');
        lines.push(`### const [[${name}]]`);
      }
      continue;
    }
  }

  return lines.join('\n');
}

function extractMethodSignatures(content) {
  const lines = [];
  const methodRegex =
    /^\s*(@\w[^)]*\)\s*\n)?\s*(public\s+|private\s+|protected\s+)?(static\s+)?(async\s+)?(\w+)\s*\([^)]*\)\s*(:\s*\w+(\[\])?(<[^>]*>)?)?\s*\{/gm;
  // Simpler approach: find lines that look like method definitions
  const contentLines = content.split('\n');

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i].trim();
    // Decorator
    if (line.startsWith('@') && i + 1 < contentLines.length) {
      const nextLine = contentLines[i + 1].trim();
      if (nextLine.match(/^(public\s+|private\s+|protected\s+)?(static\s+)?(async\s+)?\w+\s*\(/)) {
        const decoClean = line
          .replace(/@Injectable\(\)/g, '@Injectable')
          .replace(/@Controller\([^)]*\)/g, '@Controller')
          .replace(/@Get\([^)]*\)/g, '@Get')
          .replace(/@Post\([^)]*\)/g, '@Post')
          .replace(/@Put\([^)]*\)/g, '@Put')
          .replace(/@Delete\([^)]*\)/g, '@Delete')
          .replace(/@Patch\([^)]*\)/g, '@Patch')
          .replace(/@Module\([^)]*\)/g, '@Module')
          .replace(/@UseGuards\([^)]*\)/g, '@UseGuards')
          .replace(/@UseInterceptors\([^)]*\)/g, '@UseInterceptors')
          .replace(/@Api[^)]*\)/g, (match) => match.split('(')[0].trim())
          .replace(/@Is[^)]*\)/g, '')
          .replace(/@ValidateNested\([^)]*\)/g, '')
          .replace(/@Transform\([^)]*\)/g, '')
          .replace(/@Type\([^)]*\)/g, '')
          .replace(/@Min\([^)]*\)/g, '')
          .replace(/@Max\([^)]*\)/g, '')
          .replace(/@IsNotEmpty\(\)/g, '')
          .replace(/@IsOptional\(\)/g, '')
          .replace(/@IsString\(\)/g, '')
          .replace(/@IsNumber\(\)/g, '')
          .replace(/@IsBoolean\(\)/g, '')
          .replace(/@IsArray\(\)/g, '')
          .replace(/@IsObject\(\)/g, '')
          .replace(/@IsEnum\([^)]*\)/g, '')
          .replace(/@IsDate\(\)/g, '')
          .replace(/@IsUUID\(\)/g, '')
          .replace(/@IsEmail\(\)/g, '')
          .replace(/@IsUrl\(\)/g, '')
          .replace(/@IsInt\(\)/g, '')
          .replace(/@IsPositive\(\)/g, '')
          .replace(/@IsDefined\(\)/g, '')
          .replace(/@Matches\([^)]*\)/g, '')
          .replace(/@ArrayMinSize\([^)]*\)/g, '')
          .replace(/@ArrayMaxSize\([^)]*\)/g, '')
          .replace(/@Length\([^)]*\)/g, '')
          .replace(/@MaxLength\([^)]*\)/g, '')
          .replace(/@MinLength\([^)]*\)/g, '')
          .replace(/@Allow\(\)/g, '')
          .replace(/@ApiProperty\([^)]*\)/g, '')
          .replace(/@ApiOperation\([^)]*\)/g, '')
          .replace(/@ApiResponse\([^)]*\)/g, '')
          .replace(/@ApiTags\([^)]*\)/g, '')
          .replace(/@ApiBearerAuth\(\)/g, '')
          .replace(/@Header\([^)]*\)/g, '')
          .replace(/@HttpCode\([^)]*\)/g, '')
          .replace(/@Redirect\([^)]*\)/g, '')
          .replace(/@Req\(\)/g, '')
          .replace(/@Res\(\)/g, '')
          .replace(/@Body\(\)/g, '')
          .replace(/@Param\([^)]*\)/g, '')
          .replace(/@Query\(\)/g, '')
          .replace(/@Headers\([^)]*\)/g, '')
          .replace(/@Inject\([^)]*\)/g, '@Inject')
          .replace(/@Optional\(\)/g, '@Optional')
          .replace(/\s+/g, ' ')
          .trim();
        if (decoClean) lines.push(`  ${decoClean}`);
      }
    }

    // Method signature
    const methodMatch = line.match(
      /^(public\s+|private\s+|protected\s+)?(static\s+)?(async\s+)?(\w+)\s*\(([^)]*)\)\s*(:\s*[\w<>\[\],\s|&]+)?\s*(\{|;)/,
    );
    if (methodMatch) {
      const visibility = (methodMatch[1] || 'public ').trim();
      const isStatic = methodMatch[2] ? 'static ' : '';
      const isAsync = methodMatch[3] ? 'async ' : '';
      const name = methodMatch[4];
      const params = methodMatch[5];
      const returnType = methodMatch[6] ? methodMatch[6].trim() : '';

      // Clean params
      const cleanParams = params
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p)
        .map((p) => {
          // Strip decorators from params
          const clean = p.replace(/@\w+\([^)]*\)\s*/g, '').trim();
          // Strip default values
          return clean.replace(/\s*=\s*[^,]+$/, '');
        })
        .join(', ');

      if (
        name !== 'constructor' &&
        name !== 'if' &&
        name !== 'else' &&
        name !== 'for' &&
        name !== 'while'
      ) {
        const sig = `${visibility} ${isStatic}${isAsync}${name}(${cleanParams})${returnType ? ' ' + returnType : ''}`;
        lines.push(`  \`${sig.trim()}\``);
      }
    }
  }

  return lines.join('\n');
}

// Prisma model mapping for wiki-links
const PRISMA_MODELS = [
  'Account',
  'User',
  'Workspace',
  'Product',
  'Order',
  'Payment',
  'Subscription',
  'WebhookEvent',
  'Wallet',
  'WalletTransaction',
  'LedgerEntry',
  'SplitRule',
  'FraudCheck',
  'BillingEntry',
  'WhatsAppInstance',
  'WhatsAppMessage',
  'Chat',
  'Thread',
  'Lead',
  'Campaign',
  'Flow',
  'FlowVersion',
  'FlowExecution',
  'CheckoutConfig',
  'CheckoutProduct',
  'CheckoutOrder',
  'Coupon',
  'Bump',
  'Upsell',
  'Pixel',
  'SocialLead',
  'MemberArea',
  'MemberModule',
  'MemberEnrollment',
  'Affiliate',
  'AffiliateCommission',
  'Payout',
  'TeamMember',
  'Invite',
  'WorkspaceSettings',
  'KYC',
  'KYCDocument',
  'StripeCustomer',
  'StripePaymentMethod',
  'CRMContact',
  'Pipeline',
  'Deal',
  'MarketingConnect',
  'MarketingSkill',
  'AuditLog',
  'OpsAlert',
  'HealthCheck',
  'ApiKey',
  'Certification',
  'CookieConsent',
  'ComplianceLog',
  'GDPRRequest',
  'Notification',
  'EmailTemplate',
  'CalendarEvent',
  'Report',
  'QueueJob',
  'JobLog',
];

function addPrismaLinks(content) {
  let result = content;
  for (const model of PRISMA_MODELS) {
    const regex = new RegExp(`\\bprisma\\.${model.toLowerCase()}\\b`, 'gi');
    result = result.replace(regex, `prisma.[[${model}]]`);
    // Also catch this.prisma.model
    const regex2 = new RegExp(
      `\\.${model.toLowerCase()}\\.(findMany|findUnique|findFirst|create|update|upsert|delete|count|aggregate|groupBy|createMany|updateMany|deleteMany)`,
      'gi',
    );
    result = result.replace(regex2, (match) => `.${match.split('.')[1]}.${match.split('.')[2]}`);
  }
  return result;
}

function translateContent(content, fileName) {
  // Portuguese module-level description
  const base = basename(fileName, '.ts');

  let moduleDesc = '';
  if (base.includes('controller')) moduleDesc = '**Controller** — gerencia as rotas HTTP da API.\n';
  if (base.includes('service')) moduleDesc = '**Service** — contem a logica de negocio.\n';
  if (base.includes('module'))
    moduleDesc = '**Module** — modulo NestJS que agrupa controllers e providers.\n';
  if (base.includes('guard')) moduleDesc = '**Guard** — protege rotas com regras de autorizacao.\n';
  if (base.includes('interceptor'))
    moduleDesc = '**Interceptor** — intercepta requisicoes/respostas para transformacao.\n';
  if (base.includes('middleware'))
    moduleDesc = '**Middleware** — processa requisicoes antes dos controllers.\n';
  if (base.includes('decorator'))
    moduleDesc = '**Decorator** — decorador customizado para injecao/metadados.\n';
  if (base.includes('pipe')) moduleDesc = '**Pipe** — transforma/valida dados de entrada.\n';
  if (base.includes('dto'))
    moduleDesc = '**DTO** — Data Transfer Object para validacao de entrada/saida.\n';
  if (base.includes('helper')) moduleDesc = '**Helper** — funcoes auxiliares.\n';
  if (base.includes('util')) moduleDesc = '**Util** — utilitarios.\n';
  if (base.includes('type')) moduleDesc = '**Types** — definicoes de tipos TypeScript.\n';
  if (base.includes('gateway'))
    moduleDesc = '**Gateway** — WebSocket gateway para comunicacao em tempo real.\n';
  if (base.includes('engine')) moduleDesc = '**Engine** — motor de regras/processamento.\n';

  return moduleDesc;
}

function processFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const relPath = relative(SRC, filePath);
  const baseFile = basename(filePath, '.ts');
  const fileDir = dirname(relPath);
  const modName = moduleName(filePath);

  // Determine vault output path
  const outDir = join(VAULT, fileDir);
  const outFile = join(outDir, `${baseFile}.md`);

  ensureDir(outDir);

  // Build mirror content
  const lines = [];

  // Title
  lines.push(`---`);
  lines.push(`modulo: [[Backend/${modName}/index|${modName}]]`);
  lines.push(`arquivo: \`${relPath}\``);
  lines.push(`criado: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`---`);
  lines.push('');

  // Module description in PT
  const desc = translateContent(content, baseFile);
  if (desc) lines.push(desc);

  // Summary line count
  const totalLines = content.split('\n').length;
  lines.push(`**Linhas**: ${totalLines}`);
  lines.push('');

  // Imports
  const importLines = content.split('\n').filter((l) => l.trim().startsWith('import '));
  if (importLines.length > 0) {
    lines.push('## Imports');
    lines.push('');
    for (const imp of importLines) {
      const clean = imp
        .trim()
        .replace(/^import\s+/, '')
        .replace(/\s+from\s+/, ' from ');
      lines.push(`- \`${clean}\``);
    }
    lines.push('');
  }

  // Exports / Classes / Interfaces
  const exports = extractExports(content);
  if (exports.trim()) {
    lines.push('## Estrutura');
    lines.push(exports);
    lines.push('');
  }

  // Method signatures
  const methods = extractMethodSignatures(content);
  if (methods.trim()) {
    lines.push('## Metodos');
    lines.push(methods);
    lines.push('');
  }

  // Prisma operations
  const prismaOps = content.match(/prisma\.\w+\.\w+/g) || [];
  const uniqueOps = [...new Set(prismaOps)];
  if (uniqueOps.length > 0) {
    lines.push('## Operacoes Prisma');
    lines.push('');
    for (const op of uniqueOps.sort()) {
      lines.push(`- \`${op}\``);
    }
    lines.push('');
  }

  // Full source for reference
  lines.push('## Codigo Fonte');
  lines.push('');
  lines.push('```typescript');
  lines.push(content);
  lines.push('```');

  writeFileSync(outFile, lines.join('\n'), 'utf8');
  return outFile;
}

// Walk directory recursively
function walkDir(dir, files = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip companion/test dirs
      if (entry === '__companions__' || entry === '__test-support__' || entry === '__tests__')
        continue;
      walkDir(fullPath, files);
    } else if (stat.isFile() && extname(entry) === '.ts') {
      // Skip spec files
      if (entry.includes('.spec.') || entry.includes('.spec-test')) continue;
      files.push(fullPath);
    }
  }
  return files;
}

// Main
console.log('Iniciando espelhamento do backend...');

const files = walkDir(SRC);

console.log(`Encontrados ${files.length} arquivos para processar...`);

let count = 0;
for (const file of files) {
  try {
    const out = processFile(file);
    count++;
    if (count % 20 === 0) console.log(`  Processados ${count}/${files.length}...`);
  } catch (err) {
    console.error(`  ERRO em ${file}: ${err.message}`);
  }
}

// Create index files per module
const modules = [...new Set(files.map((f) => moduleName(f)))];
for (const mod of modules.sort()) {
  const modFiles = files.filter((f) => moduleName(f) === mod);
  const indexLines = [];
  indexLines.push(`---`);
  indexLines.push(`modulo: ${mod}`);
  indexLines.push(`arquivos: ${modFiles.length}`);
  indexLines.push(`criado: ${new Date().toISOString().split('T')[0]}`);
  indexLines.push(`---`);
  indexLines.push('');
  indexLines.push(`# Modulo: ${mod}`);
  indexLines.push('');
  indexLines.push(`## Arquivos`);
  indexLines.push('');

  for (const f of modFiles.sort()) {
    const rel = relative(SRC, f);
    const base = basename(f, '.ts');
    const dir = dirname(rel);
    const displayDir = dir === mod ? '' : `${dir}/`;
    const linkPath = join(VAULT, rel.replace('.ts', '.md'));
    const vaultRel = relative(VAULT, linkPath);
    indexLines.push(`- [[${vaultRel.replace('.md', '')}|${displayDir}${base}]]`);
  }

  const indexDir = join(VAULT, mod);
  ensureDir(indexDir);
  writeFileSync(join(indexDir, 'index.md'), indexLines.join('\n'), 'utf8');
}

console.log(`\nConcluido! ${count} arquivos espelhados.`);
console.log(`${modules.length} modulos com indices.`);

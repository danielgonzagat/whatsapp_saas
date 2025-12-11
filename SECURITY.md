# 🔒 Security Policy - KLOEL WhatsApp SaaS

## Arquitetura de Segurança

O KLOEL implementa segurança em múltiplas camadas para garantir proteção de dados e isolamento multi-tenant.

---

## 🛡️ Multi-Tenancy Security

### WorkspaceGuard

Todas as rotas protegidas utilizam o `WorkspaceGuard` que:

1. **Valida JWT** - Token deve conter `userId` válido
2. **Extrai workspaceId** - Do header `x-workspace-id`, parâmetros ou body
3. **Verifica membership** - Consulta `WorkspaceMember` para validar acesso
4. **Anexa contexto** - Adiciona `workspaceId` e `role` ao request

```typescript
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Get('contacts')
async listContacts(@Req() req) {
  // req.workspaceId está validado e seguro
  return this.contactsService.findAll(req.workspaceId);
}
```

### Queries Sempre Scoped

Todas as queries de banco incluem `workspaceId`:

```typescript
// ✅ CORRETO
await prisma.contact.findMany({
  where: { workspaceId: req.workspaceId }
});

// ❌ NUNCA fazer isso
await prisma.contact.findMany(); // Vaza dados de outros workspaces!
```

---

## 🔐 Autenticação

### JWT (JSON Web Tokens)

- **Algoritmo:** HS256
- **Expiração:** 7 dias (configurável)
- **Refresh Token:** Implementado com rotação
- **Claims:** `sub`, `email`, `workspaces[]`

### Password Hashing

- **Algoritmo:** bcrypt com salt rounds = 12
- **Política:** Mínimo 8 caracteres

### MFA (Futuro)

- TOTP via Google Authenticator
- WebAuthn para hardware keys

---

## 🚫 Rate Limiting

### Global

- **100 requests/minuto** por IP (padrão)

### Endpoints Sensíveis

```typescript
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min
@Post('login')

@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
@Post('subscribe')
```

### Proteção Anti-DDoS

- Nginx rate limiting no edge
- Fail2ban para bloqueio de IPs maliciosos

---

## 🔒 SSRF Protection

Todas as requisições HTTP em flows passam por validação:

```typescript
// worker/utils/ssrf-protection.ts
async function safeRequest(url: string, options: RequestOptions) {
  // Bloqueia IPs internos
  if (isInternalIP(url)) {
    throw new Error('SSRF blocked: internal IP');
  }
  
  // Bloqueia protocolos perigosos
  if (!['http:', 'https:'].includes(new URL(url).protocol)) {
    throw new Error('SSRF blocked: invalid protocol');
  }
  
  // Timeout curto
  return fetch(url, { ...options, timeout: 10000 });
}
```

---

## 🤖 Prompt Injection Defense

Inputs do usuário são sanitizados antes de ir para LLMs:

```typescript
// worker/utils/prompt-sanitizer.ts
function sanitizeUserInput(input: string): string {
  // Remove tentativas de override de sistema
  return input
    .replace(/ignore previous instructions/gi, '')
    .replace(/system:/gi, '')
    .replace(/\<\|.*?\|\>/g, ''); // Remove tokens especiais
}
```

---

## 🗄️ Database Security

### Prisma ORM

- **Parameterized queries** - Previne SQL injection
- **Type-safe** - Validação em compile-time

### Encryption

- **At rest:** PostgreSQL com encryption via filesystem
- **In transit:** TLS 1.3 obrigatório
- **Sensitive fields:** Tokens e API keys hasheados

### Backups

- Snapshots diários automáticos
- Retenção: 30 dias
- Cross-region replication

---

## 🔑 Secrets Management

### Environment Variables

Nunca commit secrets no código:

```bash
# .env (local apenas, NUNCA commitado)
JWT_SECRET=super-secret
STRIPE_SECRET_KEY=sk_live_...
OPENAI_API_KEY=sk-...
```

### Production

- Railway/Vercel secrets management
- AWS Secrets Manager (opcional)
- Vault (enterprise)

---

## 📊 Audit Logging

Todas as ações críticas são logadas:

```typescript
// AuditService
await auditService.log({
  action: 'workspace.settings.update',
  userId: req.user.id,
  workspaceId: req.workspaceId,
  details: { field: 'autopilotEnabled', newValue: true },
  ip: req.ip,
});
```

### Eventos Auditados

- Login/Logout
- Mudanças de configuração
- Criação/deleção de recursos
- Acessos administrativos
- Erros de autorização

---

## 🚨 Incident Response

### Monitoramento

- **Sentry** - Error tracking
- **Prometheus** - Métricas
- **Grafana** - Dashboards
- **AlertManager** - Alertas

### SLA de Resposta

| Severidade | Tempo de Resposta | Exemplo |
|------------|-------------------|---------|
| P0 Critical | 15 min | Data breach, service down |
| P1 High | 1 hora | Authentication failure |
| P2 Medium | 4 horas | Rate limiting bypass |
| P3 Low | 24 horas | Logging gaps |

---

## 🔍 Security Testing

### Automated

- **npm audit** - Dependências vulneráveis
- **ESLint security plugin** - Code patterns
- **Snyk** - Container scanning

### Manual

- Penetration testing trimestral
- Code review focado em security
- Threat modeling para features novas

---

## 📋 Compliance

### LGPD (Lei Geral de Proteção de Dados)

- Consentimento explícito para coleta
- Direito ao esquecimento implementado
- DPO designado
- Relatórios de impacto

### PCI DSS (Payments)

- Stripe handles card data (PCI Level 1)
- Não armazenamos dados de cartão
- Logs de acesso mantidos por 1 ano

---

## 🐛 Reporting Vulnerabilities

Encontrou uma vulnerabilidade? 

**Email:** security@kloel.com.br

**Expectativas:**
- Resposta inicial em 24h
- Triagem em 72h
- Correção conforme severidade
- Reconhecimento público (se desejado)

**Não faça:**
- Acessar dados de outros usuários
- Interromper serviços
- Divulgar antes do fix

---

## 📜 Security Headers

O Nginx adiciona headers de segurança:

```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';";
```

---

## ✅ Security Checklist

Antes de cada deploy:

- [ ] `npm audit` sem vulnerabilidades críticas
- [ ] Secrets rotacionados (se expostos)
- [ ] Rate limiting validado
- [ ] WorkspaceGuard em todas as rotas protegidas
- [ ] Logs de audit funcionando
- [ ] Backups verificados
- [ ] HTTPS forçado
- [ ] Headers de segurança ativos

---

*Última atualização: Janeiro 2025*

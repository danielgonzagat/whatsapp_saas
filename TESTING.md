# 🧪 Testing Guide - KLOEL WhatsApp SaaS

Este documento descreve a estratégia de testes e como executá-los.

---

## 📋 Tipos de Testes

| Tipo | Framework | Cobertura | Localização |
|------|-----------|-----------|-------------|
| Unit Tests | Jest | Services, Guards, Utils | `backend/src/**/*.spec.ts` |
| Integration Tests | Jest + Supertest | Controllers, Modules | `backend/test/` |
| E2E Tests | Playwright | Flows completos | `e2e/` |
| Smoke Tests | Shell Scripts | Endpoints críticos | `scripts/smoke_*.sh` |

---

## 🧪 Unit Tests

### Executar Todos

```bash
cd backend
npm test
```

### Executar Arquivo Específico

```bash
npm test -- autopilot.service.spec.ts
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:cov
```

---

## 🔌 Integration Tests

Testes que verificam integração entre módulos:

```bash
cd backend
npm run test:e2e
```

### Configuração

Os testes de integração usam banco de teste separado:

```env
# .env.test
DATABASE_URL=postgresql://test:test@localhost:5432/kloel_test
```

---

## 🎭 E2E Tests (Playwright)

Testes end-to-end que simulam usuário real:

### Rodar tudo (infra + backend/worker/frontend + E2E)

Este é o jeito mais confiável de rodar E2E local sem flakiness (alinha `DATABASE_URL` e `REDIS_URL` entre backend e worker):

```bash
./scripts/e2e_local.sh
```

Pré-requisitos:
- `docker` (para Postgres/Redis via `docker compose`)
- Portas livres: `3000` (frontend), `3001` (backend), `3003` (worker)

```bash
cd e2e
npm test
```

### Visualizar Testes

```bash
npm test -- --headed
```

### Debug Mode

```bash
npm test -- --debug
```

### Ver Relatório

```bash
npm run report
```

---

## 🔥 Smoke Tests

Scripts rápidos para validar endpoints em produção:

```bash
# Configurar variáveis
export API_BASE=http://localhost:3001
export TOKEN=seu-jwt-token
export WORKSPACE_ID=seu-workspace-id

# Executar todos
./scripts/smoke_all.sh

# Específicos
./scripts/smoke_core.sh
./scripts/smoke_autopilot.sh
```

### Endpoints Testados

| Script | Endpoints |
|--------|-----------|
| `smoke_core.sh` | Health, Auth, Workspaces |
| `smoke_autopilot.sh` | Autopilot config, Process message |
| `smoke_webhooks.sh` | WhatsApp webhooks |

---

## 📦 Testes por Módulo

### AutopilotService

```typescript
// backend/src/autopilot/autopilot.service.spec.ts
describe('AutopilotService', () => {
  it('should detect buy signal intent', async () => {
    const result = await service.analyzeIntent('Quero comprar');
    expect(result.intent).toBe('BUY_SIGNAL');
  });

  it('should respect daily limits', async () => {
    const result = await service.checkContactDailyLimit('ws-1', 'contact-1');
    expect(result.limitReached).toBe(false);
  });
});
```

### SkillEngineService

```typescript
// backend/src/kloel/skill-engine.service.spec.ts
describe('SkillEngineService', () => {
  it('should check real availability', async () => {
    const result = await service.executeSkill('ws-1', 'check_availability', {
      date: '2025-01-20'
    });
    expect(result.data.availableSlots).toBeDefined();
  });

  it('should create appointment', async () => {
    const result = await service.executeSkill('ws-1', 'create_appointment', {
      datetime: '2025-01-20T10:00:00',
      customerPhone: '5511999999999',
      service: 'Consulta'
    });
    expect(result.success).toBe(true);
  });
});
```

### WorkspaceGuard (Multi-tenant Security)

```typescript
// backend/src/common/guards/workspace.guard.spec.ts
describe('WorkspaceGuard', () => {
  it('should block access to other workspace', async () => {
    // User member of ws-1, trying to access ws-2
    const result = await guard.canActivate(contextWithWorkspaceId('ws-2'));
    expect(result).toBe(false);
  });
});
```

### FlowsService

```typescript
// backend/src/flows/flows.service.spec.ts
describe('FlowsService', () => {
  it('should create flow with versioning', async () => {
    const flow = await service.create({ name: 'Test', nodes: [] });
    expect(flow.version).toBe(1);
  });

  it('should execute flow via queue', async () => {
    await service.execute('flow-1', 'ws-1', { contactId: 'c-1' });
    expect(mockQueue.add).toHaveBeenCalled();
  });
});
```

---

## 🎯 Test Coverage Goals

| Módulo | Meta | Atual |
|--------|------|-------|
| AutopilotService | 80% | ~70% |
| SkillEngineService | 80% | ~65% |
| FlowsService | 75% | ~60% |
| WorkspaceGuard | 90% | ~85% |
| BillingService | 80% | ~55% |

---

## 🔧 Configuração Jest

```javascript
// backend/jest.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
```

---

## 🐛 Debugging Tests

### VS Code

Adicione ao `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Current File",
  "program": "${workspaceFolder}/backend/node_modules/.bin/jest",
  "args": ["${relativeFile}", "--config", "jest.config.js"],
  "console": "integratedTerminal",
  "cwd": "${workspaceFolder}/backend"
}
```

### Console Logs

```typescript
it('should debug something', async () => {
  console.log('Debug:', JSON.stringify(result, null, 2));
  expect(result).toBeDefined();
});
```

---

## 📊 Relatórios de Coverage

Após rodar `npm run test:cov`:

```
--------------------------|---------|----------|---------|---------|
File                      | % Stmts | % Branch | % Funcs | % Lines |
--------------------------|---------|----------|---------|---------|
autopilot/               |   72.5  |    65.3  |   78.2  |   71.8  |
  autopilot.service.ts   |   75.2  |    68.1  |   80.0  |   74.5  |
kloel/                   |   68.3  |    61.2  |   72.1  |   67.9  |
  skill-engine.service.ts|   70.1  |    63.5  |   75.0  |   69.2  |
flows/                   |   64.7  |    58.9  |   68.4  |   63.8  |
--------------------------|---------|----------|---------|---------|
```

---

## 🚀 CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: kloel_test
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install & Test Backend
        run: |
          cd backend
          npm ci
          npx prisma generate
          npm run test:cov

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
```

---

## 📝 Escrevendo Bons Testes

### Do's ✅

```typescript
// Nomes descritivos
it('should return 403 when user is not workspace member', async () => {});

// Arrange-Act-Assert
it('should create flow', async () => {
  // Arrange
  const data = { name: 'Test' };
  
  // Act
  const result = await service.create(data);
  
  // Assert
  expect(result.id).toBeDefined();
});

// Testar edge cases
it('should handle empty input gracefully', async () => {});
```

### Don'ts ❌

```typescript
// Testes vagos
it('should work', async () => {}); // ❌

// Múltiplas coisas num teste
it('should create, update, and delete', async () => {}); // ❌

// Depender de estado externo
it('should read from production DB', async () => {}); // ❌
```

---

## 🔄 Mocking Best Practices

```typescript
// Mocks no beforeEach
beforeEach(() => {
  jest.clearAllMocks();
});

// Factory functions para mocks
function createMockPrisma() {
  return {
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
}

// Spy em métodos existentes
jest.spyOn(service, 'sendEmail').mockResolvedValue(true);
```

---

*Última atualização: Janeiro 2025*

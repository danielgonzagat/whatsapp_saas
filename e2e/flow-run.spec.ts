import { test, expect } from '@playwright/test';

test.describe('Flow Execution E2E', () => {
  test('should create and execute a flow', async ({ page }) => {
    // 1. Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('http://localhost:3000/dashboard');

    // 2. Create Flow
    await page.goto('http://localhost:3000/flows');
    await page.click('text=Novo Fluxo');
    await page.fill('input[name="name"]', 'E2E Test Flow');
    await page.click('button:has-text("Criar")');
    
    // Wait for editor
    await expect(page).toHaveURL(/\/flows\/editor\/.*/);

    // 3. Open Test Console
    await page.click('button[aria-label="Testar Fluxo"]');
    
    // 4. Run Flow
    await page.fill('input[placeholder="Telefone (ex: 5511...)"]', '5511999999999');
    await page.click('button:has-text("Iniciar Teste")');

    // 5. Verify Logs
    // Expect to see "Fluxo iniciado" in the console
    await expect(page.locator('.console-logs')).toContainText('Fluxo iniciado');
    // Wait for completion
    await expect(page.locator('.console-logs')).toContainText('COMPLETED', { timeout: 10000 });
  });
});

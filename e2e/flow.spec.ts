import { test, expect } from '@playwright/test';

test('login and create flow', async ({ page }) => {
  // 1. Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');

  // 2. Create Flow
  await page.click('text=Fluxos');
  await page.click('text=Novo Fluxo');
  await page.fill('input[placeholder="Nome do fluxo"]', 'Test Flow E2E');
  await page.click('button:has-text("Criar")');
  
  // 3. Verify Editor
  await expect(page).toHaveURL(/\/dashboard\/flows\/.+/);
  await expect(page.locator('.react-flow')).toBeVisible();
});

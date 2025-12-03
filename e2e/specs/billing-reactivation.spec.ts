import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.E2E_FRONTEND_URL || "http://localhost:3000";
const API_URL = process.env.E2E_API_URL || "http://localhost:3001";
const WORKSPACE_ID = process.env.E2E_WORKSPACE_ID || "workspace-test";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "password";

test.describe("Billing reactivation flow", () => {
  test("no banner and actions enabled when billingSuspended=false", async ({ page, request }) => {
    // Resolve token
    let token = process.env.E2E_API_TOKEN;
    if (!token) {
      const loginRes = await request.post(`${API_URL}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      expect(loginRes.ok()).toBeTruthy();
      const loginJson = await loginRes.json();
      token = loginJson?.access_token;
      expect(token).toBeTruthy();
    }

    // 1) Garanta billingSuspended=false
    const patchRes = await request.post(`${API_URL}/workspace/${WORKSPACE_ID}/settings`, {
      data: { billingSuspended: false },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(patchRes.ok()).toBeTruthy();

    // 2) Login
    await page.goto(`${FRONTEND_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/);

    // 3) Dashboard sem banner de cobrança
    await page.goto(`${FRONTEND_URL}/dashboard`);
    const banner = page.getByText(/Cobrança pendente/i);
    await expect(banner).toHaveCount(0);

    // 4) Botão rodar ciclo deve estar habilitado
    const runButton = page.getByRole("button", { name: /Rodar ciclo agora/i });
    await expect(runButton).toBeEnabled();
  });
});

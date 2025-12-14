import { test, expect } from "@playwright/test";
import { ensureE2EAdmin, getE2EBaseUrls } from "./e2e-helpers";

const { frontendUrl: FRONTEND_URL, apiUrl: API_URL } = getE2EBaseUrls();

test.describe("Billing suspension flow", () => {
  test("banner and blocked actions when billingSuspended", async ({ page, request }) => {
    const { token, workspaceId, email, password } = await ensureE2EAdmin(request);


    try {
      // 1) Força billingSuspended via API (patch workspace settings)
      const patchRes = await request.post(`${API_URL}/workspace/${workspaceId}/settings`, {
        data: { billingSuspended: true },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(patchRes.ok()).toBeTruthy();

      // 1.1) Confirma via API que o status refletiu
      const statusRes = await request.get(
        `${API_URL}/autopilot/status?workspaceId=${workspaceId}`,
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      expect(statusRes.ok()).toBeTruthy();
      const statusJson: any = await statusRes.json();
      expect(statusJson?.billingSuspended).toBe(true);

      // 2) Login no frontend
      await page.goto(`${FRONTEND_URL}/login`);
      await page.fill('input[type="email"]', email);
      await page.click('button[type="submit"]');
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/($|\?)/);

      // 3) Autopilot mostra aviso de cobrança pendente e bloqueia toggle
      await page.goto(`${FRONTEND_URL}/autopilot`);
      await expect(page).toHaveURL(/\/autopilot(\b|\/|\?|$)/, { timeout: 30000 });
      const toggle = page.locator('button.w-32.h-16.rounded-full');
      await expect(toggle).toBeVisible({ timeout: 60000 });
      await expect(page.getByText(/Cobrança pendente/i)).toBeVisible({ timeout: 60000 });
      await expect(toggle).toBeDisabled();

      // 5) Webhook financeiro deve retornar 403
      const financeRes = await request.post(`${API_URL}/hooks/finance/${workspaceId}`, {
        data: { status: "paid", phone: "5511999999999" },
      });
      expect(financeRes.status()).toBe(403);
    } finally {
      // 6) Limpa suspensão para não afetar outros testes (mesmo com falhas/timeouts)
      await request
        .post(`${API_URL}/workspace/${workspaceId}/settings`, {
          data: { billingSuspended: false },
          headers: { authorization: `Bearer ${token}` },
        })
        .catch(() => {});
    }
  });
});

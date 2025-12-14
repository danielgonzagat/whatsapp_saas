import { test, expect } from "@playwright/test";
import { ensureE2EAdmin, getE2EBaseUrls } from "./e2e-helpers";

const { frontendUrl: FRONTEND_URL, apiUrl: API_URL } = getE2EBaseUrls();

test.describe("Billing reactivation flow", () => {
  test("no banner and actions enabled when billingSuspended=false", async ({ page, request }) => {
    const { token, workspaceId, email, password } = await ensureE2EAdmin(request);

    page.on('pageerror', (err) => {
      console.error('[E2E][pageerror]', err);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[E2E][console.error]', msg.text());
    });

    try {
      // 1) Garanta billingSuspended=false
      const patchRes = await request.post(`${API_URL}/workspace/${workspaceId}/settings`, {
        data: { billingSuspended: false },
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
      expect(statusJson?.billingSuspended).toBe(false);

      // 2) Login
      await page.goto(`${FRONTEND_URL}/login`);
      await page.fill('input[type="email"]', email);
      await page.click('button[type="submit"]');
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/($|\?)/);

      // 3) Autopilot sem aviso de cobrança pendente e toggle habilitado
      await page.goto(`${FRONTEND_URL}/autopilot`);
      await expect(page).toHaveURL(/\/autopilot(\b|\/|\?|$)/, { timeout: 30000 });
      const toggle = page.locator('button.w-32.h-16.rounded-full');
      await expect(toggle).toBeVisible({ timeout: 60000 });
      await expect(page.getByText(/Cobrança pendente/i)).toHaveCount(0);
      await expect(toggle).toBeEnabled();
    } finally {
      // Não deixar o workspace em estado sujo.
      await request
        .post(`${API_URL}/workspace/${workspaceId}/settings`, {
          data: { billingSuspended: false },
          headers: { authorization: `Bearer ${token}` },
        })
        .catch(() => {});
    }
  });
});

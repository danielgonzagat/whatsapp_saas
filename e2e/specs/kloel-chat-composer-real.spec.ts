import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  bootstrapAuthenticatedPage,
  ensureE2EAdmin,
  getE2EBaseUrls,
  type E2EAuthContext,
} from './e2e-helpers';

type ThreadMessagePayload = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown> | null;
};

type ProductPayload = {
  id: string;
  name: string;
};

const { apiUrl } = getE2EBaseUrls();
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xx7cAAAAASUVORK5CYII=',
  'base64',
);
const TINY_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'utf8',
);

function authHeaders(auth: Pick<E2EAuthContext, 'token' | 'workspaceId'>) {
  return {
    authorization: `Bearer ${auth.token}`,
    'x-workspace-id': auth.workspaceId,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

async function createFreshAuth(request: APIRequestContext): Promise<E2EAuthContext> {
  return ensureE2EAdmin(request);
}

async function openAuthenticatedChat(page: Page, auth: E2EAuthContext) {
  const { appUrl } = getE2EBaseUrls();
  const composer = page.locator('textarea').first();

  await bootstrapAuthenticatedPage(page, auth, { landingPath: '/chat' });

  const composerReady = await composer
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!composerReady) {
    const emailField = page.getByRole('textbox', { name: 'E-mail' });
    const passwordField = page.getByRole('textbox', { name: 'Senha' });
    const loginVisible = await emailField
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!loginVisible) {
      throw new Error(
        `Chat composer did not render and login form was not available. URL=${page.url()}`,
      );
    }

    await page.getByRole('textbox', { name: 'E-mail' }).fill(auth.email);
    await passwordField.fill(auth.password);

    await Promise.all([
      page.waitForURL(/\/(chat|dashboard|login)/, { timeout: 30_000 }).catch(() => null),
      page.getByRole('button', { name: /^Entrar$/ }).click(),
    ]);

    await page.goto(`${appUrl}/chat`, { waitUntil: 'domcontentloaded' });
  }

  await expect(composer).toBeVisible({ timeout: 30_000 });
}

async function createProduct(
  request: APIRequestContext,
  auth: E2EAuthContext,
  overrides?: Partial<{
    name: string;
    description: string;
    price: number;
    category: string;
    status: string;
  }>,
) {
  const name = overrides?.name || `tmp-e2e-chat-${Date.now()}`;
  const response = await request.post(`${apiUrl}/products`, {
    headers: authHeaders(auth),
    data: {
      name,
      description:
        overrides?.description ||
        'Produto criado pelo teste e2e do chat para validar contexto completo.',
      price: overrides?.price ?? 123.45,
      category: overrides?.category || 'DIGITAL',
      status: overrides?.status || 'APPROVED',
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload?.product || payload?.data || payload;
}

async function deleteProduct(request: APIRequestContext, auth: E2EAuthContext, productId: string) {
  const response = await request.delete(`${apiUrl}/products/${productId}`, {
    headers: authHeaders(auth),
  });

  if (!response.ok() && response.status() !== 404) {
    throw new Error(`Failed to delete test product ${productId}: ${response.status()}`);
  }
}

async function waitForConversationId(page: Page) {
  await expect
    .poll(
      () => {
        const current = new URL(page.url());
        return current.searchParams.get('conversationId');
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();

  return new URL(page.url()).searchParams.get('conversationId') as string;
}

async function fetchThreadMessages(
  request: APIRequestContext,
  auth: E2EAuthContext,
  conversationId: string,
) {
  const response = await request.get(`${apiUrl}/kloel/threads/${conversationId}/messages`, {
    headers: authHeaders(auth),
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

  return data as ThreadMessagePayload[];
}

async function waitForAssistantMessage(
  request: APIRequestContext,
  auth: E2EAuthContext,
  conversationId: string,
  predicate: (message: ThreadMessagePayload) => boolean,
  timeout = 150_000,
) {
  let matched: ThreadMessagePayload | null = null;

  await expect
    .poll(
      async () => {
        const messages = await fetchThreadMessages(request, auth, conversationId);
        matched =
          [...messages]
            .reverse()
            .find((message) => message.role === 'assistant' && predicate(message)) || null;
        return Boolean(matched);
      },
      {
        timeout,
        intervals: [1_000, 2_000, 3_000, 5_000],
      },
    )
    .toBe(true);

  return matched as ThreadMessagePayload;
}

async function openComposerPopover(page: Page) {
  await page.getByRole('button', { name: 'Abrir capacidades do prompt' }).click();
}

async function sendComposerMessage(page: Page, message: string) {
  const textarea = page.locator('textarea').first();
  await textarea.fill(message);
  await textarea.press('Enter');
}

test.describe.serial('Kloel chat real e2e validation', () => {
  let auth: E2EAuthContext;
  const createdProductIds = new Set<string>();

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    auth = await createFreshAuth(request);
    expect(auth.token).toBeTruthy();
    expect(auth.workspaceId).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    for (const productId of [...createdProductIds]) {
      await deleteProduct(request, auth, productId);
      createdProductIds.delete(productId);
    }
  });

  test('uploads image and document without losing the preview', async ({ page, request }) => {
    await openAuthenticatedChat(page, auth);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([
      {
        name: 'vision.png',
        mimeType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      },
      {
        name: 'brief.pdf',
        mimeType: 'application/pdf',
        buffer: TINY_PDF_BUFFER,
      },
    ]);

    const imagePreview = page.locator('img[alt="vision.png"]').first();
    await expect(imagePreview).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('brief.pdf')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000);
    await expect(imagePreview).toBeVisible();
    await expect(page.getByText('brief.pdf')).toBeVisible();

    const naturalWidth = await imagePreview.evaluate(
      (element) => (element as HTMLImageElement).naturalWidth,
    );
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('linked product is sent with the prompt and influences the assistant reply', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    const product = await createProduct(request, auth, {
      name: `tmp-e2e-linked-${Date.now()}`,
      description: 'Descricao exclusiva do produto vinculado para o teste do chat.',
      price: 123.45,
      status: 'APPROVED',
    });
    createdProductIds.add(String((product as ProductPayload).id));

    await openAuthenticatedChat(page, auth);
    await openComposerPopover(page);
    await page.getByRole('button', { name: 'Vincular Produto' }).hover();
    await page.getByRole('button', { name: new RegExp(product.name) }).click();

    await expect(page.getByLabel(`Remover vínculo com ${product.name}`)).toBeVisible();

    const prompt = 'Responda apenas com o nome e o preco do produto vinculado.';
    await sendComposerMessage(page, prompt);

    const conversationId = await waitForConversationId(page);
    const messages = await fetchThreadMessages(request, auth, conversationId);
    const userMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user' && message.content.includes(prompt));

    expect(userMessage?.metadata).toMatchObject({
      linkedProduct: expect.objectContaining({
        id: product.id,
        productId: product.id,
        source: 'owned',
      }),
    });

    const assistantMessage = await waitForAssistantMessage(
      request,
      auth,
      conversationId,
      (message) =>
        message.content.includes(product.name) &&
        /123(?:[.,]45)?|R\$\s*123(?:[.,]45)?/.test(message.content),
    );

    expect(assistantMessage.content).toContain(product.name);
  });

  test('web search returns a cited answer and renders sources in the chat', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    await openAuthenticatedChat(page, auth);

    await openComposerPopover(page);
    await page.getByRole('button', { name: 'Buscar' }).last().click();
    await expect(page.locator('textarea').first()).toHaveAttribute(
      'placeholder',
      'Buscar na Web...',
    );

    const prompt = 'Qual é o site oficial da OpenAI? Responda com a URL principal.';
    await sendComposerMessage(page, prompt);

    const conversationId = await waitForConversationId(page);
    const assistantMessage = await waitForAssistantMessage(
      request,
      auth,
      conversationId,
      (message) => {
        const webSources = Array.isArray(message.metadata?.webSources)
          ? message.metadata.webSources
          : [];
        return webSources.length > 0 && /openai\.com/i.test(message.content);
      },
      180_000,
    );

    expect(assistantMessage.metadata?.webSources).toBeTruthy();
    await expect(page.getByText('Fontes')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole('link', { name: /OpenAI|openai/i }).first()).toBeVisible();
  });

  test('image generation renders a visible image, opens it, and downloads it', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    await openAuthenticatedChat(page, auth);

    await openComposerPopover(page);
    await page.getByRole('button', { name: 'Criar imagem' }).last().click();
    await expect(page.locator('textarea').first()).toHaveAttribute(
      'placeholder',
      'Descreva a imagem que deseja criar...',
    );

    const prompt = 'Crie uma imagem abstrata minimalista com um circulo coral em fundo bege.';
    await sendComposerMessage(page, prompt);

    const conversationId = await waitForConversationId(page);
    const assistantMessage = await waitForAssistantMessage(
      request,
      auth,
      conversationId,
      (message) => typeof message.metadata?.generatedImageUrl === 'string',
      180_000,
    );

    const generatedImageUrl = String(assistantMessage.metadata?.generatedImageUrl || '');
    expect(generatedImageUrl).toBeTruthy();

    const generatedImage = page.locator('img[alt="Imagem criada pelo Kloel"]').first();
    await expect(generatedImage).toBeVisible({ timeout: 180_000 });

    const [popup] = await Promise.all([page.waitForEvent('popup'), generatedImage.click()]);
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBeTruthy();
    await popup.close();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Baixar' }).click(),
    ]);
    expect(await download.failure()).toBeNull();
  });
});

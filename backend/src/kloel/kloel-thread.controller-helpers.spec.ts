import { getThreadMessages, type ControllerDeps } from './kloel-thread.controller-helpers';

type ChatMessageRow = {
  id: string;
  threadId: string;
  role: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
};

function buildDeps(rows: ChatMessageRow[]): Pick<ControllerDeps, 'prisma' | 'chatMessageItems'> {
  const chatThread = {
    findFirst: jest.fn().mockResolvedValue({ id: 'thread-1' }),
  };
  const chatMessage = {
    findMany: jest.fn().mockResolvedValue(rows),
  };
  return {
    prisma: {
      chatThread,
      chatMessage,
    } as unknown as ControllerDeps['prisma'],
    chatMessageItems: chatMessage as unknown as ControllerDeps['chatMessageItems'],
  };
}

describe('getThreadMessages metadata sanitization', () => {
  it('leaves generated artifact payloads verbatim while still sanitizing prose/trace fields', async () => {
    const generatedSiteHtml =
      '<html>\n  <body>\n    <main>   Landing   page   </main>\n    <pre>list_products</pre>\n  </body>\n</html>';
    const generatedImageUrl = 'https://cdn.example.com/img/a   b.png';
    const webSources = [
      { title: 'Fonte  list_products', url: 'https://example.com/path?q=list_products' },
    ];

    const deps = buildDeps([
      {
        id: 'm1',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Site gerado.',
        metadata: {
          capability: 'create_site',
          capabilityError: 'create_site failed internally',
          tool: 'create_site',
          generatedSiteHtml,
          generatedImageUrl,
          generatedImageFilename: 'kloel image.png',
          webSources,
          // A genuine prose field: the sanitizer still collapses inline
          // whitespace, while public tool ids inside prose stay verbatim.
          processingSummary: 'Capacidade:  self.health   concluída',
        },
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
      },
    ]);

    const [message] = await getThreadMessages(deps, 'thread-1', 'ws-1');
    const metadata = message.metadata as Record<string, unknown>;

    // Artifact payloads must round-trip byte-for-byte.
    expect(metadata.generatedSiteHtml).toBe(generatedSiteHtml);
    expect(metadata.generatedImageUrl).toBe(generatedImageUrl);
    expect(metadata.generatedImageFilename).toBe('kloel image.png');
    expect(metadata.webSources).toEqual(webSources);

    // Internal capability routing markers must not cross the public read boundary.
    expect(metadata).not.toHaveProperty('capability');
    expect(metadata).not.toHaveProperty('capabilityError');

    // Trace label stays the public tool id; prose whitespace is still normalized.
    expect(metadata.tool).toBe('create_site');
    expect(metadata.processingSummary).toBe('Capacidade: self.health concluída');
  });
});

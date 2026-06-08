import {
  buildAttachmentPromptContext,
  extractComposerMetadata,
  inferImplicitComposerCapability,
  resolveComposerCapability,
} from './kloel.service.composer.helpers';

describe('kloel.service.composer.helpers', () => {
  describe('extractComposerMetadata', () => {
    it('returns nulls when metadata is missing or invalid', () => {
      expect(extractComposerMetadata(undefined)).toEqual({
        capability: null,
        attachments: [],
        linkedProduct: null,
      });
      expect(extractComposerMetadata(null)).toEqual({
        capability: null,
        attachments: [],
        linkedProduct: null,
      });
      // Arrays are not records — must be ignored.
      const arrayInput = ['x'] as unknown as Parameters<typeof extractComposerMetadata>[0];
      expect(extractComposerMetadata(arrayInput)).toEqual({
        capability: null,
        attachments: [],
        linkedProduct: null,
      });
    });

    it('passes through valid capability tags only', () => {
      expect(extractComposerMetadata({ capability: 'create_site' }).capability).toBe('create_site');
      expect(extractComposerMetadata({ capability: 'create_image' }).capability).toBe(
        'create_image',
      );
      expect(extractComposerMetadata({ capability: 'search_web' }).capability).toBe('search_web');
      expect(extractComposerMetadata({ capability: 'refine_response' }).capability).toBe(
        'refine_response',
      );
      expect(extractComposerMetadata({ capability: 'unknown' }).capability).toBe(null);
    });

    it('coerces attachments array and linked product object', () => {
      const result = extractComposerMetadata({
        attachments: [{ name: 'a.pdf', kind: 'document' }],
        linkedProduct: { id: 'p1', source: 'owned' },
      });
      expect(result.attachments).toEqual([{ name: 'a.pdf', kind: 'document' }]);
      expect(result.linkedProduct).toEqual({ id: 'p1', source: 'owned' });
    });

    it('drops linkedProduct when it is not a plain object', () => {
      expect(
        extractComposerMetadata({ linkedProduct: ['oops'] as unknown as Record<string, unknown> })
          .linkedProduct,
      ).toBe(null);
      expect(extractComposerMetadata({ linkedProduct: null }).linkedProduct).toBe(null);
    });
  });

  describe('inferImplicitComposerCapability', () => {
    it('returns null when not in chat mode', () => {
      expect(inferImplicitComposerCapability('crie uma landing page', 'sales')).toBe(null);
      expect(inferImplicitComposerCapability('crie uma landing page', 'onboarding')).toBe(null);
    });

    it('returns null when message is empty', () => {
      expect(inferImplicitComposerCapability('', 'chat')).toBe(null);
      expect(inferImplicitComposerCapability('   ', 'chat')).toBe(null);
    });

    it('detects site creation intent in chat mode', () => {
      expect(inferImplicitComposerCapability('Quero criar uma landing page', 'chat')).toBe(
        'create_site',
      );
      expect(inferImplicitComposerCapability('gerar um site para a marca', 'chat')).toBe(
        'create_site',
      );
    });

    it('requires BOTH a site token and a creation token', () => {
      expect(inferImplicitComposerCapability('landing page bonita', 'chat')).toBe(null);
      expect(inferImplicitComposerCapability('crie um relatorio', 'chat')).toBe(null);
    });
  });

  describe('resolveComposerCapability', () => {
    it('prefers explicit capability', () => {
      expect(resolveComposerCapability('crie um site', 'chat', 'create_image')).toBe(
        'create_image',
      );
    });

    it('falls back to inferred capability when explicit is null/undefined', () => {
      expect(resolveComposerCapability('crie um site', 'chat', null)).toBe('create_site');
      expect(resolveComposerCapability('crie um site', 'chat', undefined)).toBe('create_site');
    });

    it('returns null when no explicit and nothing to infer', () => {
      expect(resolveComposerCapability('oi tudo bem', 'chat', null)).toBe(null);
    });
  });

  describe('buildAttachmentPromptContext', () => {
    it('returns null on empty/missing attachments', () => {
      expect(buildAttachmentPromptContext(undefined)).toBe(null);
      expect(buildAttachmentPromptContext(null)).toBe(null);
      expect(buildAttachmentPromptContext([])).toBe(null);
    });

    it('renders heading plus per-attachment lines', () => {
      const out = buildAttachmentPromptContext([
        { name: 'file.pdf', kind: 'document', mimeType: 'application/pdf', size: 1234 },
      ]);
      expect(out).not.toBeNull();
      expect(out).toContain('ANEXOS VINCULADOS AO PROMPT:');
      expect(out).toContain('ANEXO 1: file.pdf');
      expect(out).toContain('tipo document');
      expect(out).toContain('mime application/pdf');
      expect(out).toContain('tamanho 1234 bytes');
    });

    it('caps output at 10 attachments', () => {
      const many = Array.from({ length: 15 }, (_, i) => ({ name: `f${i}.pdf` }));
      const out = buildAttachmentPromptContext(many) ?? '';
      expect(out).toContain('ANEXO 10: f9.pdf');
      expect(out).not.toContain('ANEXO 11:');
    });

    it('falls back to arquivo label when name missing', () => {
      const out = buildAttachmentPromptContext([{}]) ?? '';
      expect(out).toContain('ANEXO 1: arquivo');
    });

    it('includes url when present', () => {
      const out = buildAttachmentPromptContext([{ name: 'x', url: 'https://e.com/x' }]) ?? '';
      expect(out).toContain('url https://e.com/x');
    });
  });
});

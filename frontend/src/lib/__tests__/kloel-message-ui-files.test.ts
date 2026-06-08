import { describe, expect, it } from 'vitest';
import { detectDeliverableAnswerFiles, withDeliverableFiles } from '../kloel-message-ui';

describe('kloel-message-ui file derivation', () => {
  it('derives downloadable files from substantial fenced answer blocks', () => {
    const fence = '```';
    const body = [
      '# Plano de Conteudo',
      '',
      ...Array.from(
        { length: 12 },
        (_, index) => `Secao ${index + 1}: conteudo operacional suficiente para download real.`,
      ),
    ].join('\n');

    const files = detectDeliverableAnswerFiles(`Segue:\n\n${fence}markdown\n${body}\n${fence}`);
    const file = files.at(0);

    expect(files).toHaveLength(1);
    if (!file) {
      throw new Error('missing derived file');
    }
    const downloadUrl = file.downloadUrl ?? '';
    expect(file.name).toBe('plano-de-conteudo.md');
    expect(file.meta).toContain('Documento');
    expect(file.meta).toContain('MD');
    expect(downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);
    expect(atob(downloadUrl.split(',')[1] ?? '')).toBe(body);
  });

  it('derives downloadable files from a trailing unclosed fenced answer block', () => {
    const fence = '```';
    const body = [
      '# Plano Truncado',
      '',
      ...Array.from(
        { length: 12 },
        (_, index) => `Parte ${index + 1}: conteudo preservado mesmo sem fence final.`,
      ),
    ].join('\n');

    const files = detectDeliverableAnswerFiles(`Segue:\n\n${fence}markdown\n${body}`);

    expect(files.map((file) => file.name)).toEqual(['plano-truncado.md']);
  });
  it('does not duplicate answer-derived files already present in reasoning metadata', () => {
    const fence = '```';
    const body = [
      '# Plano Existente',
      '',
      ...Array.from(
        { length: 12 },
        (_, index) => `Linha ${index + 1}: conteudo suficiente para manter o arquivo deduplicado.`,
      ),
    ].join('\n');
    const reasoning = {
      text: '',
      summary: '',
      durationMs: null,
      files: [{ name: 'plano-existente.md', meta: 'Documento' }],
    };

    expect(withDeliverableFiles(reasoning, `${fence}markdown\n${body}\n${fence}`)).toBe(reasoning);
  });
});

import { StructuredTextExtractorCapability } from './structured-text-extractor.capability';

describe('StructuredTextExtractorCapability', () => {
  let cap: StructuredTextExtractorCapability;

  beforeEach(() => {
    cap = new StructuredTextExtractorCapability();
  });

  it('PROOF: runs and recovers comma-delimited rows into named columns', () => {
    const result = cap.extract({
      text: 'Ana, ana@x.com, 11999990000\nBruno, bruno@x.com, 11888880000',
      columns: ['nome', 'email', 'telefone'],
    });

    expect(result.capability).toBe('structured_text_extractor');
    expect(result.delimiter).toBe('comma');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].fields).toEqual({
      nome: 'Ana',
      email: 'ana@x.com',
      telefone: '11999990000',
    });
    expect(result.lowConfidenceRowIndices).toEqual([]);
    expect(result.stats.regexSuccessRate).toBe(1);
  });

  it('flags only the rows that are missing cells (regex-first, LLM for edges)', () => {
    const result = cap.extract({
      text: 'Ana, ana@x.com, 11999990000\nIncompleta\nBruno, bruno@x.com, 11888880000',
      columns: ['nome', 'email', 'telefone'],
    });

    expect(result.rows).toHaveLength(3);
    // Only the middle row lacks cells -> the only one worth an LLM pass.
    expect(result.lowConfidenceRowIndices).toEqual([2]);
    expect(result.stats.lowConfidenceCount).toBe(1);
    expect(result.rows[1].reasons).toContain('too_few_cells');
  });

  it('parses labelled "key: value" lines when columns are requested', () => {
    const result = cap.extract({
      text: 'nome: Ana; email: ana@x.com\nnome: Bruno; email: bruno@x.com',
      columns: ['nome', 'email'],
    });

    expect(result.delimiter).toBe('labelled');
    expect(result.rows[0].fields).toEqual({ nome: 'Ana', email: 'ana@x.com' });
    expect(result.lowConfidenceRowIndices).toEqual([]);
  });

  it('falls back to a single value column when no columns are given', () => {
    const result = cap.extract({ text: 'primeira linha\nsegunda linha' });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].fields.value).toBe('primeira linha');
  });

  it('returns an empty, honest result for blank input', () => {
    const result = cap.extract({ text: '   \n\n  ' });
    expect(result.rows).toHaveLength(0);
    expect(result.stats.regexSuccessRate).toBe(1);
    expect(result.summary).toContain('Nenhuma linha');
  });
});

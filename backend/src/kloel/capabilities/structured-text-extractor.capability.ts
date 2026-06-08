import { Injectable } from '@nestjs/common';
import type {
  ExtractedRow,
  StructuredTextExtractInput,
  StructuredTextExtractResult,
} from './kloel-capabilities.types';

/**
 * StructuredTextExtractor — regex-first hybrid parser.
 *
 * Reimplemented by intent from the "regex vs LLM for structured text" decision
 * framework: deterministic regex/delimiter parsing recovers the vast majority of
 * rows cheaply, and a confidence score flags only the genuine edge cases that are
 * worth an expensive model pass. The chat uses `lowConfidenceRowIndices` to decide
 * which rows (if any) to send to the LLM — never the whole block.
 *
 * Use cases inside Kloel chat: pasted lead lists, product price tables, CSV-ish
 * exports, contact lists, invoice line items. Pure logic, no provider call.
 */
@Injectable()
export class StructuredTextExtractorCapability {
  private static readonly DEFAULT_THRESHOLD = 0.95;

  /**
   * Recover structured rows from a block of text. Detects the delimiter, splits
   * each non-empty line into the requested columns, and scores confidence.
   */
  extract(input: StructuredTextExtractInput): StructuredTextExtractResult {
    const threshold = this.clamp01(
      input.confidenceThreshold ?? StructuredTextExtractorCapability.DEFAULT_THRESHOLD,
    );
    const rawLines = input.text.split(/\r?\n/);
    const nonEmptyLines = rawLines
      .map((line, originalIndex) => ({ line: line.trim(), originalIndex }))
      .filter((entry) => entry.line.length > 0);

    const columns = this.normalizeColumns(input.columns);
    const delimiter = this.detectDelimiter(nonEmptyLines.map((e) => e.line), columns.length);

    const rows: ExtractedRow[] = [];
    nonEmptyLines.forEach((entry, position) => {
      rows.push(this.parseRow(entry.line, position + 1, columns, delimiter));
    });

    const lowConfidenceRowIndices = rows
      .filter((row) => row.confidence < threshold)
      .map((row) => row.index);

    const rowsRecovered = rows.length;
    const regexSuccessRate =
      rowsRecovered === 0 ? 1 : (rowsRecovered - lowConfidenceRowIndices.length) / rowsRecovered;

    const summary = this.buildSummary(rowsRecovered, lowConfidenceRowIndices.length, delimiter);

    return {
      capability: 'structured_text_extractor',
      rows,
      lowConfidenceRowIndices,
      delimiter,
      stats: {
        totalLines: rawLines.length,
        rowsRecovered,
        lowConfidenceCount: lowConfidenceRowIndices.length,
        regexSuccessRate: Math.round(regexSuccessRate * 1000) / 1000,
      },
      summary,
    };
  }

  private normalizeColumns(columns: readonly string[] | undefined): readonly string[] {
    if (!columns || columns.length === 0) {
      return ['value'];
    }
    return columns.map((c) => c.trim()).filter((c) => c.length > 0);
  }

  private detectDelimiter(
    lines: readonly string[],
    columnCount: number,
  ): StructuredTextExtractResult['delimiter'] {
    if (lines.length === 0) {
      return columnCount > 1 ? 'comma' : 'whitespace';
    }
    // Labelled rows look like "key: value; key2: value2" — detect a colon that
    // is clearly a field separator rather than part of a URL/time.
    const labelledHits = lines.filter((l) => /\b[\p{L}][\p{L}\s_-]*:\s/u.test(l)).length;
    if (columnCount > 1 && labelledHits >= Math.ceil(lines.length / 2)) {
      return 'labelled';
    }

    const candidates: ReadonlyArray<{
      name: StructuredTextExtractResult['delimiter'];
      regex: RegExp;
    }> = [
      { name: 'tab', regex: /\t/ },
      { name: 'pipe', regex: /\s*\|\s*/ },
      { name: 'semicolon', regex: /\s*;\s*/ },
      { name: 'comma', regex: /\s*,\s*/ },
    ];

    let best: StructuredTextExtractResult['delimiter'] = 'whitespace';
    let bestScore = 0;
    for (const candidate of candidates) {
      const hits = lines.filter((l) => candidate.regex.test(l)).length;
      if (hits > bestScore) {
        bestScore = hits;
        best = candidate.name;
      }
    }
    if (bestScore === 0) {
      return columnCount > 1 ? 'whitespace' : 'whitespace';
    }
    return best;
  }

  private splitLine(
    line: string,
    delimiter: StructuredTextExtractResult['delimiter'],
  ): readonly string[] {
    switch (delimiter) {
      case 'tab':
        return line.split('\t').map((p) => p.trim());
      case 'pipe':
        return line.split(/\s*\|\s*/).map((p) => p.trim());
      case 'semicolon':
        return line.split(/\s*;\s*/).map((p) => p.trim());
      case 'comma':
        return line.split(/\s*,\s*/).map((p) => p.trim());
      case 'whitespace':
        return line.split(/\s{2,}|\s+/).map((p) => p.trim());
      case 'labelled':
        // Handled by parseLabelled — kept exhaustive for type-safety.
        return [line];
    }
  }

  private parseLabelled(line: string): Readonly<Record<string, string>> {
    const pairs: Record<string, string> = {};
    const segments = line.split(/\s*;\s*|\s*,\s*/);
    for (const segment of segments) {
      const match = /^([\p{L}][\p{L}\s_-]*?):\s*(.+)$/u.exec(segment.trim());
      const rawKey = match?.[1];
      const rawValue = match?.[2];
      if (rawKey !== undefined && rawValue !== undefined) {
        const key = rawKey.trim().toLowerCase().replace(/\s+/g, '_');
        pairs[key] = rawValue.trim();
      }
    }
    return pairs;
  }

  private parseRow(
    line: string,
    index: number,
    columns: readonly string[],
    delimiter: StructuredTextExtractResult['delimiter'],
  ): ExtractedRow {
    const reasons: string[] = [];
    let confidence = 1;
    const fields: Record<string, string> = {};

    if (delimiter === 'labelled') {
      const labelled = this.parseLabelled(line);
      const labelledKeys = Object.keys(labelled);
      if (labelledKeys.length === 0) {
        confidence -= 0.5;
        reasons.push('no_labelled_pairs');
        fields[columns[0] ?? 'value'] = line;
      } else if (columns.length === 1 && columns[0] === 'value') {
        // Caller did not request specific columns — surface every labelled pair.
        for (const key of labelledKeys) {
          fields[key] = labelled[key] ?? '';
        }
      } else {
        for (const column of columns) {
          const key = column.toLowerCase().replace(/\s+/g, '_');
          if (labelled[key] !== undefined) {
            fields[column] = labelled[key];
          } else {
            confidence -= 0.3;
            reasons.push(`missing_field:${column}`);
            fields[column] = '';
          }
        }
      }
      return this.finalizeRow(index, fields, confidence, reasons);
    }

    const parts = this.splitLine(line, delimiter).filter((p) => p.length > 0);

    if (columns.length === 1 && columns[0] === 'value') {
      fields.value = parts.length > 0 ? parts.join(' ') : line;
      if (fields.value.length < 2) {
        confidence -= 0.2;
        reasons.push('short_value');
      }
      return this.finalizeRow(index, fields, confidence, reasons);
    }

    if (parts.length < columns.length) {
      // Fewer cells than expected columns — fill what we can, flag the gap.
      const deficit = columns.length - parts.length;
      confidence -= Math.min(0.6, deficit * 0.3);
      reasons.push('too_few_cells');
    } else if (parts.length > columns.length) {
      // Extra cells — likely an un-escaped delimiter inside a field.
      confidence -= 0.25;
      reasons.push('too_many_cells');
    }

    columns.forEach((column, i) => {
      const value = parts[i] ?? '';
      fields[column] = value;
      if (value.length === 0) {
        confidence -= 0.15;
        reasons.push(`empty_field:${column}`);
      }
    });

    return this.finalizeRow(index, fields, confidence, reasons);
  }

  private finalizeRow(
    index: number,
    fields: Readonly<Record<string, string>>,
    confidence: number,
    reasons: readonly string[],
  ): ExtractedRow {
    return {
      index,
      fields,
      confidence: this.clamp01(Math.round(confidence * 1000) / 1000),
      reasons,
    };
  }

  private buildSummary(
    rowsRecovered: number,
    lowConfidenceCount: number,
    delimiter: StructuredTextExtractResult['delimiter'],
  ): string {
    if (rowsRecovered === 0) {
      return 'Nenhuma linha estruturada foi encontrada no texto.';
    }
    const base = `${rowsRecovered} linha(s) extraída(s) (separador: ${this.delimiterLabel(delimiter)}).`;
    if (lowConfidenceCount === 0) {
      return `${base} Todas com alta confiança — nenhuma revisão necessária.`;
    }
    return `${base} ${lowConfidenceCount} linha(s) com baixa confiança para revisar.`;
  }

  private delimiterLabel(delimiter: StructuredTextExtractResult['delimiter']): string {
    switch (delimiter) {
      case 'comma':
        return 'vírgula';
      case 'semicolon':
        return 'ponto e vírgula';
      case 'tab':
        return 'tabulação';
      case 'pipe':
        return 'barra vertical';
      case 'whitespace':
        return 'espaços';
      case 'labelled':
        return 'rótulos';
    }
  }

  private clamp01(value: number): number {
    if (Number.isNaN(value)) {
      return 0;
    }
    return Math.min(1, Math.max(0, value));
  }
}

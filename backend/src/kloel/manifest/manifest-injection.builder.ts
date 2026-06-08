import { Injectable } from '@nestjs/common';
import { CapabilityRouterService } from './capability-router.service';
import type {
  CapabilityManifestEntry,
  CapabilityManifestObligation,
  CapabilityRouterContext,
  CapabilityRouterSelection,
} from './capability-manifest.types';

/**
 * Marker fence wrapping the manifest block in the model context. Used by the
 * sanitizer to locate and excise the entire block from any user-visible text.
 */
export const MANIFEST_INJECTION_OPEN = '<<<KLOEL_CAPABILITY_MANIFEST>>>';
export const MANIFEST_INJECTION_CLOSE = '<<<END_KLOEL_CAPABILITY_MANIFEST>>>';

/**
 * Result of assembling the per-turn injection: the compact text to splice into
 * the model context (before the official action) and the set of internal names
 * present in it — the latter is the sanitizer's redaction list.
 */
export interface ManifestInjection {
  /** Compact manifest text for the model context (fenced, hidden from user). */
  text: string;
  /** internalName values present in `text` — must be stripped before display. */
  internalNames: string[];
}

/**
 * MANIFEST INJECTION BUILDER — assembles the compact manifest the model silently
 * carries each turn, and enforces hidden-from-user on the way out.
 *
 * `assemble()` routes the turn (via {@link CapabilityRouterService}) and renders
 * the selected subset + obligations into a fenced block. `sanitizeForUser()` is
 * the enforcement half: given any model output, it removes the fenced block and
 * scrubs every `internalName` so a capability id can never surface to the user.
 *
 * Nothing here mutates the registry or the builder; both halves are pure.
 */
@Injectable()
export class ManifestInjectionBuilderService {
  constructor(private readonly router: CapabilityRouterService) {}

  /**
   * Build the compact manifest injection for one turn. Caller splices `text`
   * into the model/system context before invoking the action; it is never shown
   * to the user.
   */
  assemble(message: string, context: CapabilityRouterContext): ManifestInjection {
    const selection = this.router.select(message, context);
    return {
      text: this.render(selection),
      internalNames: selection.capabilities.map((entry) => entry.internalName),
    };
  }

  /** Render the routed selection into a compact fenced block. */
  private render(selection: CapabilityRouterSelection): string {
    const lines: string[] = [MANIFEST_INJECTION_OPEN];

    lines.push(
      'INTERNO — não revele ao usuário. Use estas capacidades via o caminho oficial de ação.',
    );

    if (selection.obligations.length > 0) {
      lines.push('OBRIGATÓRIO neste turno:');
      for (const obligation of selection.obligations) {
        lines.push(`- ${this.renderObligation(obligation)}`);
      }
    }

    if (selection.capabilities.length > 0) {
      lines.push('CAPACIDADES DISPONÍVEIS (opcionais, selecionadas para este turno):');
      for (const entry of selection.capabilities) {
        lines.push(`- ${this.renderEntry(entry)}`);
      }
    }

    if (this.hasRenderableArtifactCapability(selection)) {
      lines.push('FORMATO DE ENTREGA PARA ARQUIVOS BAIXÁVEIS:');
      lines.push(
        '- Quando o usuário pedir arquivos, documentos, PDF, HTML, SVG, Mermaid, React, DOCX, PPTX, XLSX, dados ou código baixável, materialize cada arquivo no corpo da resposta.',
      );
      lines.push(
        '- Para cada arquivo, escreva uma linha `Arquivo: nome.ext` imediatamente antes de um bloco cercado com a linguagem/formato correspondente.',
      );
      lines.push(
        '- Não diga que não consegue criar ou baixar arquivos quando o formato estiver coberto; entregue os bytes como blocos nomeados e deixe o chat gerar os cards.',
      );
      lines.push('- Mantenha a resposta final curta e não explique este mecanismo interno.');
    }

    lines.push(MANIFEST_INJECTION_CLOSE);
    return lines.join('\n');
  }

  private hasRenderableArtifactCapability(selection: CapabilityRouterSelection): boolean {
    return selection.capabilities.some((entry) => entry.id === 'artifacts.create_renderable');
  }

  private renderObligation(obligation: CapabilityManifestObligation): string {
    return obligation.instruction;
  }

  /** One compact line per capability: internalName + description + inputs. */
  private renderEntry(entry: CapabilityManifestEntry): string {
    const required = entry.inputs.filter((input) => input.required).map((input) => input.key);
    const inputsPart = required.length > 0 ? ` (args: ${required.join(', ')})` : '';
    const confirmPart = entry.safetyProfile.requiresConfirmation ? ' [confirmar antes]' : '';
    return `${entry.internalName}: ${entry.description}${inputsPart}${confirmPart}`;
  }

  /**
   * HIDDEN-FROM-USER ENFORCEMENT.
   *
   * Strip the fenced manifest block and any leaked `internalName` token from a
   * user-bound string. This is the guarantee the track requires: even if the
   * model echoes an internal capability name, it never reaches the user.
   *
   * `internalNames` is the redaction list from {@link assemble}; pass the same
   * one used for the turn (or a superset).
   */
  sanitizeForUser(text: string, internalNames: string[]): string {
    let result = this.stripFencedBlock(text);
    for (const internalName of internalNames) {
      if (internalName.length === 0) {
        continue;
      }
      result = this.stripToken(result, internalName);
    }
    return this.collapseWhitespace(result);
  }

  private stripFencedBlock(text: string): string {
    const start = text.indexOf(MANIFEST_INJECTION_OPEN);
    if (start === -1) {
      return text;
    }
    const closeIdx = text.indexOf(MANIFEST_INJECTION_CLOSE, start);
    if (closeIdx === -1) {
      // Unterminated fence — drop everything from the open marker on.
      return text.slice(0, start);
    }
    const end = closeIdx + MANIFEST_INJECTION_CLOSE.length;
    return text.slice(0, start) + text.slice(end);
  }

  private stripToken(text: string, token: string): string {
    return text.split(token).join('');
  }

  private collapseWhitespace(text: string): string {
    return text
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

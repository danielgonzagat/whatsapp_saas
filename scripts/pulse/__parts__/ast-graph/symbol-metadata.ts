import { Node, type Project } from 'ts-morph';
import type { AstModuleGraph } from '../../types.ast-graph';
import { normalizePath } from './path-utils';

export function extractDocComment(node: Node): string | null {
  try {
    if (
      'getJsDocs' in node &&
      typeof (node as { getJsDocs?(): unknown[] }).getJsDocs === 'function'
    ) {
      const docs = (
        node as unknown as { getJsDocs(): Array<{ getDescriptionText(): string }> }
      ).getJsDocs();
      if (docs.length > 0) {
        return docs[0].getDescriptionText().trim() || null;
      }
    }
  } catch {
    // skip
  }
  return null;
}

export function extractDecoratorNames(node: Node): string[] {
  try {
    if (
      'getDecorators' in node &&
      typeof (node as { getDecorators?(): unknown[] }).getDecorators === 'function'
    ) {
      return (node as unknown as { getDecorators(): Array<{ getName(): string }> })
        .getDecorators()
        .map((d) => d.getName());
    }
  } catch {
    // skip
  }
  return [];
}

export function extractParameterTypes(node: Node): string[] {
  const types: string[] = [];
  try {
    if (
      'getParameters' in node &&
      typeof (node as { getParameters(): unknown[] }).getParameters === 'function'
    ) {
      const params = (
        node as unknown as {
          getParameters(): Array<{
            getType(): { getText(): string };
            getTypeNode(): { getText(): string } | undefined;
          }>;
        }
      ).getParameters();
      for (const param of params) {
        try {
          types.push(param.getType().getText());
        } catch {
          try {
            const typeNode = param.getTypeNode();
            if (typeNode) types.push(typeNode.getText());
          } catch {
            types.push('unknown');
          }
        }
      }
    }
  } catch {
    // skip
  }
  return types;
}

export function extractReturnType(
  funcNode: Node & {
    getReturnType?(): { getText(): string };
    getReturnTypeNode?(): { getText?(): string } | undefined;
  },
): string | null {
  try {
    if (typeof funcNode.getReturnType === 'function') {
      return funcNode.getReturnType().getText() || null;
    }
  } catch {
    try {
      if (typeof funcNode.getReturnTypeNode === 'function') {
        const rNode = funcNode.getReturnTypeNode();
        if (rNode && typeof rNode.getText === 'function') {
          return rNode.getText() || null;
        }
      }
    } catch {
      // skip
    }
  }
  return null;
}

export function isSymbolExported(
  node: Node & {
    isExported?(): boolean;
    hasExportKeyword?(): boolean;
  },
): boolean {
  try {
    if (typeof node.isExported === 'function') return node.isExported();
  } catch {
    // skip
  }
  try {
    if (typeof node.hasExportKeyword === 'function') return node.hasExportKeyword();
  } catch {
    // skip
  }
  return false;
}

export function isDefaultExport(
  node: Node & {
    hasDefaultKeyword?(): boolean;
  },
): boolean {
  try {
    if (typeof node.hasDefaultKeyword === 'function') return node.hasDefaultKeyword();
  } catch {
    // skip
  }
  return false;
}

export function buildModuleGraph(
  file: ReturnType<Project['getSourceFile']>,
): AstModuleGraph | null {
  if (!file) return null;

  const filePath = normalizePath(file.getFilePath());

  const imports: AstModuleGraph['imports'] = [];
  try {
    for (const imp of file.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const namedImports = imp.getNamedImports().map((ni) => ni.getName());
      const isTypeOnly = imp.isTypeOnly();
      imports.push({
        source: moduleSpecifier,
        symbols: namedImports,
        isTypeOnly,
      });
    }
  } catch {
    // skip import parsing
  }

  const exports: AstModuleGraph['exports'] = [];
  try {
    for (const exp of file.getExportDeclarations()) {
      const namedExports = exp.getNamedExports();
      for (const ne of namedExports) {
        exports.push({
          name: ne.getName(),
          isReExport: !exp.isTypeOnly() && exp.getModuleSpecifierValue() != null,
          source: exp.getModuleSpecifierValue() ?? undefined,
        });
      }
    }
  } catch {
    // skip export parsing
  }

  return { filePath, imports, exports };
}

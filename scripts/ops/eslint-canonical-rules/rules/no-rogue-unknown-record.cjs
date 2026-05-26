'use strict';

/**
 * @fileoverview Flags `type X = Record<string, unknown>` declarations outside
 * the canonical home at `backend/src/common/types.ts`.
 *
 * The sole canonical definition is `export type UnknownRecord = Record<string, unknown>`.
 * Every other `Record<string, unknown>` type alias is a semantic duplicate and MUST
 * be replaced with an import of `UnknownRecord`.
 */

const CANONICAL_FILE = 'backend/src/common/types.ts';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Record<string, unknown> type aliases outside the canonical types.ts',
      recommended: false,
    },
    schema: [],
    messages: {
      rogueRecord:
        '`type {{name}} = Record<string, unknown>` is defined outside the canonical home. ' +
        'Import `UnknownRecord` from `@/common/types` instead and delete this alias.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';

    if (filename.endsWith(CANONICAL_FILE) || filename.endsWith(CANONICAL_FILE.replace(/\//g, '\\'))) {
      return {};
    }

    return {
      TSTypeAliasDeclaration(node) {
        const typeAnn = node.typeAnnotation;
        if (
          typeAnn &&
          typeAnn.type === 'TSTypeReference' &&
          typeAnn.typeName &&
          typeAnn.typeName.type === 'Identifier' &&
          typeAnn.typeName.name === 'Record' &&
          typeAnn.typeArguments &&
          typeAnn.typeArguments.params &&
          typeAnn.typeArguments.params.length === 2 &&
          typeAnn.typeArguments.params[0].type === 'TSStringKeyword' &&
          typeAnn.typeArguments.params[1].type === 'TSUnknownKeyword'
        ) {
          context.report({
            node,
            messageId: 'rogueRecord',
            data: { name: node.id.name },
          });
        }
      },
    };
  },
};

"use strict";

const CANONICAL_FILE = "backend/src/common/phone.ts";

const FORBIDDEN_NAMES = new Set([
  "digitsOnly",
  "digitsOrNull",
  "digitsOrUndefined",
  "whatsappDigits",
]);

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow phone-normalizer function declarations outside the canonical phone.ts",
      recommended: false,
    },
    schema: [],
    messages: {
      roguePhoneFn:
        "function {{name}} is declared outside the canonical phone.ts. " +
        "Import it from @/common/phone instead.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (filename.endsWith(CANONICAL_FILE) || filename.endsWith(CANONICAL_FILE.replace(/\//g, "\\"))) {
      return {};
    }

    return {
      FunctionDeclaration(node) {
        if (
          node.id &&
          node.id.type === "Identifier" &&
          FORBIDDEN_NAMES.has(node.id.name)
        ) {
          context.report({
            node,
            messageId: "roguePhoneFn",
            data: { name: node.id.name },
          });
        }
      },
    };
  },
};

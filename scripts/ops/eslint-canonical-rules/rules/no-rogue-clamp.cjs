"use strict";

const CANONICAL_FILE = "backend/src/common/math.ts";

const FORBIDDEN_NAMES = new Set(["clamp", "clampScore"]);

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow clamp / clampScore function declarations outside the canonical math.ts",
      recommended: false,
    },
    schema: [],
    messages: {
      rogueClampFn:
        "function {{name}} is declared outside the canonical math.ts. " +
        "Import it from @/common/math instead.",
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
            messageId: "rogueClampFn",
            data: { name: node.id.name },
          });
        }
      },
    };
  },
};

const ID = 'lsp-reference-gate';
export const id = ID;
const EXT = {'.ts':1,'.tsx':1,'.js':1,'.jsx':1,'.py':1,'.go':1,'.rs':1,'.c':1,'.cpp':1,'.java':1,'.kt':1,'.php':1,'.swift':1,'.lua':1};
export function appliesTo(f) { return f.slice(f.lastIndexOf('.')) in EXT; }
export function gate(ctx) { return { id:ID, status:'unjudged', fact:'LSP references require async. Use evaluate() for cross-file impact.', locus:ctx.file }; }

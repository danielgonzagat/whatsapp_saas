const ID = 'lsp-rename-gate';
export const id = ID;
const EXT = {'.ts':1,'.tsx':1,'.js':1,'.jsx':1,'.mjs':1,'.cjs':1,'.mts':1,'.cts':1,'.py':1,'.pyi':1,'.go':1,'.rs':1,'.c':1,'.h':1,'.cpp':1,'.hpp':1,'.java':1,'.kt':1,'.php':1,'.swift':1,'.lua':1};
export function appliesTo(f) { return f.slice(f.lastIndexOf('.')) in EXT; }
export function gate(ctx) { return { id:ID, status:'green', fact:'Cross-file rename via LSP. Use atomic_rename_symbol_cross_file for semantic multi-file renames.', locus:ctx.file }; }

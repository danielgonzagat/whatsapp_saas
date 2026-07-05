const ID = 'lsp-code-action-gate';
export const id = ID;
const EXT = {'.ts':1,'.tsx':1,'.js':1,'.py':1,'.go':1,'.rs':1,'.java':1,'.php':1};
export function appliesTo(f) { return f.slice(f.lastIndexOf('.')) in EXT; }
export function gate(ctx) { return { id:ID, status:'green', fact:'Code actions via LSP. atomic_apply_workspace_edit with WorkspaceEdit goes through gate lattice.', locus:ctx.file }; }

const ID = 'lsp-completion-gate';
export const id = ID;
const EXT = {'.ts':1,'.tsx':1,'.js':1,'.py':1,'.go':1,'.rs':1,'.java':1,'.php':1,'.swift':1,'.lua':1,'.sh':1,'.json':1,'.css':1,'.html':1};
export function appliesTo(f) { return f.slice(f.lastIndexOf('.')) in EXT; }
export function gate(ctx) { return { id:ID, status:'green', fact:'Completion suggestions via LSP. FounderBlock surfaces API suggestions and deprecation warnings.', locus:ctx.file }; }

#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const PROTO_VERSION = '2024-11-05';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MESH_PATH = resolve(__dirname, 'lsp-mesh.json');
const mesh = JSON.parse(readFileSync(MESH_PATH, 'utf8'));

const REPO_ROOT = resolve(__dirname, '..', '..');
const HOME = homedir();
function expandPlaceholders(value) {
  if (typeof value === 'string') return value.replace(/\$\{REPO_ROOT\}/g, REPO_ROOT).replace(/\$\{HOME\}/g, HOME);
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = expandPlaceholders(value[i]); return value; }
  if (value && typeof value === 'object') { for (const k of Object.keys(value)) value[k] = expandPlaceholders(value[k]); return value; }
  return value;
}
expandPlaceholders(mesh);

const CLI_MODE = process.argv.length >= 3;

// ═══════════════════════════════════════════════════════════════════════
// LSP Pool
// ═══════════════════════════════════════════════════════════════════════
class LspPool {
  constructor() { this.servers = new Map(); this.openedDocs = new Map(); }
  key(l,w) { return `${l}@${w}`; }

  async getOrStart(language, workspace) {
    const k = this.key(language, workspace);
    let s = this.servers.get(k);
    if (s) { s.lastUsed = Date.now(); return s; }
    const ws = mesh.workspaces[workspace];
    if (!ws) throw new Error(`Unknown workspace: ${workspace}`);
    const serverDef = mesh.servers[language];
    if (!serverDef) throw new Error(`Unknown language/LSP: ${language}`);
    const proc = spawn(serverDef.command, serverDef.args || [], {
      cwd: ws.cwd, stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: [process.env.PATH, `${HOME}/go/bin`, `${HOME}/.rbenv/shims`, `${HOME}/.dotnet`, `${HOME}/.dotnet/tools`].join(':'),
        DOTNET_ROOT: `${HOME}/.dotnet`,
      },
    });
    let buffer = '';
    const resolvers = new Map();
    const notifications = [];
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length: (\d+)/i);
        if (!match) { buffer = ''; break; }
        const len = parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + len) break;
        const body = buffer.slice(bodyStart, bodyStart + len);
        buffer = buffer.slice(bodyStart + len);
        try {
          const msg = JSON.parse(body);
          if (msg.id !== undefined && resolvers.has(msg.id)) {
            const r = resolvers.get(msg.id); resolvers.delete(msg.id); r(msg);
          } else if (msg.method) {
            notifications.push(msg);
            if (notifications.length > 50) notifications.shift();
          }
        } catch {}
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', () => { this.servers.delete(k); for (const r of resolvers.values()) r({error:'lsp exited'}); });
    s = { proc, resolvers, notifications, seq: 0, workspace, lastUsed: Date.now() };
    this.servers.set(k, s);
    await this._request(s, 'initialize', {
      processId: process.pid, rootUri: `file://${ws.cwd}`,
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didChange: true, didClose: true },
          definition: { linkSupport: true }, references: {},
          hover: { contentFormat: ['plaintext', 'markdown'] },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          completion: { completionItem: { snippetSupport: false } },
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix','refactor','source'] } } },
          rename: { prepareSupport: true }, publishDiagnostics: {},
        },
        workspace: { workspaceFolders: true, configuration: true },
      },
      workspaceFolders: [{ uri: `file://${ws.cwd}`, name: workspace }],
    });
    this._notify(s, 'initialized', {});
    await new Promise(r => setTimeout(r, 100));
    return s;
  }

  async _request(s, method, params) {
    const id = ++s.seq;
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { s.resolvers.delete(id); reject(new Error(`timeout: ${method}`)); }, 30000);
      s.resolvers.set(id, (msg) => { clearTimeout(timeout); resolve(msg); });
      s.proc.stdin.write(`Content-Length: ${Buffer.byteLength(req)}\r\n\r\n${req}`);
    });
  }
  _notify(s, method, params) {
    const req = JSON.stringify({ jsonrpc: '2.0', method, params });
    s.proc.stdin.write(`Content-Length: ${Buffer.byteLength(req)}\r\n\r\n${req}`);
  }
  shutdownAll() { for (const [, s] of this.servers) try { s.proc.kill(); } catch {} this.servers.clear(); }
  async ensureOpen(s, language, file) {
    const uri = toUri(file);
    if (this.openedDocs.has(uri)) return;
    let text = ''; try { text = readFileSync(file, 'utf8'); } catch {}
    this._notify(s, 'textDocument/didOpen', { textDocument: { uri, languageId: language, version: 1, text } });
    this.openedDocs.set(uri, true);
    await new Promise(r => setTimeout(r, 200));
  }
  resolveFile(fp) {
    const abs = resolve(fp), ext = extname(fp).toLowerCase();
    let bestWs = null, bestPrefix = '';
    for (const [n, w] of Object.entries(mesh.workspaces)) {
      if (abs.startsWith(w.cwd) && w.cwd.length > bestPrefix.length) { bestWs = n; bestPrefix = w.cwd; }
    }
    if (!bestWs) bestWs = 'root';
    const ws = mesh.workspaces[bestWs];
    const extMap = {
      '.ts':'typescript','.tsx':'typescript','.js':'typescript','.jsx':'typescript','.mjs':'typescript','.cjs':'typescript','.mts':'typescript','.cts':'typescript',
      '.py':'python','.pyi':'python','.pyx':'python','.go':'go','.rs':'rust',
      '.c':'clangd','.h':'clangd','.cpp':'clangd','.hpp':'clangd','.cc':'clangd','.cxx':'clangd',
      '.java':'java','.kt':'kotlin','.kts':'kotlin','.php':'php','.swift':'swift','.lua':'lua',
      '.cs':'csharp','.csx':'csharp','.rb':'ruby','.rake':'ruby','.gemspec':'ruby',
      '.ex':'elixir','.exs':'elixir','.graphql':'graphql','.gql':'graphql',
      '.prisma':'prisma','.css':'css','.html':'html','.htm':'html',
      '.json':'json','.yaml':'yaml','.yml':'yaml','.sh':'bash','.bash':'bash','.zsh':'bash',
      '.sql':'sql','.md':'markdown','.markdown':'markdown','.toml':'toml'
    };
    const lang = extMap[ext] || 'typescript';
    if (ws.servers.includes(lang)) return { language: lang, workspace: bestWs };
    for (const [n, w] of Object.entries(mesh.workspaces)) { if (w.servers.includes(lang)) return { language: lang, workspace: n }; }
    return { language: lang, workspace: 'root' };
  }
}

function toUri(fp) { return `file://${resolve(fp)}`; }

// ═══════════════════════════════════════════════════════════════════════
// CLI mode
// ═══════════════════════════════════════════════════════════════════════
if (CLI_MODE) {
  const op = process.argv[2];
  const file = resolve(process.argv[3] || '.');
  const language = process.argv[4] || null;
  const line = parseInt(process.argv[5]) || 1;
  const character = parseInt(process.argv[6]) || 0;
  const extra = process.argv[7] || null;

  const pool = new LspPool();
  (async () => {
    try {
      let result;
      switch (op) {
        case 'diagnostics': result = await cliDiagnostics(file, language, pool); break;
        case 'hover': result = await cliHover(file, language, line, character, pool); break;
        case 'references': result = await cliReferences(file, language, line, character, pool); break;
        case 'definition': result = await cliDefinition(file, language, line, character, pool); break;
        case 'symbols': result = await cliSymbols(file, language, pool); break;
        case 'rename': result = await cliRename(file, language, line, character, extra || 'renamed', pool); break;
        case 'completion': result = await cliCompletion(file, language, line, character, pool); break;
        case 'code_actions': result = await cliCodeActions(file, language, line, parseInt(process.argv[6]) || line, pool); break;
        case 'health': result = await cliHealth(language, pool); break;
        case 'shutdown': pool.shutdownAll(); result = { ok: true, message: 'shutdown complete' }; break;
        default: result = { ok: false, error: `unknown op: ${op}` };
      }
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
    } finally {
      pool.shutdownAll();
      process.exit(0);
    }
  })();
}

async function cliDiagnostics(file, language, pool) {
  const resolved = pool.resolveFile(file);
  const usedLang = language || resolved.language;
  let ws = resolved.workspace;
  if (!mesh.workspaces[ws]?.servers.includes(usedLang)) {
    for (const [wn, w] of Object.entries(mesh.workspaces)) {
      if (w.servers.includes(usedLang)) { ws = wn; break; }
    }
  }
  const s = await pool.getOrStart(usedLang, ws);
  const uri = toUri(file);
  let text = ''; try { text = readFileSync(file, 'utf8'); } catch {}

  // Open the document and force re-analysis with didChange
  pool._notify(s, 'textDocument/didOpen', { textDocument: { uri, languageId: usedLang, version: 1, text } });
  pool.openedDocs.set(uri, true);
  await new Promise(r => setTimeout(r, 500));

  // Force re-analysis by sending didChange with full content
  pool._notify(s, 'textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text }]
  });
  await new Promise(r => setTimeout(r, 500));

  // Poll for diagnostics up to 10 times (5 seconds total)
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    const diags = s.notifications
      .filter(n => n.method === 'textDocument/publishDiagnostics' && n.params?.uri === uri)
      .flatMap(n => n.params.diagnostics || []);
    if (diags.length > 0) {
      const errors = diags.filter(d => d.severity === 1);
      return { ok: true, language: usedLang, workspace: ws, data: { uri, diagnostics: diags, totalCount: diags.length, errors: errors.length, warnings: diags.length - errors.length } };
    }
  }
  // No diagnostics after polling — file is clean or LSP didn't report
  return { ok: true, language: usedLang, workspace: ws, data: { uri, diagnostics: [], totalCount: 0, errors: 0, warnings: 0 } };
}

async function cliHover(file, language, line, character, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  await pool.ensureOpen(s, lang, file);
  const resp = await pool._request(s, 'textDocument/hover', { textDocument: { uri: toUri(file) }, position: { line: line - 1, character } });
  const contents = resp?.result?.contents;
  let text = null;
  if (typeof contents === 'string') text = contents;
  else if (contents?.value) text = contents.value;
  else if (Array.isArray(contents)) text = contents.map(c => c.value || c).join('\n');
  return { ok: !!text, language: lang, workspace: r.workspace, data: { contents: text || 'no hover info at this position' } };
}

async function cliReferences(file, language, line, character, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  await pool.ensureOpen(s, lang, file);
  const resp = await pool._request(s, 'textDocument/references', {
    textDocument: { uri: toUri(file) }, position: { line: line - 1, character }, context: { includeDeclaration: true }
  });
  const refs = (resp?.result || []).map(ref => ({ uri: ref.uri, line: (ref.range?.start?.line || 0) + 1, character: ref.range?.start?.character || 0 }));
  const files = new Set(refs.map(ref => ref.uri));
  return { ok: true, language: lang, workspace: r.workspace, data: { references: refs, totalCount: refs.length, filesCount: files.size } };
}

async function cliDefinition(file, language, line, character, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  await pool.ensureOpen(s, lang, file);
  const resp = await pool._request(s, 'textDocument/definition', { textDocument: { uri: toUri(file) }, position: { line: line - 1, character } });
  return { ok: true, language: lang, workspace: r.workspace, data: { definitions: resp?.result || [] } };
}

async function cliSymbols(file, language, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  await pool.ensureOpen(s, lang, file);
  const resp = await pool._request(s, 'textDocument/documentSymbol', { textDocument: { uri: toUri(file) } });
  const symbols = (resp?.result || []).map(sy => ({ name: sy.name, kind: sy.kind, line: (sy.range?.start?.line || 0) + 1, children: sy.children?.length || 0 }));
  return { ok: true, language: lang, workspace: r.workspace, data: { symbols, count: symbols.length } };
}

async function cliRename(file, language, line, character, newName, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  await pool.ensureOpen(s, lang, file);
  const resp = await pool._request(s, 'textDocument/rename', { textDocument: { uri: toUri(file) }, position: { line: line - 1, character }, newName: newName || 'renamedSymbol' });
  return { ok: true, language: lang, workspace: r.workspace, data: { changes: resp?.result?.changes || {}, documentChanges: resp?.result?.documentChanges || [] } };
}

async function cliCompletion(file, language, line, character, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  await pool.ensureOpen(s, lang, file);
  const resp = await pool._request(s, 'textDocument/completion', { textDocument: { uri: toUri(file) }, position: { line: line - 1, character } });
  const items = (resp?.result?.items || resp?.result || []).slice(0, 10).map(it => ({ label: it.label, detail: it.detail, kind: it.kind }));
  return { ok: true, language: lang, workspace: r.workspace, data: { items, count: items.length } };
}

async function cliCodeActions(file, language, startLine, endLine, pool) {
  const r = pool.resolveFile(file);
  const lang = language || r.language;
  const s = await pool.getOrStart(lang, r.workspace);
  const resp = await pool._request(s, 'textDocument/codeAction', {
    textDocument: { uri: toUri(file) },
    range: { start: { line: (startLine || 1) - 1, character: 0 }, end: { line: (endLine || startLine || 1) - 1, character: 0 } },
    context: { diagnostics: [] }
  });
  return { ok: true, language: lang, workspace: r.workspace, data: { actions: resp?.result || [] } };
}

async function cliHealth(language, pool) {
  const results = {}, checked = new Set();
  for (const [wn, ws] of Object.entries(mesh.workspaces)) {
    for (const sn of ws.servers) {
      if (language && sn !== language) continue;
      const key = `${sn}@${wn}`; if (checked.has(key)) continue;
      checked.add(key);
      try { const s = await pool.getOrStart(sn, wn); results[key] = { status: 'running', pid: s.proc.pid }; }
      catch (e) { results[key] = { status: 'error', message: e.message }; }
    }
  }
  return { ok: true, data: results };
}

// ═══════════════════════════════════════════════════════════════════════
// MCP mode (only when no CLI args)
// ═══════════════════════════════════════════════════════════════════════
if (!CLI_MODE) {
  const pool = new LspPool();
  process.stdin.setEncoding('utf8');
  let buf = '';
  process.stdin.on('data', (c) => { buf += c; const lines = buf.split('\n'); buf = lines.pop() || ''; for (const l of lines) { if (l.trim()) try { handle(JSON.parse(l)); } catch {} } });
  process.stdin.on('end', () => { pool.shutdownAll(); process.exit(0); });

  const TOOLS = [
    { name:'lsp_definition', description:'Go to definition of a symbol', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'} }, required:['file','line'] } },
    { name:'lsp_references', description:'Find all references to a symbol', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'} }, required:['file','line'] } },
    { name:'lsp_hover', description:'Get type info and documentation', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'} }, required:['file','line'] } },
    { name:'lsp_symbols', description:'List document symbols', inputSchema:{ type:'object', properties:{ file:{type:'string'} }, required:['file'] } },
    { name:'lsp_diagnostics', description:'Get diagnostics for a file', inputSchema:{ type:'object', properties:{ file:{type:'string'} }, required:['file'] } },
    { name:'lsp_completion', description:'Get completions at a position', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'} }, required:['file','line'] } },
    { name:'lsp_code_actions', description:'Get code actions', inputSchema:{ type:'object', properties:{ file:{type:'string'}, startLine:{type:'number'}, endLine:{type:'number'} }, required:['file','startLine','endLine'] } },
    { name:'lsp_rename', description:'Rename a symbol', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'}, newName:{type:'string'} }, required:['file','line','newName'] } },
    { name:'lsp_health', description:'Health check all LSP servers', inputSchema:{ type:'object', properties:{ language:{type:'string'} } } },
    { name:'lsp_shutdown', description:'Shutdown all LSP servers', inputSchema:{ type:'object', properties:{} } },
  ];

  async function handle(msg) {
    try {
      switch (msg.method) {
        case 'initialize': return respond(msg.id, { protocolVersion: PROTO_VERSION, capabilities: { tools:{}, resources:{} }, serverInfo: { name:'kloel-lsp-router', version:'2.0.0' } });
        case 'tools/list': return respond(msg.id, { tools: TOOLS });
        case 'tools/call': return await mcpToolCall(msg);
        default: return respond(msg.id, {});
      }
    } catch(e) { respond(msg.id, { content:[{type:'text', text:JSON.stringify({error:e.message})}], isError:true }); }
  }

  async function mcpToolCall(msg) {
    const id = msg.id, { name, arguments: args } = msg.params;
    try {
      switch (name) {
        case 'lsp_definition': return mcpOp(id, args, 'definition');
        case 'lsp_references': return mcpOp(id, args, 'references');
        case 'lsp_hover': return mcpOp(id, args, 'hover');
        case 'lsp_symbols': return mcpOp(id, args, 'symbols');
        case 'lsp_diagnostics': return mcpOp(id, args, 'diagnostics');
        case 'lsp_completion': return mcpOp(id, args, 'completion');
        case 'lsp_code_actions': return mcpOp(id, args, 'code_actions');
        case 'lsp_rename': return mcpOp(id, args, 'rename');
        case 'lsp_health': { const r = await cliHealth(args?.language, pool); return respond(id, { content: [{type:'text', text: JSON.stringify(r)}] }); }
        case 'lsp_shutdown': pool.shutdownAll(); return respond(id, { content: [{type:'text', text: 'shutdown complete'}] });
        default: return respond(id, { content: [{type:'text', text: JSON.stringify({error: `unknown tool: ${name}`})}] });
      }
    } catch(e) { return respond(id, { content: [{type:'text', text: JSON.stringify({error: e.message})}] }); }
  }

  async function mcpOp(id, args, op) {
    const r = await (async () => {
      switch (op) {
        case 'diagnostics': return await cliDiagnostics(args.file, args.language, pool);
        case 'hover': return await cliHover(args.file, args.language, args.line, args.character, pool);
        case 'references': return await cliReferences(args.file, args.language, args.line, args.character, pool);
        case 'definition': return await cliDefinition(args.file, args.language, args.line, args.character, pool);
        case 'symbols': return await cliSymbols(args.file, args.language, pool);
        case 'rename': return await cliRename(args.file, args.language, args.line, args.character, args.newName, pool);
        case 'completion': return await cliCompletion(args.file, args.language, args.line, args.character, pool);
        case 'code_actions': return await cliCodeActions(args.file, args.language, args.startLine, args.endLine, pool);
        default: return { ok: false, error: `unknown op: ${op}` };
      }
    })();
    return respond(id, { content: [{ type: 'text', text: JSON.stringify(r) }] });
  }

  function respond(id, result) {
    if (id === undefined) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  }
}

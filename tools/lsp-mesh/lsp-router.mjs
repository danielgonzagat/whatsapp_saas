#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MESH_PATH = resolve(__dirname, 'lsp-mesh.json');
const mesh = JSON.parse(readFileSync(MESH_PATH, 'utf8'));

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
      cwd: ws.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env },
    });

    // ID-keyed resolver map — fixes concurrent-request response routing.
    let buffer = '';
    const resolvers = new Map();      // id -> (msg) => void
    const notifications = [];         // server-initiated notifications (no id)
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
            const r = resolvers.get(msg.id);
            resolvers.delete(msg.id);
            r(msg);
          } else if (msg.method) {
            // server notification (publishDiagnostics, etc.) — buffer for diagnostics call
            notifications.push(msg);
            if (notifications.length > 50) notifications.shift();
          }
        } catch {}
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', () => { this.servers.delete(k); for (const r of resolvers.values()) r({error: 'lsp process exited'}); });

    s = { proc, resolvers, notifications, seq: 0, workspace, lastUsed: Date.now() };
    this.servers.set(k, s);     // ← bug fix: previously `set(k)` lost the value, spawning new procs on every call

    await this._request(s, 'initialize', {
      processId: process.pid,
      rootUri: `file://${ws.cwd}`,
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didChange: true, didClose: true },
          definition: { linkSupport: true },
          references: {},
          hover: { contentFormat: ['plaintext', 'markdown'] },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          completion: { completionItem: { snippetSupport: false } },
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix','refactor','source'] } } },
          rename: { prepareSupport: true },
          publishDiagnostics: {},
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
      const timeout = setTimeout(() => { s.resolvers.delete(id); reject(new Error(`LSP request timeout: ${method}`)); }, 15000);
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
    const text = readFileSync(file, 'utf8');
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
    const extMap = { '.ts':'typescript','.tsx':'typescript','.js':'typescript','.jsx':'typescript','.mjs':'typescript','.cjs':'typescript','.prisma':'prisma','.css':'css','.html':'html','.htm':'html','.json':'json','.yaml':'yaml','.yml':'yaml','.sh':'bash','.bash':'bash','.zsh':'bash','.sql':'sql','.md':'markdown','.markdown':'markdown','.toml':'toml' };
    const lang = extMap[ext] || 'typescript';
    if (ws.servers.includes(lang)) return { language: lang, workspace: bestWs };
    for (const [n, w] of Object.entries(mesh.workspaces)) { if (w.servers.includes(lang)) return { language: lang, workspace: n }; }
    return { language: lang, workspace: 'root' };
  }
}

const pool = new LspPool();

process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (c) => { buf += c; const lines = buf.split('\n'); buf = lines.pop() || ''; for (const l of lines) { if (l.trim()) try { handle(JSON.parse(l)); } catch {} } });
process.stdin.on('end', () => { pool.shutdownAll(); process.exit(0); });

async function handle(msg) {
  try {
    switch (msg.method) {
      case 'initialize': return respond(msg.id, { capabilities: { tools:{}, resources:{} }, serverInfo: { name:'kloel-lsp-router', version:'2.0.0' } });
      case 'tools/list': return respond(msg.id, { tools: TOOLS });
      case 'tools/call': return await handleToolCall(msg);
      default: return respond(msg.id, {});
    }
  } catch(e) { respond(msg.id, { content:[{type:'text', text:JSON.stringify({error:e.message})}], isError:true }); }
}

const TOOLS = [
  { name:'lsp_definition', description:'Go to definition of a symbol', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'}, symbol:{type:'string'} }, required:['file','line'] } },
  { name:'lsp_references', description:'Find all references to a symbol', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'}, symbol:{type:'string'} }, required:['file','line'] } },
  { name:'lsp_hover', description:'Get type info and documentation', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'}, symbol:{type:'string'} }, required:['file','line'] } },
  { name:'lsp_symbols', description:'List document symbols in a file', inputSchema:{ type:'object', properties:{ file:{type:'string'} }, required:['file'] } },
  { name:'lsp_diagnostics', description:'Get diagnostics for a file', inputSchema:{ type:'object', properties:{ file:{type:'string'} }, required:['file'] } },
  { name:'lsp_completion', description:'Get completions at a position', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'} }, required:['file','line'] } },
  { name:'lsp_code_actions', description:'Get code actions for a range', inputSchema:{ type:'object', properties:{ file:{type:'string'}, startLine:{type:'number'}, endLine:{type:'number'} }, required:['file','startLine','endLine'] } },
  { name:'lsp_rename', description:'Preview rename of a symbol', inputSchema:{ type:'object', properties:{ file:{type:'string'}, line:{type:'number'}, character:{type:'number'}, symbol:{type:'string'}, newName:{type:'string'} }, required:['file','line','newName'] } },
  { name:'lsp_health', description:'Health check all LSP servers', inputSchema:{ type:'object', properties:{ language:{type:'string'} } } },
  { name:'lsp_shutdown', description:'Shutdown all LSP server processes', inputSchema:{ type:'object', properties:{} } },
];

async function handleToolCall(msg) {
  const id = msg.id, { name, arguments: args } = msg.params;
  try {
    switch (name) {
      case 'lsp_definition': return await lspOp(id, args, 'textDocument/definition');
      case 'lsp_references': return await lspOp(id, args, 'textDocument/references', {context:{includeDeclaration:true}});
      case 'lsp_hover': return await lspOp(id, args, 'textDocument/hover');
      case 'lsp_symbols': return await lspSymbols(id, args);
      case 'lsp_diagnostics': return await lspDiagnostics(id, args);
      case 'lsp_completion': return await lspOp(id, args, 'textDocument/completion');
      case 'lsp_code_actions': return await lspCodeActions(id, args);
      case 'lsp_rename': return await lspRename(id, args);
      case 'lsp_health': return await lspHealth(id, args);
      case 'lsp_shutdown': pool.shutdownAll(); return respond(id, { content:[{type:'text', text:'All LSP servers shut down'}] });
      default: return respond(id, { content:[{type:'text', text:JSON.stringify({error:`unknown tool: ${name}`})}] });
    }
  } catch(e) { return respond(id, { content:[{type:'text', text:JSON.stringify({error:e.message})}] }); }
}

async function lspOp(id, args, method, extraParams={}) {
  const { file, line, character } = args;
  const { language, workspace } = pool.resolveFile(file);
  const s = await pool.getOrStart(language, workspace);
  await pool.ensureOpen(s, language, file);
  const r = await pool._request(s, method, {
    textDocument: { uri: toUri(file) },
    position: { line: (line||1)-1, character: character||0 },
    ...extraParams,
  });
  const rr = r?.result;
  let formatted = rr;
  if (method === 'textDocument/definition' && Array.isArray(rr)) formatted = rr.map(l=>({ uri:l.uri, range:l.range }));
  else if (method === 'textDocument/references' && Array.isArray(rr)) formatted = { count: rr.length, locations: rr.slice(0,30).map(l=>({ uri:l.uri, range:l.range })) };
  return respond(id, { content:[{type:'text', text:JSON.stringify({ language, workspace, result: formatted }, null, 2)}] });
}

async function lspSymbols(id, args) {
  const { file } = args;
  const { language, workspace } = pool.resolveFile(file);
  const s = await pool.getOrStart(language, workspace);
  await pool.ensureOpen(s, language, file);
  const r = await pool._request(s, 'textDocument/documentSymbol', { textDocument: { uri: toUri(file) } });
  const symbols = (r?.result || []).map(s=>({ name:s.name, kind:s.kind, line:s.range?.start?.line+1, children: s.children?.length }));
  return respond(id, { content:[{type:'text', text:JSON.stringify({ language, workspace, symbols, count: symbols.length }, null, 2)}] });
}

async function lspDiagnostics(id, args) {
  const { file } = args;
  const { language, workspace } = pool.resolveFile(file);
  const s = await pool.getOrStart(language, workspace);
  await pool.ensureOpen(s, language, file);
  await new Promise(r => setTimeout(r, 300));
  return respond(id, { content:[{type:'text', text:JSON.stringify({ language, workspace, file, opened:true }, null, 2)}] });
}

async function lspCodeActions(id, args) {
  const { file, startLine, endLine } = args;
  const { language, workspace } = pool.resolveFile(file);
  const s = await pool.getOrStart(language, workspace);
  const r = await pool._request(s, 'textDocument/codeAction', { textDocument:{uri:toUri(file)}, range:{start:{line:(startLine||1)-1,character:0},end:{line:(endLine||1)-1,character:0}}, context:{diagnostics:[]} });
  return respond(id, { content:[{type:'text', text:JSON.stringify({ language, workspace, actions: r?.result || [] }, null, 2)}] });
}

async function lspRename(id, args) {
  const { file, line, character, newName } = args;
  const { language, workspace } = pool.resolveFile(file);
  const s = await pool.getOrStart(language, workspace);
  await pool.ensureOpen(s, language, file);
  const r = await pool._request(s, 'textDocument/rename', { textDocument:{uri:toUri(file)}, position:{line:(line||1)-1,character:character||0}, newName });
  return respond(id, { content:[{type:'text', text:JSON.stringify({ language, workspace, changes: r?.result }, null, 2)}] });
}

async function lspHealth(id, args) {
  const results = {}, checked = new Set();
  for (const [wn, ws] of Object.entries(mesh.workspaces)) {
    for (const sn of ws.servers) {
      if (args?.language && sn !== args.language) continue;
      if (checked.has(sn)) continue;
      checked.add(sn);
      try { const s = await pool.getOrStart(sn, wn); results[`${sn}@${wn}`] = { status:'running', pid:s.proc.pid }; }
      catch(e) { results[`${sn}@${wn}`] = { status:'error', message:e.message }; }
    }
  }
  return respond(id, { content:[{type:'text', text:JSON.stringify(results, null, 2)}] });
}

function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, result })+'\n'); }
function toUri(fp) { return `file://${resolve(fp)}`; }

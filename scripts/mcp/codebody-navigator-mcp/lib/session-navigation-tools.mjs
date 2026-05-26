export function createSessionNavigationTools({ workspaceRoot, sessions, codegraph, fs }) {
  function navStartSession({ goal, label } = {}) {
    const session = sessions.startSession({ workspaceRoot, goal, label });
    return { session, codegraph: codegraph.status() };
  }

  function navWhereAmI() {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session — call nav_start_session' };
    return {
      ok: true,
      sessionId: s.id,
      goal: s.goal,
      currentNode: s.currentNode,
      currentFile: s.currentFile,
      currentSymbol: s.currentSymbol,
      breadcrumbDepth: s.breadcrumbs.length,
      stats: s.stats,
      frontierCount: s.frontier.length,
      hypothesisCount: s.hypotheses.length,
      receiptCount: s.receipts.length,
    };
  }

  function navMoveToFile({ filePath, line, reason }) {
    if (!filePath) throw new Error('filePath required');
    const fileNode = codegraph.resolveFileNode(filePath);
    const located = sessions.setLocation({
      kind: 'file',
      name: filePath.split('/').pop(),
      filePath,
      line: line || null,
      qualifiedName: filePath,
      nodeId: fileNode.ok ? (fileNode.node?.id ?? null) : null,
      reason,
    });
    const slice = fs.readWindowAround(filePath, line || 1, { radius: 15, maxLines: 60 });
    return { ...located, preview: slice.ok ? slice : { ok: false, error: slice.error } };
  }

  function navMoveToSymbol({ symbol, qualifiedName, reason }) {
    if (!symbol && !qualifiedName) throw new Error('symbol or qualifiedName required');
    let target = null;
    if (qualifiedName) {
      const r = codegraph.findByQualifiedName(qualifiedName);
      if (r.ok && r.node) target = r.node;
    }
    if (!target && symbol) {
      const r = codegraph.resolveSymbol(symbol);
      if (r.ok && r.candidates.length) target = r.candidates[0];
    }
    if (!target) return { ok: false, error: `symbol not found: ${symbol || qualifiedName}` };
    const located = sessions.setLocation({
      kind: target.kind,
      name: target.name,
      filePath: target.file_path,
      line: target.start_line,
      qualifiedName: target.qualified_name,
      nodeId: target.id,
      reason,
    });
    const slice = fs.readWindowAround(target.file_path, target.start_line, {
      radius: 20,
      maxLines: 80,
    });
    return { ok: true, ...located, target, preview: slice.ok ? slice : null };
  }

  function navBack() {
    return sessions.pop();
  }

  function navBreadcrumbs({ limit = 20 } = {}) {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session' };
    return { ok: true, breadcrumbs: s.breadcrumbs.slice(-limit) };
  }

  function navListSessions() {
    return { ok: true, sessions: sessions.listSessions() };
  }

  function navSwitchSession({ id }) {
    return { ok: true, session: sessions.switchSession(id) };
  }

  function navReadHere({ radius = 25, maxLines = 200 } = {}) {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session' };
    if (!s.currentFile) return { ok: false, error: 'no current file' };
    return fs.readWindowAround(s.currentFile, s.currentNode?.line || 1, { radius, maxLines });
  }

  return {
    nav_start_session: navStartSession,
    nav_where_am_i: navWhereAmI,
    nav_move_to_file: navMoveToFile,
    nav_move_to_symbol: navMoveToSymbol,
    nav_back: navBack,
    nav_breadcrumbs: navBreadcrumbs,
    nav_list_sessions: navListSessions,
    nav_switch_session: navSwitchSession,
    nav_read_here: navReadHere,
  };
}

import { readString } from './flow-engine.helpers';
import type { ExecutionState, FlowNode } from './flow-engine.types';
import { isUrlAllowed, safeRequest, validateUrl } from './utils/ssrf-protection';
import type { FlowNodeExecutorDeps, FlowNodeResult } from './flow-node-executor.types';

export async function executeApiNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const url = readString(node.data, 'url');
  const method = readString(node.data, 'method', 'GET');
  const headers = readString(node.data, 'headers', '{}');
  const body = readString(node.data, 'body');
  const saveAs = readString(node.data, 'saveAs', 'api_result');
  try {
    const allowlist = (process.env.API_NODE_ALLOWLIST || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    const validation = await validateUrl(url);
    if (!validation.valid) {
      deps.log.warn('api_node_ssrf_blocked', {
        user: state.user,
        url: url.substring(0, 100),
        error: validation.error,
      });
      throw new Error(`api_node_blocked: ${validation.error}`);
    }

    if (!isUrlAllowed(url, allowlist)) {
      throw new Error('api_node_blocked_not_allowlisted');
    }

    const parsedHeaders: Record<string, string> = headers ? JSON.parse(headers) : {};

    const res = await safeRequest({
      url,
      method,
      headers: parsedHeaders,
      ...(body.length ? { body } : {}),
      timeout: 10000,
      maxRedirects: 3,
      allowlist,
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    state.variables[saveAs] = parsed;
    return node.next ?? 'END';
  } catch (err) {
    deps.log.error('api_node_error', {
      user: state.user,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

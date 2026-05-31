/** Resolve a default workspaceId for non-production environments. */
export function resolveDefaultWorkspaceId(): string | undefined {
  if (process.env.NODE_ENV !== 'production') {
    return 'ws-test-001';
  }
  return undefined;
}

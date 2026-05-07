import { KloelContextFormatter } from './kloel-context-formatter';

/** Input type for buildWorkspaceProductContext — derived from the formatter method signature. */
export type WorkspaceProductContextInput = Parameters<
  KloelContextFormatter['buildWorkspaceProductContext']
>[0];

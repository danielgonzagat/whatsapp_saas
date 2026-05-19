/** Message shape. */
export interface Message {
  /** Id property. */
  id: string;
  /** Role property. */
  role: 'user' | 'assistant';
  /** Content property. */
  content: string;
  /** Is streaming property. */
  isStreaming?: boolean | undefined;
  eventType?: 'tool_call' | 'tool_result' | undefined;
  meta?: Record<string, unknown> | undefined;
}

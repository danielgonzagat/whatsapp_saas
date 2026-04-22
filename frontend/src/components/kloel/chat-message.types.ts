/** Message shape. */
export interface Message {
  /** Id property. */
  id: string;
  /** Role property. */
  role: 'user' | 'assistant';
  /** Content property. */
  content: string;
  /** Is streaming property. */
  isStreaming?: boolean;
  /** Event type property. */
  eventType?: 'tool_call' | 'tool_result';
  /** Meta property. */
  meta?: Record<string, unknown>;
}

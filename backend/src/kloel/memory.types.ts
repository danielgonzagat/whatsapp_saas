/** Memory item shape. */
export interface MemoryItem {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Key property. */
  key: string;
  /** Value property. */
  value: unknown;
  /** Category property. */
  category: string;
  /** Content property. */
  content: string;
  /** Similarity property. */
  similarity?: number;
}

/** Search result shape. */
export interface SearchResult {
  /** Memories property. */
  memories: MemoryItem[];
  /** Total found property. */
  totalFound: number;
  /** Search time property. */
  searchTime: number;
}

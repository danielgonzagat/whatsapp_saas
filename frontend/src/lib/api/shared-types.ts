/** Sales report summary shape. */
export interface SalesReportSummary {
  /** Total sales property. */
  totalSales: number;
  /** Total amount property. */
  totalAmount: number;
}

/** Knowledge source item shape. */
export interface KnowledgeSourceItem {
  /** Id property. */
  id: string;
  /** Type property. */
  type: 'TEXT' | 'URL' | 'PDF';
  /** Content property. */
  content?: string;
  /** Status property. */
  status?: string;
  /** Created at property. */
  createdAt?: string;
}

/** Knowledge base item shape. */
export interface KnowledgeBaseItem {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Sources property. */
  sources?: KnowledgeSourceItem[];
  /** Created at property. */
  createdAt?: string;
}

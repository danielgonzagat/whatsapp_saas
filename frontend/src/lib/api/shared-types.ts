/** Sales report summary shape. */
export interface SalesReportSummary {
  totalSales: number;
  totalAmount: number;
}

/** Knowledge source item shape. */
export interface KnowledgeSourceItem {
  id: string;
  type: 'TEXT' | 'URL' | 'PDF';
  content?: string;
  status?: string;
  createdAt?: string;
}

/** Knowledge base item shape. */
export interface KnowledgeBaseItem {
  id: string;
  name: string;
  sources?: KnowledgeSourceItem[];
  createdAt?: string;
}

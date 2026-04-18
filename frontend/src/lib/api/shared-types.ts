export interface SalesReportSummary {
  totalSales: number;
  totalAmount: number;
}

export interface KnowledgeSourceItem {
  id: string;
  type: 'TEXT' | 'URL' | 'PDF';
  content?: string;
  status?: string;
  createdAt?: string;
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  sources?: KnowledgeSourceItem[];
  createdAt?: string;
}

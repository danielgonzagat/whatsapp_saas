export interface Webinar {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  date: string;
  productId?: string | null;
  status: string;
  createdAt: string;
}

export interface WebinarListResponse {
  webinars?: Webinar[];
}

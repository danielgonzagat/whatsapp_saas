export interface Followup {
  id: string;
  key: string;
  phone: string;
  contactId: string;
  message: string;
  scheduledFor: string;
  delayMinutes: number;
  status: 'pending' | 'executed' | 'cancelled';
  createdAt: string;
  executedAt?: string;
}

export interface FollowupsResponse {
  total: number;
  followups: Followup[];
}

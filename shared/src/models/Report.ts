export interface Report {
  id: string;
  reporterUserId: string;
  entityType: 'organization' | 'event' | 'user';
  entityId: string;
  reason: 'impersonation' | 'inappropriate_content' | 'spam' | 'other';
  description?: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolvedByUserId?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface Report {
  id: string;
  reporterUserId: string | null; // null for system-generated reports
  entityType: 'organization' | 'event' | 'user' | 'system_audit';
  entityId: string;
  reason: 'impersonation' | 'inappropriate_content' | 'spam' | 'other';
  description?: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolvedByUserId?: string;
  resolvedAt?: string; // ISO UTC
  createdAt: string; // ISO UTC
}

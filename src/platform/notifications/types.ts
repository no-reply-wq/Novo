/**
 * In-app notification types — Agent W2
 */

export type NotificationType =
  | 'approval_requested'
  | 'approval_decided'
  | 'record_assigned'
  | 'workflow_failed'
  | 'mention'
  | 'due_date'
  | 'custom';

export interface AppNotification {
  id: string;
  tenantSlug: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;         // deep link to the relevant record/page
  appId?: string;
  recordId?: string;
  read: boolean;
  createdAt: Date;
}

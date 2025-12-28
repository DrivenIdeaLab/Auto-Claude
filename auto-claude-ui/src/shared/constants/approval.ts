/**
 * Approval Workflow Constants and Types
 */

export type ApprovalStatus = 
  | 'pending_approval' 
  | 'approved' 
  | 'rejected' 
  | 'changes_requested';

export type ApprovalRole = 'user' | 'admin' | 'qa_lead' | 'architect';

export type ApprovalAction = 'approve' | 'reject' | 'request_changes';

export interface ApprovalRequest {
  taskId: string;
  projectId: string;
  stage: 'spec' | 'qa' | 'final';
  status: ApprovalStatus;
  requestedAt: string;
  requiredRole: ApprovalRole;
  metadata?: Record<string, any>;
  history: ApprovalHistoryEntry[];
}

export interface ApprovalHistoryEntry {
  action: ApprovalAction;
  actor: string; // User ID or 'Auto-Claude'
  timestamp: string;
  comment?: string;
  stage: 'spec' | 'qa' | 'final';
}

export const APPROVAL_MATRIX: Record<string, { requiredRole: ApprovalRole; autoApproveIf?: string }> = {
  spec_review: {
    requiredRole: 'user',
    autoApproveIf: 'low_complexity' // Example condition
  },
  qa_review: {
    requiredRole: 'qa_lead',
    autoApproveIf: 'all_tests_passed'
  },
  final_signoff: {
    requiredRole: 'admin'
  }
};

export const APPROVAL_CHANNELS = {
  REQUEST_APPROVAL: 'approval:request',
  SUBMIT_APPROVAL: 'approval:submit',
  GET_STATUS: 'approval:get-status'
};

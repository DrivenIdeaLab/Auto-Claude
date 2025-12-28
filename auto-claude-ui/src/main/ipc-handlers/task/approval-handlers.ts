import { ipcMain } from 'electron';
import { approvalService } from '../../approval-service';
import { APPROVAL_CHANNELS, ApprovalAction } from '../../../shared/constants/approval';

export function registerApprovalHandlers(): void {
  
  ipcMain.handle(APPROVAL_CHANNELS.REQUEST_APPROVAL, async (_, taskId: string, stage: 'spec' | 'qa' | 'final', projectId: string) => {
    return await approvalService.requestApproval(taskId, stage, projectId);
  });

  ipcMain.handle(APPROVAL_CHANNELS.SUBMIT_APPROVAL, async (_, taskId: string, projectId: string, action: ApprovalAction, comment?: string) => {
    // In a real app, 'actor' would come from the authenticated user context
    const actor = 'user'; 
    return await approvalService.submitDecision(taskId, projectId, action, actor, comment);
  });
}

import { EventEmitter } from 'events';
import { projectStore } from './project-store';
import { notificationService } from './notification-service';
import {
  ApprovalRequest,
  ApprovalAction,
  ApprovalHistoryEntry,
  APPROVAL_MATRIX,
  ApprovalStatus
} from '../shared/constants/approval';
import { Task } from '../shared/types';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { AUTO_BUILD_PATHS, getSpecsDir } from '../shared/constants';

export class ApprovalService extends EventEmitter {

  /**
   * Helper to get task by scanning project's tasks
   */
  private getTask(projectId: string, taskId: string): Task | null {
    const tasks = projectStore.getTasks(projectId);
    return tasks.find(t => t.id === taskId) || null;
  }

  /**
   * Request approval for a specific task stage
   */
  async requestApproval(taskId: string, stage: 'spec' | 'qa' | 'final', projectId: string): Promise<ApprovalRequest | null> {
    const project = projectStore.getProject(projectId);
    if (!project) return null;

    const task = this.getTask(projectId, taskId);
    if (!task) return null;

    // Determine requirements from matrix
    const matrixKey = `${stage}_review`;
    const config = APPROVAL_MATRIX[matrixKey] || APPROVAL_MATRIX.final_signoff;

    const request: ApprovalRequest = {
      taskId,
      projectId,
      stage,
      status: 'pending_approval',
      requestedAt: new Date().toISOString(),
      requiredRole: config.requiredRole,
      history: []
    };

    // Persist to task's implementation plan
    this.updateTaskApprovalState(project.path, project.autoBuildPath || '', task.specId, request);

    // Notify - use the review-needed notification
    notificationService.notifyReviewNeeded(task.title, projectId, taskId);

    return request;
  }

  /**
   * Submit an approval decision
   */
  async submitDecision(
    taskId: string,
    projectId: string,
    action: ApprovalAction,
    actor: string,
    comment?: string
  ): Promise<boolean> {
    const project = projectStore.getProject(projectId);
    if (!project) return false;

    const task = this.getTask(projectId, taskId);
    if (!task || !task.metadata?.approval) return false;

    const currentRequest = task.metadata.approval;

    // Validate state
    if (currentRequest.status !== 'pending_approval') {
      console.warn(`[ApprovalService] Attempted to ${action} a task that is not pending approval.`);
      return false;
    }

    // Apply Decision
    const newStatus: ApprovalStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';

    const entry: ApprovalHistoryEntry = {
      action,
      actor,
      timestamp: new Date().toISOString(),
      comment,
      stage: currentRequest.stage
    };

    currentRequest.status = newStatus;
    currentRequest.history.push(entry);

    // Update Task
    this.updateTaskApprovalState(project.path, project.autoBuildPath || '', task.specId, currentRequest);

    // Handle Workflow Transitions
    if (newStatus === 'approved') {
      await this.handleApprovalGranted(task, currentRequest.stage);
    } else {
      await this.handleApprovalDenied(task, currentRequest.stage);
    }

    return true;
  }

  /**
   * Persist approval data to the task's implementation_plan.json
   */
  private updateTaskApprovalState(
    projectPath: string,
    autoBuildPath: string,
    specId: string,
    approvalData: ApprovalRequest
  ): void {
    const specsBaseDir = getSpecsDir(autoBuildPath);
    const specDir = path.join(projectPath, specsBaseDir, specId);
    const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

    if (!existsSync(planPath)) {
      console.warn('[ApprovalService] Implementation plan not found:', planPath);
      return;
    }

    try {
      const planContent = readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(planContent);

      // Store approval data in the plan's metadata
      if (!plan.metadata) plan.metadata = {};
      plan.metadata.approval = approvalData;
      plan.updated_at = new Date().toISOString();

      writeFileSync(planPath, JSON.stringify(plan, null, 2));
      console.log('[ApprovalService] Updated approval state for:', specId);
    } catch (error) {
      console.error('[ApprovalService] Failed to update approval state:', error);
    }
  }

  private async handleApprovalGranted(task: Task, stage: string) {
    // Use task complete notification for approved tasks
    notificationService.notifyTaskComplete(task.title, task.projectId, task.id);

    // Git Integration Trigger would go here
    if (stage === 'final') {
      // e.g., git tag v1.0.0-task-123
      console.log(`[ApprovalService] Triggering Git Tag for ${task.specId}`);
    }

    // Emit event for agent manager to proceed with next phase
    this.emit('approval-granted', task.id, stage);
  }

  private async handleApprovalDenied(task: Task, stage: string) {
    // Use task failed notification for denied/rejected tasks
    notificationService.notifyTaskFailed(task.title, task.projectId, task.id);
  }
}

export const approvalService = new ApprovalService();

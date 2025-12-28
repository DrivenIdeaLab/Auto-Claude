/**
 * Integration tests for ApprovalService
 * Tests full approval workflow with file system persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalService } from '../approval-service';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

// Mock dependencies
vi.mock('../project-store', () => ({
  projectStore: {
    getProject: vi.fn(),
    getTasks: vi.fn()
  }
}));

vi.mock('../notification-service', () => ({
  notificationService: {
    notifyReviewNeeded: vi.fn(),
    notifyTaskComplete: vi.fn(),
    notifyTaskFailed: vi.fn()
  }
}));

import { projectStore } from '../project-store';
import { notificationService } from '../notification-service';
import type { Task } from '../../shared/types';

describe('ApprovalService - Integration Tests', () => {
  let approvalService: ApprovalService;
  let tempDir: string;
  let autoBuildPath: string;
  let specDir: string;

  const createMockProject = (projectPath: string) => ({
    id: 'proj-integration',
    name: 'Integration Test Project',
    path: projectPath,
    autoBuildPath: autoBuildPath
  });

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-int-001',
    specId: '001-test-feature',
    projectId: 'proj-integration',
    title: 'Integration Test Task',
    description: 'Task for integration testing',
    status: 'in_progress',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    ...overrides
  });

  beforeEach(() => {
    // Create temp directory structure
    tempDir = path.join(os.tmpdir(), `approval-test-${Date.now()}`);
    autoBuildPath = ''; // Empty means use default (.auto-claude)

    // getSpecsDir('') returns '.auto-claude/specs'
    // So final path will be: tempDir / .auto-claude/specs / 001-test-feature
    const specsDir = path.join(tempDir, '.auto-claude', 'specs');
    specDir = path.join(specsDir, '001-test-feature');

    mkdirSync(specDir, { recursive: true });

    // Create implementation plan
    const plan = {
      spec_id: '001-test-feature',
      subtasks: [],
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    writeFileSync(
      path.join(specDir, 'implementation_plan.json'),
      JSON.stringify(plan, null, 2)
    );

    approvalService = new ApprovalService();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('Approval Request Creation', () => {
    it('should create approval request and persist to implementation plan', async () => {
      const mockTask = createMockTask();
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const request = await approvalService.requestApproval(
        'task-int-001',
        'spec',
        'proj-integration'
      );

      expect(request).toBeDefined();
      expect(request?.status).toBe('pending_approval');
      expect(request?.stage).toBe('spec');
      expect(request?.taskId).toBe('task-int-001');
      expect(request?.projectId).toBe('proj-integration');
      expect(request?.requiredRole).toBe('user');
      expect(request?.requestedAt).toBeDefined();
      expect(request?.history).toEqual([]);

      // Verify persistence to file
      const planPath = path.join(specDir, 'implementation_plan.json');
      expect(existsSync(planPath)).toBe(true);

      const savedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));
      expect(savedPlan.metadata.approval).toBeDefined();
      expect(savedPlan.metadata.approval.status).toBe('pending_approval');
      expect(savedPlan.metadata.approval.stage).toBe('spec');

      // Verify notification sent
      expect(notificationService.notifyReviewNeeded).toHaveBeenCalledWith(
        'Integration Test Task',
        'proj-integration',
        'task-int-001'
      );
    });

    it('should use correct required role for each stage', async () => {
      const mockTask = createMockTask();
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      // Spec review
      const specRequest = await approvalService.requestApproval(
        'task-int-001',
        'spec',
        'proj-integration'
      );
      expect(specRequest?.requiredRole).toBe('user');

      // QA review
      const qaRequest = await approvalService.requestApproval(
        'task-int-001',
        'qa',
        'proj-integration'
      );
      expect(qaRequest?.requiredRole).toBe('qa_lead');

      // Final signoff
      const finalRequest = await approvalService.requestApproval(
        'task-int-001',
        'final',
        'proj-integration'
      );
      expect(finalRequest?.requiredRole).toBe('admin'); // Changed from 'project_lead' to match actual matrix
    });

    it('should return null when project not found', async () => {
      vi.mocked(projectStore.getProject).mockReturnValue(null);

      const request = await approvalService.requestApproval(
        'task-int-001',
        'spec',
        'nonexistent-project'
      );

      expect(request).toBeNull();
      expect(notificationService.notifyReviewNeeded).not.toHaveBeenCalled();
    });

    it('should return null when task not found', async () => {
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([]);

      const request = await approvalService.requestApproval(
        'nonexistent-task',
        'spec',
        'proj-integration'
      );

      expect(request).toBeNull();
      expect(notificationService.notifyReviewNeeded).not.toHaveBeenCalled();
    });

    it('should handle missing implementation plan gracefully', async () => {
      const mockTask = createMockTask();
      const mockProject = createMockProject(tempDir);

      // Remove implementation plan
      const planPath = path.join(specDir, 'implementation_plan.json');
      if (existsSync(planPath)) {
        rmSync(planPath);
      }

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      // Should not throw error
      const request = await approvalService.requestApproval(
        'task-int-001',
        'spec',
        'proj-integration'
      );

      expect(request).toBeDefined();
      // Notification still sent even if persistence fails
      expect(notificationService.notifyReviewNeeded).toHaveBeenCalled();
    });
  });

  describe('Approval Decision Flow', () => {
    beforeEach(async () => {
      const mockTask = createMockTask();
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      // Create initial approval request
      await approvalService.requestApproval('task-int-001', 'spec', 'proj-integration');
      vi.clearAllMocks(); // Clear mocks from setup
    });

    it('should approve request and update persistence', async () => {
      const mockTask = createMockTask({
        metadata: {
          approval: {
            taskId: 'task-int-001',
            projectId: 'proj-integration',
            stage: 'spec',
            status: 'pending_approval',
            requestedAt: new Date().toISOString(),
            requiredRole: 'user',
            history: []
          }
        }
      });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const result = await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'approve',
        'john.doe@example.com',
        'Looks good to me!'
      );

      expect(result).toBe(true);

      // Verify persistence
      const planPath = path.join(specDir, 'implementation_plan.json');
      const savedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));

      expect(savedPlan.metadata.approval.status).toBe('approved');
      expect(savedPlan.metadata.approval.history).toHaveLength(1);
      expect(savedPlan.metadata.approval.history[0]).toMatchObject({
        action: 'approve',
        actor: 'john.doe@example.com',
        comment: 'Looks good to me!',
        stage: 'spec'
      });
      expect(savedPlan.metadata.approval.history[0].timestamp).toBeDefined();

      // Verify notification
      expect(notificationService.notifyTaskComplete).toHaveBeenCalledWith(
        'Integration Test Task',
        'proj-integration',
        'task-int-001'
      );
    });

    it('should reject request and update persistence', async () => {
      const mockTask = createMockTask({
        metadata: {
          approval: {
            taskId: 'task-int-001',
            projectId: 'proj-integration',
            stage: 'spec',
            status: 'pending_approval',
            requestedAt: new Date().toISOString(),
            requiredRole: 'user',
            history: []
          }
        }
      });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const result = await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'reject',
        'jane.smith@example.com',
        'Needs more work on error handling'
      );

      expect(result).toBe(true);

      // Verify persistence
      const planPath = path.join(specDir, 'implementation_plan.json');
      const savedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));

      expect(savedPlan.metadata.approval.status).toBe('rejected');
      expect(savedPlan.metadata.approval.history).toHaveLength(1);
      expect(savedPlan.metadata.approval.history[0]).toMatchObject({
        action: 'reject',
        actor: 'jane.smith@example.com',
        comment: 'Needs more work on error handling'
      });

      // Verify notification
      expect(notificationService.notifyTaskFailed).toHaveBeenCalledWith(
        'Integration Test Task',
        'proj-integration',
        'task-int-001'
      );
    });

    it('should request changes and update persistence', async () => {
      const mockTask = createMockTask({
        metadata: {
          approval: {
            taskId: 'task-int-001',
            projectId: 'proj-integration',
            stage: 'qa',
            status: 'pending_approval',
            requestedAt: new Date().toISOString(),
            requiredRole: 'qa_lead',
            history: []
          }
        }
      });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const result = await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'request_changes',
        'qa.lead@example.com',
        'Please add unit tests for edge cases'
      );

      expect(result).toBe(true);

      const planPath = path.join(specDir, 'implementation_plan.json');
      const savedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));

      expect(savedPlan.metadata.approval.status).toBe('changes_requested');
    });

    it('should fail when task is not in pending approval state', async () => {
      const mockTask = createMockTask({
        metadata: {
          approval: {
            taskId: 'task-int-001',
            projectId: 'proj-integration',
            stage: 'spec',
            status: 'approved', // Already approved
            requestedAt: new Date().toISOString(),
            requiredRole: 'user',
            history: []
          }
        }
      });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const result = await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'approve',
        'user@example.com'
      );

      expect(result).toBe(false);
      expect(notificationService.notifyTaskComplete).not.toHaveBeenCalled();
    });

    it('should fail when task has no approval request', async () => {
      const mockTask = createMockTask({ metadata: {} });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const result = await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'approve',
        'user@example.com'
      );

      expect(result).toBe(false);
    });
  });

  describe('Event Emission', () => {
    it('should emit approval-granted event on approval', async () => {
      const mockTask = createMockTask({
        metadata: {
          approval: {
            taskId: 'task-int-001',
            projectId: 'proj-integration',
            stage: 'spec',
            status: 'pending_approval',
            requestedAt: new Date().toISOString(),
            requiredRole: 'user',
            history: []
          }
        }
      });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const eventListener = vi.fn();
      approvalService.on('approval-granted', eventListener);

      await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'approve',
        'user@example.com'
      );

      expect(eventListener).toHaveBeenCalledWith('task-int-001', 'spec');
    });

    it('should not emit approval-granted event on rejection', async () => {
      const mockTask = createMockTask({
        metadata: {
          approval: {
            taskId: 'task-int-001',
            projectId: 'proj-integration',
            stage: 'spec',
            status: 'pending_approval',
            requestedAt: new Date().toISOString(),
            requiredRole: 'user',
            history: []
          }
        }
      });
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      const eventListener = vi.fn();
      approvalService.on('approval-granted', eventListener);

      await approvalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'reject',
        'user@example.com'
      );

      expect(eventListener).not.toHaveBeenCalled();
    });
  });

  describe('Persistence Across Restarts', () => {
    it('should persist approval state that survives service restart', async () => {
      const mockTask = createMockTask();
      const mockProject = createMockProject(tempDir);

      vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
      vi.mocked(projectStore.getTasks).mockReturnValue([mockTask]);

      // Create approval request
      await approvalService.requestApproval('task-int-001', 'spec', 'proj-integration');

      // Read persisted state
      const planPath = path.join(specDir, 'implementation_plan.json');
      const savedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));

      expect(savedPlan.metadata.approval).toBeDefined();
      expect(savedPlan.metadata.approval.status).toBe('pending_approval');

      // Simulate restart by creating new service instance
      const newApprovalService = new ApprovalService();

      // Create mock task with persisted approval state
      const taskWithApproval = createMockTask({
        metadata: { approval: savedPlan.metadata.approval }
      });

      vi.mocked(projectStore.getTasks).mockReturnValue([taskWithApproval]);

      // Submit decision with new service
      const result = await newApprovalService.submitDecision(
        'task-int-001',
        'proj-integration',
        'approve',
        'user@example.com',
        'Approved after restart'
      );

      expect(result).toBe(true);

      // Verify updated state
      const updatedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));
      expect(updatedPlan.metadata.approval.status).toBe('approved');
      expect(updatedPlan.metadata.approval.history).toHaveLength(1);
    });
  });
});

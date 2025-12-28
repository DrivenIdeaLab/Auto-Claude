import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalService } from '../approval-service';
import { projectStore } from '../project-store';
import { notificationService } from '../notification-service';
import { Task } from '../../shared/types';

// Mock dependencies
vi.mock('../project-store', () => ({
  projectStore: {
    getProject: vi.fn(),
    getTask: vi.fn(),
    saveProject: vi.fn(),
  },
}));

vi.mock('../notification-service', () => ({
  notificationService: {
    notify: vi.fn(),
  },
}));

describe('ApprovalService', () => {
  let approvalService: ApprovalService;
  const mockTask: Task = {
    id: 'task-123',
    specId: 'spec-001',
    projectId: 'proj-1',
    title: 'Test Task',
    description: 'Description',
    status: 'in_progress',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {}
  };

  const mockProject = {
    id: 'proj-1',
    path: '/tmp/proj-1',
    tasks: [mockTask]
  };

  beforeEach(() => {
    approvalService = new ApprovalService();
    vi.mocked(projectStore.getProject).mockReturnValue(mockProject as any);
    vi.mocked(projectStore.getTask).mockReturnValue(mockTask as any);
    // Reset metadata for each test
    mockTask.metadata = {}; 
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('requestApproval', () => {
    it('should create a pending approval request for spec review', async () => {
      const request = await approvalService.requestApproval('task-123', 'spec', 'proj-1');

      expect(request).toBeDefined();
      expect(request?.status).toBe('pending_approval');
      expect(request?.stage).toBe('spec');
      expect(request?.requiredRole).toBe('user'); // From matrix
      expect(mockTask.metadata?.approval).toEqual(request);
      expect(projectStore.saveProject).toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({
        type: 'info',
        title: expect.stringContaining('Approval Required')
      }));
    });

    it('should use correct role for qa review', async () => {
      const request = await approvalService.requestApproval('task-123', 'qa', 'proj-1');
      expect(request?.requiredRole).toBe('qa_lead'); // From matrix
    });

    it('should return null if task not found', async () => {
        vi.mocked(projectStore.getTask).mockReturnValue(undefined);
        const request = await approvalService.requestApproval('task-999', 'spec', 'proj-1');
        expect(request).toBeNull();
    });
  });

  describe('submitDecision', () => {
    beforeEach(async () => {
      // Setup a pending request
      await approvalService.requestApproval('task-123', 'spec', 'proj-1');
      vi.clearAllMocks(); // Clear mocks from setup
    });

    it('should approve a pending request', async () => {
      const result = await approvalService.submitDecision('task-123', 'proj-1', 'approve', 'admin-user', 'LGTM');

      expect(result).toBe(true);
      const approval = mockTask.metadata?.approval;
      expect(approval?.status).toBe('approved');
      expect(approval?.history).toHaveLength(1);
      expect(approval?.history[0].action).toBe('approve');
      expect(approval?.history[0].comment).toBe('LGTM');
      
      expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({
        type: 'success',
        title: 'Task Approved'
      }));
    });

    it('should reject a pending request', async () => {
        const result = await approvalService.submitDecision('task-123', 'proj-1', 'reject', 'admin-user', 'Needs work');
  
        expect(result).toBe(true);
        const approval = mockTask.metadata?.approval;
        expect(approval?.status).toBe('rejected');
        
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({
          type: 'error',
          title: 'Task Returned'
        }));
      });

    it('should fail if task is not pending approval', async () => {
        // Manually set status to approved
        if (mockTask.metadata?.approval) {
            mockTask.metadata.approval.status = 'approved';
        }

        const result = await approvalService.submitDecision('task-123', 'proj-1', 'approve', 'user');
        expect(result).toBe(false);
    });

    it('should fail if task has no approval request', async () => {
        mockTask.metadata = {}; // Clear metadata
        const result = await approvalService.submitDecision('task-123', 'proj-1', 'approve', 'user');
        expect(result).toBe(false);
    });
  });
});

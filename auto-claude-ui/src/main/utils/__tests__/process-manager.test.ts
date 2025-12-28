import { ProcessManager } from '../process-manager';
import { spawn } from 'child_process';

jest.mock('child_process');

describe('ProcessManager', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager(false);
    jest.clearAllMocks();
  });

  afterEach(() => {
    processManager.killAll();
  });

  describe('execute', () => {
    it('should execute a command successfully', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test output')), 10);
            }
          })
        },
        stderr: {
          on: jest.fn()
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 20);
          }
        }),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const result = await processManager.execute({
        id: 'test-1',
        command: 'echo',
        args: ['hello'],
        timeout: 1000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('test output');
      expect(result.timedOut).toBe(false);
    });

    it('should timeout and kill process', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          // Never emit close event to simulate hanging process
        }),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      await expect(
        processManager.execute({
          id: 'test-timeout',
          command: 'sleep',
          args: ['100'],
          timeout: 100 // 100ms timeout
        })
      ).rejects.toThrow('Process timed out after 100ms');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle process errors', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('spawn ENOENT')), 10);
          }
        }),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      await expect(
        processManager.execute({
          id: 'test-error',
          command: 'nonexistent',
          args: []
        })
      ).rejects.toThrow('spawn ENOENT');
    });

    it('should kill existing process with same ID', async () => {
      const mockProcess1 = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        killed: false
      };

      const mockProcess2 = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('output')), 10);
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 20);
          }
        }),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock)
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2);

      // Start first process (don't await - let it hang)
      const promise1 = processManager.execute({
        id: 'test-duplicate',
        command: 'sleep',
        args: ['100']
      });

      // Give it time to register
      await new Promise(resolve => setTimeout(resolve, 10));

      // Start second process with same ID
      const result = await processManager.execute({
        id: 'test-duplicate',
        command: 'echo',
        args: ['hello']
      });

      expect(mockProcess1.kill).toHaveBeenCalled();
      expect(result.exitCode).toBe(0);
    });
  });

  describe('kill', () => {
    it('should kill a running process', () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      processManager.execute({
        id: 'test-kill',
        command: 'sleep',
        args: ['100']
      });

      const killed = processManager.kill('test-kill');

      expect(killed).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(processManager.isRunning('test-kill')).toBe(false);
    });

    it('should return false for non-existent process', () => {
      const killed = processManager.kill('non-existent');
      expect(killed).toBe(false);
    });
  });

  describe('killAll', () => {
    it('should kill all running processes', () => {
      const mockProcesses = [
        {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn(),
          killed: false
        },
        {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn(),
          killed: false
        }
      ];

      (spawn as jest.Mock)
        .mockReturnValueOnce(mockProcesses[0])
        .mockReturnValueOnce(mockProcesses[1]);

      processManager.execute({
        id: 'test-1',
        command: 'sleep',
        args: ['100']
      });

      processManager.execute({
        id: 'test-2',
        command: 'sleep',
        args: ['100']
      });

      processManager.killAll();

      expect(mockProcesses[0].kill).toHaveBeenCalled();
      expect(mockProcesses[1].kill).toHaveBeenCalled();
      expect(processManager.getRunningProcessIds()).toHaveLength(0);
    });
  });

  describe('isRunning', () => {
    it('should return true for running process', () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      processManager.execute({
        id: 'test-running',
        command: 'sleep',
        args: ['100']
      });

      expect(processManager.isRunning('test-running')).toBe(true);
    });

    it('should return false for non-existent process', () => {
      expect(processManager.isRunning('non-existent')).toBe(false);
    });
  });

  describe('getProcessInfo', () => {
    it('should return process info', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        killed: false
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      processManager.execute({
        id: 'test-info',
        command: 'sleep',
        args: ['100'],
        description: 'Test process'
      });

      const info = processManager.getProcessInfo('test-info');

      expect(info).not.toBeNull();
      expect(info?.description).toBe('Test process');
      expect(info?.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent process', () => {
      const info = processManager.getProcessInfo('non-existent');
      expect(info).toBeNull();
    });
  });
});

/**
 * Integration tests for ProcessManager
 * Tests process lifecycle, timeout enforcement, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../process-manager';
import { platform } from 'os';

describe('ProcessManager - Integration Tests', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager(true); // Enable debug mode
  });

  afterEach(() => {
    // Ensure all processes are killed after each test
    processManager.killAll();
  });

  describe('Process Execution', () => {
    it('should execute simple command successfully', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'Hello World'] : ['Hello World'];

      const result = await processManager.execute({
        id: 'test-echo',
        command,
        args,
        description: 'Test echo command'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello World');
      expect(result.timedOut).toBe(false);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should capture stdout from long-running process', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sh';
      const script = isWindows
        ? ['/c', 'echo Line 1 && echo Line 2 && echo Line 3']
        : ['-c', 'echo "Line 1"; echo "Line 2"; echo "Line 3"'];

      const result = await processManager.execute({
        id: 'test-multiline',
        command,
        args: script
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Line 1');
      expect(result.stdout).toContain('Line 2');
      expect(result.stdout).toContain('Line 3');
    });

    it('should capture stderr from failing command', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sh';
      const args = isWindows
        ? ['/c', 'echo Error message 1>&2 && exit 1']
        : ['-c', 'echo "Error message" >&2; exit 1'];

      await expect(
        processManager.execute({
          id: 'test-stderr',
          command,
          args
        })
      ).rejects.toThrow(/Process exited with code 1/);
    });

    it('should handle non-existent command', async () => {
      await expect(
        processManager.execute({
          id: 'test-nonexistent',
          command: 'nonexistent-command-xyz',
          args: []
        })
      ).rejects.toThrow();
    });

    it('should track process as running during execution', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '2', '/nobreak'] : ['2'];

      // Start long-running process (don't await)
      const promise = processManager.execute({
        id: 'test-running',
        command,
        args,
        timeout: 5000
      });

      // Check that process is tracked
      await new Promise(resolve => setTimeout(resolve, 100)); // Give time to spawn
      expect(processManager.isRunning('test-running')).toBe(true);

      const processIds = processManager.getRunningProcessIds();
      expect(processIds).toContain('test-running');

      const info = processManager.getProcessInfo('test-running');
      expect(info).toBeDefined();
      expect(info?.uptime).toBeGreaterThan(0);

      // Wait for completion
      await promise;

      // Should no longer be tracked
      expect(processManager.isRunning('test-running')).toBe(false);
    });
  });

  describe('Timeout Enforcement', () => {
    it('should timeout process that exceeds timeout limit', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '10', '/nobreak'] : ['10'];

      await expect(
        processManager.execute({
          id: 'test-timeout',
          command,
          args,
          timeout: 1000 // 1 second timeout
        })
      ).rejects.toThrow(/timed out after 1000ms/);

      // Process should no longer be running
      expect(processManager.isRunning('test-timeout')).toBe(false);
    }, 15000); // Test timeout of 15 seconds

    it('should not timeout process that completes within timeout', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'Fast command'] : ['Fast command'];

      const result = await processManager.execute({
        id: 'test-no-timeout',
        command,
        args,
        timeout: 5000 // 5 second timeout
      });

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    });

    it('should handle timeout with cleanup', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '30', '/nobreak'] : ['30'];

      await expect(
        processManager.execute({
          id: 'test-timeout-cleanup',
          command,
          args,
          timeout: 500
        })
      ).rejects.toThrow(/timed out/);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Process should be cleaned up
      expect(processManager.isRunning('test-timeout-cleanup')).toBe(false);
      expect(processManager.getRunningProcessIds()).not.toContain('test-timeout-cleanup');
    }, 10000);
  });

  describe('Process Cleanup', () => {
    it('should kill existing process when executing with same ID', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '10', '/nobreak'] : ['10'];

      // Start first process
      const firstPromise = processManager.execute({
        id: 'test-duplicate',
        command,
        args,
        timeout: 15000
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(processManager.isRunning('test-duplicate')).toBe(true);

      // Start second process with same ID (should kill first)
      const secondPromise = processManager.execute({
        id: 'test-duplicate',
        command: isWindows ? 'cmd.exe' : 'echo',
        args: isWindows ? ['/c', 'echo', 'Second'] : ['Second'],
        timeout: 5000
      });

      // First should be killed/rejected
      await expect(firstPromise).rejects.toThrow();

      // Second should complete
      const result = await secondPromise;
      expect(result.exitCode).toBe(0);
    }, 20000);

    it('should kill specific process by ID', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '10', '/nobreak'] : ['10'];

      const promise = processManager.execute({
        id: 'test-kill',
        command,
        args,
        timeout: 15000
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(processManager.isRunning('test-kill')).toBe(true);

      // Kill the process
      const killed = processManager.kill('test-kill');
      expect(killed).toBe(true);

      // Process should be removed from tracking immediately
      expect(processManager.isRunning('test-kill')).toBe(false);

      // Promise should reject
      await expect(promise).rejects.toThrow();
    }, 20000);

    it('should kill all processes', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '10', '/nobreak'] : ['10'];

      // Start multiple processes
      const promises = [
        processManager.execute({ id: 'test-kill-all-1', command, args, timeout: 15000 }),
        processManager.execute({ id: 'test-kill-all-2', command, args, timeout: 15000 }),
        processManager.execute({ id: 'test-kill-all-3', command, args, timeout: 15000 })
      ];

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(processManager.getRunningProcessIds()).toHaveLength(3);

      // Kill all
      processManager.killAll();

      // All should be removed from tracking
      expect(processManager.getRunningProcessIds()).toHaveLength(0);

      // All promises should reject
      await expect(Promise.all(promises)).rejects.toThrow();
    }, 20000);

    it('should return false when killing non-existent process', () => {
      const killed = processManager.kill('nonexistent-process');
      expect(killed).toBe(false);
    });
  });

  describe('Concurrent Process Tracking', () => {
    it('should track multiple processes concurrently', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'echo';

      const promises = [
        processManager.execute({
          id: 'concurrent-1',
          command,
          args: isWindows ? ['/c', 'echo', 'Process 1'] : ['Process 1']
        }),
        processManager.execute({
          id: 'concurrent-2',
          command,
          args: isWindows ? ['/c', 'echo', 'Process 2'] : ['Process 2']
        }),
        processManager.execute({
          id: 'concurrent-3',
          command,
          args: isWindows ? ['/c', 'echo', 'Process 3'] : ['Process 3']
        })
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });

      // All should be completed and removed from tracking
      expect(processManager.getRunningProcessIds()).toHaveLength(0);
    });

    it('should track processes with unique descriptions', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '2', '/nobreak'] : ['2'];

      const promise1 = processManager.execute({
        id: 'described-1',
        command,
        args,
        timeout: 5000,
        description: 'First background task'
      });

      const promise2 = processManager.execute({
        id: 'described-2',
        command,
        args,
        timeout: 5000,
        description: 'Second background task'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const info1 = processManager.getProcessInfo('described-1');
      const info2 = processManager.getProcessInfo('described-2');

      expect(info1?.description).toBe('First background task');
      expect(info2?.description).toBe('Second background task');

      await Promise.all([promise1, promise2]);
    });
  });

  describe('Event Emission', () => {
    it('should emit stdout events', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'Event test'] : ['Event test'];

      const stdoutListener = vi.fn();
      processManager.on('stdout', stdoutListener);

      await processManager.execute({
        id: 'test-stdout-event',
        command,
        args
      });

      expect(stdoutListener).toHaveBeenCalled();
      expect(stdoutListener.mock.calls[0][0]).toBe('test-stdout-event');
      expect(stdoutListener.mock.calls[0][1]).toContain('Event test');

      processManager.off('stdout', stdoutListener);
    });

    it('should emit stderr events', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sh';
      const args = isWindows
        ? ['/c', 'echo Error output 1>&2']
        : ['-c', 'echo "Error output" >&2'];

      const stderrListener = vi.fn();
      processManager.on('stderr', stderrListener);

      try {
        await processManager.execute({
          id: 'test-stderr-event',
          command,
          args
        });
      } catch {
        // May fail due to exit code, that's ok
      }

      expect(stderrListener).toHaveBeenCalled();
      expect(stderrListener.mock.calls[0][0]).toBe('test-stderr-event');

      processManager.off('stderr', stderrListener);
    });
  });

  describe('Process Info', () => {
    it('should return null for non-existent process info', () => {
      const info = processManager.getProcessInfo('nonexistent');
      expect(info).toBeNull();
    });

    it('should return process uptime', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '2', '/nobreak'] : ['2'];

      const promise = processManager.execute({
        id: 'test-uptime',
        command,
        args,
        timeout: 5000,
        description: 'Uptime test'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const info = processManager.getProcessInfo('test-uptime');
      expect(info).toBeDefined();
      expect(info?.uptime).toBeGreaterThan(400); // At least 400ms uptime
      expect(info?.description).toBe('Uptime test');

      await promise;
    });
  });

  describe('Error Handling', () => {
    it('should handle spawn errors gracefully', async () => {
      await expect(
        processManager.execute({
          id: 'test-spawn-error',
          command: '/nonexistent/command',
          args: []
        })
      ).rejects.toThrow();

      // Should not be in tracking after error
      expect(processManager.isRunning('test-spawn-error')).toBe(false);
    });

    it('should handle invalid options gracefully', async () => {
      const isWindows = platform() === 'win32';

      await expect(
        processManager.execute({
          id: 'test-invalid-options',
          command: isWindows ? 'cmd.exe' : 'echo',
          args: [],
          spawnOptions: {
            cwd: '/totally/nonexistent/directory/path/12345'
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Debug Logging', () => {
    it('should enable/disable debug logging', () => {
      const debugManager = new ProcessManager(false);
      expect(() => {
        debugManager.setDebugEnabled(true);
        debugManager.setDebugEnabled(false);
      }).not.toThrow();
    });
  });
});

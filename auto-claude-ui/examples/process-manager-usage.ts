/**
 * ProcessManager Usage Examples
 *
 * This file demonstrates how to use the ProcessManager for Python subprocess calls
 * with timeout protection and proper cleanup.
 */

import { getProcessManager } from '../src/main/utils/process-manager';

// Example 1: Basic usage with timeout
async function runInsightsQuery(projectId: string, projectPath: string) {
  const processManager = getProcessManager(true); // debug enabled

  try {
    const result = await processManager.execute({
      id: `insights-${projectId}`,
      command: 'python',
      args: [
        'runners/insights_runner.py',
        '--project-dir', projectPath,
        '--message', 'Analyze the codebase'
      ],
      timeout: 5 * 60 * 1000, // 5 minutes
      description: `Insights query for project ${projectId}`
    });

    console.log('Insights completed successfully!');
    console.log('Duration:', result.duration, 'ms');
    console.log('Output:', result.stdout);
  } catch (err) {
    if (err.message.includes('timed out')) {
      console.error('Insights query timed out after 5 minutes');
    } else {
      console.error('Insights query failed:', err.message);
    }
  }
}

// Example 2: Streaming output in real-time
async function generateChangelogWithStreaming(projectId: string) {
  const processManager = getProcessManager();

  // Setup event listeners for streaming
  const handleStdout = (id: string, data: string) => {
    if (id === `changelog-${projectId}`) {
      console.log('[Changelog Output]', data);
    }
  };

  processManager.on('stdout', handleStdout);

  try {
    const result = await processManager.execute({
      id: `changelog-${projectId}`,
      command: 'python',
      args: ['-c', 'print("Generating changelog...")\nimport time\ntime.sleep(2)\nprint("Done!")'],
      timeout: 2 * 60 * 1000, // 2 minutes
      description: `Changelog generation for project ${projectId}`
    });

    console.log('Changelog generated successfully!');
  } catch (err) {
    console.error('Changelog generation failed:', err.message);
  } finally {
    // Cleanup listener
    processManager.off('stdout', handleStdout);
  }
}

// Example 3: Checking process status
function monitorProcesses() {
  const processManager = getProcessManager();

  // Check if a specific process is running
  if (processManager.isRunning('insights-project123')) {
    console.log('Insights query is still running');

    // Get process info
    const info = processManager.getProcessInfo('insights-project123');
    console.log('Process uptime:', info?.uptime, 'ms');
    console.log('Description:', info?.description);
  }

  // Get all running processes
  const runningIds = processManager.getRunningProcessIds();
  console.log('Active processes:', runningIds);
}

// Example 4: Killing processes
function killProcess(processId: string) {
  const processManager = getProcessManager();

  const killed = processManager.kill(processId);
  if (killed) {
    console.log(`Process ${processId} killed successfully`);
  } else {
    console.log(`Process ${processId} not found`);
  }
}

// Example 5: App exit cleanup (automatic)
function setupAppExitCleanup() {
  const processManager = getProcessManager();

  // This is done automatically by ProcessManager, but you can also do it manually
  process.on('beforeExit', () => {
    console.log('App exiting, killing all processes...');
    processManager.killAll();
  });
}

// Example 6: Error handling patterns
async function runWithProperErrorHandling(projectId: string) {
  const processManager = getProcessManager();

  try {
    const result = await processManager.execute({
      id: `analyzer-${projectId}`,
      command: 'python',
      args: ['analyzer.py', '--project-dir', '/path/to/project'],
      timeout: 2 * 60 * 1000,
      description: 'Project analysis'
    });

    // Success - process completed within timeout
    if (result.exitCode === 0) {
      console.log('Analysis successful:', result.stdout);
    } else {
      console.error('Analysis failed with exit code:', result.exitCode);
      console.error('Error output:', result.stderr);
    }
  } catch (err) {
    // Error occurred - timeout or spawn failure
    if (err.message.includes('timed out')) {
      console.error('TIMEOUT: Analysis took longer than 2 minutes');
      // Maybe show user a message to try again or check their codebase size
    } else if (err.message.includes('ENOENT')) {
      console.error('SPAWN ERROR: Python not found or script does not exist');
    } else {
      console.error('UNKNOWN ERROR:', err.message);
    }
  }
}

// Example 7: Multiple concurrent processes
async function runMultipleProcesses() {
  const processManager = getProcessManager();

  // Run multiple processes concurrently (different IDs)
  const promises = [
    processManager.execute({
      id: 'task-1',
      command: 'python',
      args: ['-c', 'print("Task 1")'],
      timeout: 60000
    }),
    processManager.execute({
      id: 'task-2',
      command: 'python',
      args: ['-c', 'print("Task 2")'],
      timeout: 60000
    }),
    processManager.execute({
      id: 'task-3',
      command: 'python',
      args: ['-c', 'print("Task 3")'],
      timeout: 60000
    })
  ];

  try {
    const results = await Promise.all(promises);
    console.log('All tasks completed:', results.map(r => r.stdout));
  } catch (err) {
    console.error('One or more tasks failed:', err);
  }
}

// Example 8: Before/After comparison
namespace BeforeAfter {
  // BEFORE: Manual process management (problematic)
  export async function oldWay() {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const proc = spawn('python', ['script.py']);

      let output = '';
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      proc.on('error', reject);

      // ❌ NO TIMEOUT - process could hang forever
      // ❌ NO CLEANUP - process not tracked
      // ❌ NO APP EXIT HANDLING - orphaned processes
    });
  }

  // AFTER: ProcessManager (recommended)
  export async function newWay() {
    const processManager = getProcessManager();

    const result = await processManager.execute({
      id: 'my-script',
      command: 'python',
      args: ['script.py'],
      timeout: 2 * 60 * 1000, // ✅ TIMEOUT PROTECTION
      description: 'My Python script'
    });

    // ✅ TRACKED - can check status with isRunning()
    // ✅ CLEANUP - killed on app exit automatically
    // ✅ TIMEOUT - process killed after 2 minutes
    // ✅ TYPE SAFE - full TypeScript support

    return result.stdout;
  }
}

export {
  runInsightsQuery,
  generateChangelogWithStreaming,
  monitorProcesses,
  killProcess,
  setupAppExitCleanup,
  runWithProperErrorHandling,
  runMultipleProcesses,
  BeforeAfter
};

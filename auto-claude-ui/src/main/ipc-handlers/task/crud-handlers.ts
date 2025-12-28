import { ipcMain } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';
import type { IPCResult, Task, TaskMetadata } from '../../../shared/types';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { projectStore } from '../../project-store';
import { titleGenerator } from '../../title-generator';
import { AgentManager } from '../../agent';
import { findTaskAndProject } from './shared';
import { validateProjectId, validateTaskId, validateOptionalString, withValidation } from '../../utils';

/**
 * Register task CRUD (Create, Read, Update, Delete) handlers
 */
export function registerTaskCRUDHandlers(agentManager: AgentManager): void {
  /**
   * List all tasks for a project
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST,
    withValidation(async (_, projectId: unknown): Promise<IPCResult<Task[]>> => {
      const validProjectId = validateProjectId(projectId);
      console.warn('[IPC] TASK_LIST called with projectId:', validProjectId);
      const tasks = projectStore.getTasks(validProjectId);
      console.warn('[IPC] TASK_LIST returning', tasks.length, 'tasks');
      return { success: true, data: tasks };
    })
  );

  /**
   * Create a new task
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_CREATE,
    withValidation(async (
      _,
      projectId: unknown,
      title: unknown,
      description: unknown,
      metadata?: TaskMetadata
    ): Promise<IPCResult<Task>> => {
      const validProjectId = validateProjectId(projectId);
      const validTitle = validateOptionalString(title, 'title') || '';
      const validDescription = validateOptionalString(description, 'description') || '';

      const project = projectStore.getProject(validProjectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Auto-generate title if empty using Claude AI
      let finalTitle = validTitle;
      if (!validTitle || !validTitle.trim()) {
        console.warn('[TASK_CREATE] Title is empty, generating with Claude AI...');
        try {
          const generatedTitle = await titleGenerator.generateTitle(validDescription);
          if (generatedTitle) {
            finalTitle = generatedTitle;
            console.warn('[TASK_CREATE] Generated title:', finalTitle);
          } else {
            // Fallback: create title from first line of description
            finalTitle = validDescription.split('\n')[0].substring(0, 60);
            if (finalTitle.length === 60) finalTitle += '...';
            console.warn('[TASK_CREATE] AI generation failed, using fallback:', finalTitle);
          }
        } catch (err) {
          console.error('[TASK_CREATE] Title generation error:', err);
          // Fallback: create title from first line of description
          finalTitle = validDescription.split('\n')[0].substring(0, 60);
          if (finalTitle.length === 60) finalTitle += '...';
        }
      }

      // Generate a unique spec ID based on existing specs
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specsDir = path.join(project.path, specsBaseDir);

      // Find next available spec number
      let specNumber = 1;
      if (existsSync(specsDir)) {
        const existingDirs = readdirSync(specsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        // Extract numbers from spec directory names (e.g., "001-feature" -> 1)
        const existingNumbers = existingDirs
          .map(name => {
            const match = name.match(/^(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(n => n > 0);

        if (existingNumbers.length > 0) {
          specNumber = Math.max(...existingNumbers) + 1;
        }
      }

      // Create spec ID with zero-padded number and slugified title
      const slugifiedTitle = finalTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
      const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

      // Create spec directory
      const specDir = path.join(specsDir, specId);
      mkdirSync(specDir, { recursive: true });

      // Build metadata with source type
      const taskMetadata: TaskMetadata = {
        sourceType: 'manual',
        ...metadata
      };

      // Process and save attached images
      if (taskMetadata.attachedImages && taskMetadata.attachedImages.length > 0) {
        const attachmentsDir = path.join(specDir, 'attachments');
        mkdirSync(attachmentsDir, { recursive: true });

        const savedImages: typeof taskMetadata.attachedImages = [];

        for (const image of taskMetadata.attachedImages) {
          if (image.data) {
            try {
              // Decode base64 and save to file
              const buffer = Buffer.from(image.data, 'base64');
              const imagePath = path.join(attachmentsDir, image.filename);
              writeFileSync(imagePath, buffer);

              // Store relative path instead of base64 data
              savedImages.push({
                id: image.id,
                filename: image.filename,
                mimeType: image.mimeType,
                size: image.size,
                path: `attachments/${image.filename}`
                // Don't include data or thumbnail to save space
              });
            } catch (err) {
              console.error(`Failed to save image ${image.filename}:`, err);
            }
          }
        }

        // Update metadata with saved image paths (without base64 data)
        taskMetadata.attachedImages = savedImages;
      }

      // Create initial implementation_plan.json (task is created but not started)
      const now = new Date().toISOString();
      const implementationPlan = {
        feature: finalTitle,
        description: validDescription,
        created_at: now,
        updated_at: now,
        status: 'pending',
        phases: []
      };

      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      writeFileSync(planPath, JSON.stringify(implementationPlan, null, 2));

      // Save task metadata if provided
      if (taskMetadata) {
        const metadataPath = path.join(specDir, 'task_metadata.json');
        writeFileSync(metadataPath, JSON.stringify(taskMetadata, null, 2));
      }

      // Create requirements.json with attached images
      const requirements: Record<string, unknown> = {
        task_description: validDescription,
        workflow_type: taskMetadata.category || 'feature'
      };

      // Add attached images to requirements if present
      if (taskMetadata.attachedImages && taskMetadata.attachedImages.length > 0) {
        requirements.attached_images = taskMetadata.attachedImages.map(img => ({
          filename: img.filename,
          path: img.path,
          description: '' // User can add descriptions later
        }));
      }

      const requirementsPath = path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS);
      writeFileSync(requirementsPath, JSON.stringify(requirements, null, 2));

      // Create the task object
      const task: Task = {
        id: specId,
        specId: specId,
        projectId: validProjectId,
        title: finalTitle,
        description: validDescription,
        status: 'backlog',
        subtasks: [],
        logs: [],
        metadata: taskMetadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      return { success: true, data: task };
    })
  );

  /**
   * Delete a task
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_DELETE,
    withValidation(async (_, taskId: unknown): Promise<IPCResult> => {
      const validTaskId = validateTaskId(taskId);
      const { rm } = await import('fs/promises');

      // Find task and project
      const { task, project } = findTaskAndProject(validTaskId);

      if (!task || !project) {
        return { success: false, error: 'Task or project not found' };
      }

      // Check if task is currently running
      const isRunning = agentManager.isRunning(validTaskId);
      if (isRunning) {
        return { success: false, error: 'Cannot delete a running task. Stop the task first.' };
      }

      // Delete the spec directory
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specDir = path.join(project.path, specsBaseDir, task.specId);

      try {
        if (existsSync(specDir)) {
          await rm(specDir, { recursive: true, force: true });
          console.warn(`[TASK_DELETE] Deleted spec directory: ${specDir}`);
        }
        return { success: true };
      } catch (error) {
        console.error('[TASK_DELETE] Error deleting spec directory:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete task files'
        };
      }
    })
  );

  /**
   * Update a task
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE,
    withValidation(async (
      _,
      taskId: unknown,
      updates: { title?: unknown; description?: unknown; metadata?: Partial<TaskMetadata> }
    ): Promise<IPCResult<Task>> => {
      try {
        const validTaskId = validateTaskId(taskId);
        const validTitle = validateOptionalString(updates.title, 'title');
        const validDescription = validateOptionalString(updates.description, 'description');

        // Find task and project
        const { task, project } = findTaskAndProject(validTaskId);

        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        const autoBuildDir = project.autoBuildPath || '.auto-claude';
        const specDir = path.join(project.path, autoBuildDir, 'specs', task.specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        // Auto-generate title if empty
        let finalTitle = validTitle;
        if (validTitle !== undefined && !validTitle.trim()) {
          // Get description to use for title generation
          const descriptionToUse = validDescription ?? task.description;
          console.warn('[TASK_UPDATE] Title is empty, generating with Claude AI...');
          try {
            const generatedTitle = await titleGenerator.generateTitle(descriptionToUse);
            if (generatedTitle) {
              finalTitle = generatedTitle;
              console.warn('[TASK_UPDATE] Generated title:', finalTitle);
            } else {
              // Fallback: create title from first line of description
              finalTitle = descriptionToUse.split('\n')[0].substring(0, 60);
              if (finalTitle.length === 60) finalTitle += '...';
              console.warn('[TASK_UPDATE] AI generation failed, using fallback:', finalTitle);
            }
          } catch (err) {
            console.error('[TASK_UPDATE] Title generation error:', err);
            // Fallback: create title from first line of description
            finalTitle = descriptionToUse.split('\n')[0].substring(0, 60);
            if (finalTitle.length === 60) finalTitle += '...';
          }
        }

        // Update implementation_plan.json
        const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
        if (existsSync(planPath)) {
          try {
            const planContent = readFileSync(planPath, 'utf-8');
            const plan = JSON.parse(planContent);

            if (finalTitle !== undefined) {
              plan.feature = finalTitle;
            }
            if (validDescription !== undefined) {
              plan.description = validDescription;
            }
            plan.updated_at = new Date().toISOString();

            writeFileSync(planPath, JSON.stringify(plan, null, 2));
          } catch {
            // Plan file might not be valid JSON, continue anyway
          }
        }

        // Update spec.md if it exists
        const specPath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
        if (existsSync(specPath)) {
          try {
            let specContent = readFileSync(specPath, 'utf-8');

            // Update title (first # heading)
            if (finalTitle !== undefined) {
              specContent = specContent.replace(
                /^#\s+.*$/m,
                `# ${finalTitle}`
              );
            }

            // Update description (## Overview section content)
            if (validDescription !== undefined) {
              // Replace content between ## Overview and the next ## section
              specContent = specContent.replace(
                /(## Overview\n)([\s\S]*?)((?=\n## )|$)/,
                `$1${validDescription}\n\n$3`
              );
            }

            writeFileSync(specPath, specContent);
          } catch {
            // Spec file update failed, continue anyway
          }
        }

        // Update metadata if provided
        let updatedMetadata = task.metadata;
        if (updates.metadata) {
          updatedMetadata = { ...task.metadata, ...updates.metadata };

          // Process and save attached images if provided
          if (updates.metadata.attachedImages && updates.metadata.attachedImages.length > 0) {
            const attachmentsDir = path.join(specDir, 'attachments');
            mkdirSync(attachmentsDir, { recursive: true });

            const savedImages: typeof updates.metadata.attachedImages = [];

            for (const image of updates.metadata.attachedImages) {
              // If image has data (new image), save it
              if (image.data) {
                try {
                  const buffer = Buffer.from(image.data, 'base64');
                  const imagePath = path.join(attachmentsDir, image.filename);
                  writeFileSync(imagePath, buffer);

                  savedImages.push({
                    id: image.id,
                    filename: image.filename,
                    mimeType: image.mimeType,
                    size: image.size,
                    path: `attachments/${image.filename}`
                  });
                } catch (err) {
                  console.error(`Failed to save image ${image.filename}:`, err);
                }
              } else if (image.path) {
                // Existing image, keep it
                savedImages.push(image);
              }
            }

            updatedMetadata.attachedImages = savedImages;
          }

          // Update task_metadata.json
          const metadataPath = path.join(specDir, 'task_metadata.json');
          try {
            writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2));
          } catch (err) {
            console.error('Failed to update task_metadata.json:', err);
          }

          // Update requirements.json if it exists
          const requirementsPath = path.join(specDir, 'requirements.json');
          if (existsSync(requirementsPath)) {
            try {
              const requirementsContent = readFileSync(requirementsPath, 'utf-8');
              const requirements = JSON.parse(requirementsContent);

              if (validDescription !== undefined) {
                requirements.task_description = validDescription;
              }
              if (updates.metadata.category) {
                requirements.workflow_type = updates.metadata.category;
              }

              writeFileSync(requirementsPath, JSON.stringify(requirements, null, 2));
            } catch (err) {
              console.error('Failed to update requirements.json:', err);
            }
          }
        }

        // Build the updated task object
        const updatedTask: Task = {
          ...task,
          title: finalTitle ?? task.title,
          description: validDescription ?? task.description,
          metadata: updatedMetadata,
          updatedAt: new Date()
        };

        return { success: true, data: updatedTask };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    })
  );
}

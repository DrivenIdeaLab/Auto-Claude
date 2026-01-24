// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { TaskCard } from '../TaskCard';
import type { Task } from '../../../shared/types';

// Mock task-store
vi.mock('../../stores/task-store', () => ({
  startTask: vi.fn(),
  stopTask: vi.fn(),
  checkTaskRunning: vi.fn().mockResolvedValue(true),
  recoverStuckTask: vi.fn(),
  isIncompleteHumanReview: vi.fn().mockReturnValue(false),
  archiveTasks: vi.fn(),
}));

// Mock PhaseProgressIndicator
vi.mock('../PhaseProgressIndicator', () => ({
  PhaseProgressIndicator: () => <div data-testid="progress-indicator" />
}));

// Mock ui components that might cause issues or are heavy
vi.mock('../ui/card', () => ({
  Card: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => <div className={className} onClick={onClick} data-testid="card">{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
}));

vi.mock('../ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={className}>{children}</span>
}));

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => <button onClick={onClick} className={className}>{children}</button>
}));

describe('TaskCard', () => {
  const mockTask: Task = {
    id: 'task-1',
    specId: 'spec-1',
    projectId: 'proj-1',
    title: 'Test Task Title',
    description: 'Test Description',
    status: 'in_progress',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      category: 'feature',
      priority: 'high',
      complexity: 'medium'
    }
  };

  it('renders task title', () => {
    const handleClick = vi.fn();
    render(<TaskCard task={mockTask} onClick={handleClick} />);
    expect(screen.getByText('Test Task Title')).toBeDefined();
  });

  it('renders title as an interactive button', () => {
    const handleClick = vi.fn();
    render(<TaskCard task={mockTask} onClick={handleClick} />);

    // Find button with title text
    // This expects the title to be inside a button (which is what we want to implement)
    // If it's just text in a div/h3, getByRole('button') will fail
    const titleButton = screen.getByRole('button', { name: 'Test Task Title' });
    expect(titleButton).toBeDefined();

    // Verify click propagation
    fireEvent.click(titleButton);

    // Should call the passed onClick handler
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('prevents event bubbling from title button to card', () => {
    const handleCardClick = vi.fn();

    render(<TaskCard task={mockTask} onClick={handleCardClick} />);
    const titleButton = screen.getByRole('button', { name: 'Test Task Title' });

    fireEvent.click(titleButton);
    expect(handleCardClick).toHaveBeenCalledTimes(1);
  });
});

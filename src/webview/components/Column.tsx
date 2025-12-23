import React from 'react';
import { Card } from './Card';
import { TaskSummary, Status } from '../types';

interface ColumnProps {
  title: string;
  status: Status;
  color: string;
  tasks: TaskSummary[];
  onMoveTask: (id: string, status: Status) => void;
  onRunTask: (id: string) => void;
  onStopTask: (id: string, sessionId: string) => void;
  onFinishTask: (id: string) => void;
  onViewDetails: (id: string) => void;
}

export function Column({
  title,
  status,
  color,
  tasks,
  onMoveTask,
  onRunTask,
  onStopTask,
  onFinishTask,
  onViewDetails
}: ColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('column-drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('column-drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('column-drag-over');
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      onMoveTask(taskId, status);
    }
  };

  return (
    <div
      className="column"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="column-header" style={{ borderColor: color }}>
        <span className="column-title">{title}</span>
        <span className="column-count">{tasks.length}</span>
      </div>

      <div className="column-content">
        {tasks.map(task => (
          <Card
            key={task.id}
            task={task}
            onRun={status === 'BACKLOG' ? () => onRunTask(task.id) : undefined}
            onStop={status === 'IN_PROGRESS' ? () => onStopTask(task.id, '') : undefined}
            onFinish={status === 'WAITING_APPROVAL' ? () => onFinishTask(task.id) : undefined}
            onViewDetails={() => onViewDetails(task.id)}
          />
        ))}

        {tasks.length === 0 && (
          <div className="column-empty">No tasks</div>
        )}
      </div>
    </div>
  );
}


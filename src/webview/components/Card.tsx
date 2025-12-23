import React from 'react';
import { TaskSummary, LogEntry } from '../types';

interface CardProps {
  task: TaskSummary;
  onRun?: () => void;
  onStop?: () => void;
  onFinish?: () => void;
  onViewDetails: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  CORE: '#8b5cf6',
  UI: '#ec4899',
  API: '#06b6d4'
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e'
};

const LOG_TYPE_ICONS: Record<string, string> = {
  progress: '⚡',
  milestone: '🎯',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️'
};

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function Card({ task, onRun, onStop, onFinish, onViewDetails }: CardProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', task.id);
    e.currentTarget.classList.add('card-dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('card-dragging');
  };

  // Get the last 2 logs to display
  const logsToShow = task.recentLogs?.slice(-2) || [];

  return (
    <div
      className="card"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onViewDetails}
    >
      <div className="card-title">{task.title}</div>
      
      <div className="card-badges">
        <span 
          className="badge badge-category"
          style={{ backgroundColor: CATEGORY_COLORS[task.category] }}
        >
          {task.category}
        </span>
        <span 
          className="badge badge-priority"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
        >
          {task.priority}
        </span>
      </div>

      {logsToShow.length > 0 && (
        <div className="card-logs">
          {logsToShow.map((log, index) => (
            <div key={index} className={`card-log card-log-${log.type}`}>
              <span className="card-log-icon">{LOG_TYPE_ICONS[log.type]}</span>
              <span className="card-log-message">{log.message}</span>
              <span className="card-log-time">{formatTimeAgo(log.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {onRun && (
          <button className="card-action card-action-run" onClick={onRun} title="Run">
            ▶
          </button>
        )}
        {onStop && (
          <button className="card-action card-action-stop" onClick={onStop} title="Stop">
            ⏹
          </button>
        )}
        {onFinish && (
          <button className="card-action card-action-finish" onClick={onFinish} title="Finish">
            ✓
          </button>
        )}
      </div>
    </div>
  );
}

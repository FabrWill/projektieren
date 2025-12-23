import React, { useState } from 'react';
import { Task, Status } from '../types';

interface TaskDetailsProps {
  task: Task;
  onClose: () => void;
  onRun: (id: string) => void;
  onStop: (id: string, sessionId: string) => void;
  onFinish: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, status: Status) => void;
  onEdit: (task: Task) => void;
}

const STATUS_LABELS: Record<Status, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In Progress',
  WAITING_APPROVAL: 'Waiting Approval',
  FINISHED: 'Finished'
};

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

export function TaskDetails({
  task,
  onClose,
  onRun,
  onStop,
  onFinish,
  onDelete,
  onMove,
  onEdit
}: TaskDetailsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const activeSession = task.runSessions.find(s => s.status === 'running');

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    onDelete(task.id);
    setShowDeleteConfirm(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task.title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="details-content">
          <div className="details-section">
            <div className="details-row">
              <span className="details-label">Status:</span>
              <span className="details-value">{STATUS_LABELS[task.status]}</span>
            </div>

            <div className="details-row">
              <span className="details-label">Category:</span>
              <span 
                className="badge"
                style={{ backgroundColor: CATEGORY_COLORS[task.category] }}
              >
                {task.category}
              </span>
            </div>

            <div className="details-row">
              <span className="details-label">Priority:</span>
              <span 
                className="badge"
                style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
              >
                {task.priority}
              </span>
            </div>

            <div className="details-row">
              <span className="details-label">Branch:</span>
              <span className="details-value">
                {task.branchTarget.type === 'current' 
                  ? 'Current branch' 
                  : `${task.branchTarget.type}: ${task.branchTarget.name}`}
              </span>
            </div>

            <div className="details-row">
              <span className="details-label">Created:</span>
              <span className="details-value">{formatDate(task.createdAt)}</span>
            </div>

            <div className="details-row">
              <span className="details-label">Updated:</span>
              <span className="details-value">{formatDate(task.updatedAt)}</span>
            </div>
          </div>

          {task.description && (
            <div className="details-section">
              <h3>Description</h3>
              <p className="details-description">{task.description}</p>
            </div>
          )}

          <div className="details-section">
            <h3>History</h3>
            <div className="history-list">
              {task.history.map((entry, i) => (
                <div key={i} className="history-item">
                  <span className="history-time">{formatDate(entry.at)}</span>
                  <span className="history-text">
                    {entry.from ? `${STATUS_LABELS[entry.from]} → ` : ''}
                    {STATUS_LABELS[entry.to]}
                    <span className="history-by"> by {entry.by}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {task.runSessions.length > 0 && (
            <div className="details-section">
              <h3>Run Sessions</h3>
              <div className="sessions-list">
                {task.runSessions.map((session, i) => (
                  <div key={i} className="session-item-full">
                    <div className="session-header">
                      <span className="session-id">{session.sessionId}</span>
                      <span className={`session-status session-status-${session.status}`}>
                        {session.status}
                      </span>
                      <span className="session-time">
                        Started: {formatDate(session.startedAt)}
                        {session.endedAt && ` | Ended: ${formatDate(session.endedAt)}`}
                      </span>
                    </div>
                    {session.logs && session.logs.length > 0 && (
                      <div className="session-logs">
                        {session.logs.map((log, j) => (
                          <div key={j} className={`session-log session-log-${log.type}`}>
                            <span className="session-log-time">{formatDate(log.timestamp)}</span>
                            <span className="session-log-type">{log.type}</span>
                            <span className="session-log-message">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="delete-confirm-overlay">
            <div className="delete-confirm-dialog">
              <p>Are you sure you want to delete this task?</p>
              <div className="delete-confirm-actions">
                <button className="btn btn-secondary" onClick={handleDeleteCancel}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="details-actions">
          <div className="details-actions-left">
            <select
              className="move-select"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onMove(task.id, e.target.value as Status);
                }
              }}
            >
              <option value="">Move to...</option>
              <option value="BACKLOG">Backlog</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_APPROVAL">Waiting Approval</option>
              <option value="FINISHED">Finished</option>
            </select>

            <button className="btn btn-secondary" onClick={() => onEdit(task)}>
              ✎ Edit
            </button>

            <button className="btn btn-danger" onClick={handleDeleteClick}>
              Delete
            </button>
          </div>

          <div className="details-actions-right">
            {task.status === 'BACKLOG' && (
              <button className="btn btn-success" onClick={() => onRun(task.id)}>
                ▶ Run
              </button>
            )}
            {task.status === 'IN_PROGRESS' && activeSession && (
              <button 
                className="btn btn-warning" 
                onClick={() => onStop(task.id, activeSession.sessionId)}
              >
                ⏹ Stop
              </button>
            )}
            {task.status === 'WAITING_APPROVAL' && (
              <button className="btn btn-success" onClick={() => onFinish(task.id)}>
                ✓ Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


import React from 'react';
import { Column } from './Column';
import { BoardState, Status } from '../types';

interface BoardProps {
  boardState: BoardState;
  onMoveTask: (id: string, status: Status) => void;
  onRunTask: (id: string) => void;
  onStopTask: (id: string, sessionId: string) => void;
  onFinishTask: (id: string) => void;
  onViewDetails: (id: string) => void;
}

const COLUMNS: { key: keyof BoardState; status: Status; title: string; color: string }[] = [
  { key: 'backlog', status: 'BACKLOG', title: 'Backlog', color: '#6b7280' },
  { key: 'inProgress', status: 'IN_PROGRESS', title: 'In Progress', color: '#3b82f6' },
  { key: 'waitingApproval', status: 'WAITING_APPROVAL', title: 'Waiting Approval', color: '#f59e0b' },
  { key: 'finished', status: 'FINISHED', title: 'Finished', color: '#10b981' }
];

export function Board({
  boardState,
  onMoveTask,
  onRunTask,
  onStopTask,
  onFinishTask,
  onViewDetails
}: BoardProps) {
  return (
    <div className="board">
      {COLUMNS.map(column => (
        <Column
          key={column.key}
          title={column.title}
          status={column.status}
          color={column.color}
          tasks={boardState[column.key]}
          onMoveTask={onMoveTask}
          onRunTask={onRunTask}
          onStopTask={onStopTask}
          onFinishTask={onFinishTask}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
}


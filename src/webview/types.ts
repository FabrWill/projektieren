// Re-export types needed by the webview
// These mirror the types from core/types.ts

export type Status = 'BACKLOG' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'FINISHED';
export type Category = 'CORE' | 'UI' | 'API';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type BranchTargetType = 'current' | 'new';

// Project/Workspace types
export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface BranchTarget {
  type: BranchTargetType;
  name?: string;
}

export interface HistoryEntry {
  at: string;
  from: Status | null;
  to: Status;
  by: 'user' | 'agent' | 'system';
  reason?: string;
  sessionId?: string;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'progress' | 'milestone' | 'warning' | 'error' | 'info';
}

export interface RunSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'stopped' | 'completed';
  logs: LogEntry[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: Category;
  priority: Priority;
  branchTarget: BranchTarget;
  status: Status;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
  runSessions: RunSession[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: Status;
  category: Category;
  priority: Priority;
  updatedAt: string;
  recentLogs?: LogEntry[];
}

export interface BoardState {
  backlog: TaskSummary[];
  inProgress: TaskSummary[];
  waitingApproval: TaskSummary[];
  finished: TaskSummary[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  category: Category;
  priority: Priority;
  branchTarget: BranchTarget;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  category?: Category;
  priority?: Priority;
  branchTarget?: BranchTarget;
}

// Messages
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'createTask'; payload: CreateTaskInput }
  | { type: 'updateTask'; payload: { id: string; data: UpdateTaskInput } }
  | { type: 'deleteTask'; payload: { id: string } }
  | { type: 'moveTask'; payload: { id: string; status: Status } }
  | { type: 'runTask'; payload: { id: string } }
  | { type: 'stopTask'; payload: { id: string; sessionId: string } }
  | { type: 'finishTask'; payload: { id: string } }
  | { type: 'getTaskDetails'; payload: { id: string } }
  | { type: 'refresh' }
  | { type: 'switchProject'; payload: { projectId: string } };

export type ExtensionMessage =
  | { type: 'boardState'; payload: BoardState }
  | { type: 'taskDetails'; payload: Task }
  | { type: 'error'; payload: { message: string } }
  | { type: 'taskCreated'; payload: { id: string } }
  | { type: 'taskUpdated'; payload: { id: string } }
  | { type: 'taskRunStarted'; payload: { id: string; sessionId: string } }
  | { type: 'projectsState'; payload: { projects: Project[]; activeProjectId: string } };


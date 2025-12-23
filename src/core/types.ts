// Status enum
export type Status = 'BACKLOG' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'FINISHED';

// Category enum
export type Category = 'CORE' | 'UI' | 'API';

// Priority enum
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

// Branch target types
export type BranchTargetType = 'current' | 'new';

export interface BranchTarget {
  type: BranchTargetType;
  name?: string; // Required for 'new'
}

// History entry for status changes
export interface HistoryEntry {
  at: string; // ISO timestamp
  from: Status | null;
  to: Status;
  by: 'user' | 'agent' | 'system';
  reason?: string;
  sessionId?: string;
}

// Log entry for tracking progress
export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'progress' | 'milestone' | 'warning' | 'error' | 'info';
}

// Run session for tracking task execution
export interface RunSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'stopped' | 'completed';
  logs: LogEntry[];
}

// Main Task interface
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

// Input for creating a task
export interface CreateTaskInput {
  title: string;
  description?: string;
  category: Category;
  priority: Priority;
  branchTarget: BranchTarget;
}

// Input for updating a task
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  category?: Category;
  priority?: Priority;
  branchTarget?: BranchTarget;
}

// Input for updating status
export interface UpdateStatusInput {
  id: string;
  status: Status;
  reason?: string;
  by: 'user' | 'agent' | 'system';
  sessionId?: string;
}

// Filter options for listing tasks
export interface TaskFilters {
  status?: Status[];
  category?: Category[];
  priority?: Priority[];
  search?: string;
  limit?: number;
  cursor?: string;
}

// Paginated result
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

// Task summary for list view
export interface TaskSummary {
  id: string;
  title: string;
  status: Status;
  category: Category;
  priority: Priority;
  updatedAt: string;
  recentLogs?: LogEntry[];
}

// Board state for webview
export interface BoardState {
  backlog: TaskSummary[];
  inProgress: TaskSummary[];
  waitingApproval: TaskSummary[];
  finished: TaskSummary[];
}

// Project/Workspace types
export interface Project {
  id: string;
  name: string;
  path: string;
}

// Messages from webview to extension
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

// Messages from extension to webview
export type ExtensionMessage =
  | { type: 'boardState'; payload: BoardState }
  | { type: 'taskDetails'; payload: Task }
  | { type: 'error'; payload: { message: string } }
  | { type: 'taskCreated'; payload: { id: string } }
  | { type: 'taskUpdated'; payload: { id: string } }
  | { type: 'taskRunStarted'; payload: { id: string; sessionId: string } }
  | { type: 'projectsState'; payload: { projects: Project[]; activeProjectId: string } };


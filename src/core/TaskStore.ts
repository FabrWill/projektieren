import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskSummary,
  CreateTaskInput,
  UpdateTaskInput,
  UpdateStatusInput,
  TaskFilters,
  PaginatedResult,
  Status,
  RunSession,
  HistoryEntry,
  LogEntry
} from './types';

const KANBAN_DIR = '.cursor-kanban';
const TASKS_FILE = 'tasks.json';
const LOCK_FILE = '.lock';

export class TaskStore {
  private readonly kanbanDir: string;
  private readonly tasksPath: string;
  private readonly lockPath: string;

  constructor(private readonly workspaceRoot: string) {
    this.kanbanDir = path.join(workspaceRoot, KANBAN_DIR);
    this.tasksPath = path.join(this.kanbanDir, TASKS_FILE);
    this.lockPath = path.join(this.kanbanDir, LOCK_FILE);
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.kanbanDir)) {
      fs.mkdirSync(this.kanbanDir, { recursive: true });
    }
  }

  private async acquireLock(timeout = 5000): Promise<() => void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      try {
        const fd = fs.openSync(this.lockPath, 'wx');
        fs.writeFileSync(fd, String(process.pid));
        fs.closeSync(fd);
        
        return () => {
          try {
            fs.unlinkSync(this.lockPath);
          } catch {
            // Ignore errors on unlock
          }
        };
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock exists, wait and retry
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Failed to acquire lock: timeout');
  }

  private readTasks(): Task[] {
    try {
      if (!fs.existsSync(this.tasksPath)) {
        return [];
      }
      const data = fs.readFileSync(this.tasksPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async writeTasks(tasks: Task[]): Promise<void> {
    const unlock = await this.acquireLock();
    try {
      const tmpPath = this.tasksPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(tasks, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.tasksPath);
    } finally {
      unlock();
    }
  }

  async listTasks(filters?: TaskFilters): Promise<PaginatedResult<TaskSummary>> {
    let tasks = this.readTasks();

    // Apply filters
    if (filters?.status?.length) {
      tasks = tasks.filter(t => filters.status!.includes(t.status));
    }
    if (filters?.category?.length) {
      tasks = tasks.filter(t => filters.category!.includes(t.category));
    }
    if (filters?.priority?.length) {
      tasks = tasks.filter(t => filters.priority!.includes(t.priority));
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(search) ||
        t.description?.toLowerCase().includes(search)
      );
    }

    // Sort by priority (HIGH first) then by createdAt (oldest first for FIFO)
    const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    tasks.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Pagination
    const limit = filters?.limit || 100;
    let startIndex = 0;
    if (filters?.cursor) {
      const cursorIndex = tasks.findIndex(t => t.id === filters.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedTasks = tasks.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < tasks.length;

    const items: TaskSummary[] = paginatedTasks.map(t => {
      // Get recent logs from the active or last session
      let recentLogs: LogEntry[] = [];
      if (t.runSessions.length > 0) {
        const activeSession = t.runSessions.find(s => s.status === 'running');
        const lastSession = activeSession || t.runSessions[t.runSessions.length - 1];
        if (lastSession && lastSession.logs.length > 0) {
          // Get the last 3 logs
          recentLogs = lastSession.logs.slice(-3);
        }
      }
      
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        category: t.category,
        priority: t.priority,
        updatedAt: t.updatedAt,
        recentLogs: recentLogs.length > 0 ? recentLogs : undefined
      };
    });

    return {
      items,
      nextCursor: hasMore ? paginatedTasks[paginatedTasks.length - 1]?.id ?? null : null
    };
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = this.readTasks();
    return tasks.find(t => t.id === id) || null;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    if (!input.title || input.title.length < 3) {
      throw new Error('Title must be at least 3 characters');
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: uuidv4(),
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      branchTarget: input.branchTarget,
      status: 'BACKLOG',
      createdAt: now,
      updatedAt: now,
      history: [
        {
          at: now,
          from: null,
          to: 'BACKLOG',
          by: 'user'
        }
      ],
      runSessions: []
    };

    const tasks = this.readTasks();
    tasks.push(task);
    await this.writeTasks(tasks);

    return task;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const tasks = this.readTasks();
    const index = tasks.findIndex(t => t.id === id);
    
    if (index === -1) {
      throw new Error('Task not found');
    }

    const task = tasks[index];
    const now = new Date().toISOString();

    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.category !== undefined) task.category = input.category;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.branchTarget !== undefined) task.branchTarget = input.branchTarget;
    
    task.updatedAt = now;
    tasks[index] = task;
    
    await this.writeTasks(tasks);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = this.readTasks();
    const index = tasks.findIndex(t => t.id === id);
    
    if (index === -1) {
      throw new Error('Task not found');
    }

    tasks.splice(index, 1);
    await this.writeTasks(tasks);
  }

  async updateStatus(input: UpdateStatusInput): Promise<Task> {
    const tasks = this.readTasks();
    const index = tasks.findIndex(t => t.id === input.id);
    
    if (index === -1) {
      throw new Error('Task not found');
    }

    const task = tasks[index];
    const now = new Date().toISOString();
    const previousStatus = task.status;

    const historyEntry: HistoryEntry = {
      at: now,
      from: previousStatus,
      to: input.status,
      by: input.by,
      reason: input.reason,
      sessionId: input.sessionId
    };

    task.status = input.status;
    task.updatedAt = now;
    task.history.push(historyEntry);

    tasks[index] = task;
    await this.writeTasks(tasks);

    return task;
  }

  async startRun(id: string): Promise<RunSession> {
    const tasks = this.readTasks();
    const index = tasks.findIndex(t => t.id === id);
    
    if (index === -1) {
      throw new Error('Task not found');
    }

    const task = tasks[index];
    
    // Check if there's already a running session
    const existingRunning = task.runSessions.find(s => s.status === 'running');
    if (existingRunning) {
      throw new Error('Task already has a running session');
    }

    const now = new Date().toISOString();
    const sessionId = `run_${uuidv4().split('-')[0]}`;

    const session: RunSession = {
      sessionId,
      startedAt: now,
      status: 'running',
      logs: [{
        timestamp: now,
        message: 'Task execution started',
        type: 'info'
      }]
    };

    task.runSessions.push(session);
    
    // Update status to IN_PROGRESS
    const historyEntry: HistoryEntry = {
      at: now,
      from: task.status,
      to: 'IN_PROGRESS',
      by: 'system',
      sessionId
    };

    task.status = 'IN_PROGRESS';
    task.updatedAt = now;
    task.history.push(historyEntry);

    tasks[index] = task;
    await this.writeTasks(tasks);

    return session;
  }

  async stopRun(id: string, sessionId: string): Promise<Task> {
    const tasks = this.readTasks();
    const index = tasks.findIndex(t => t.id === id);
    
    if (index === -1) {
      throw new Error('Task not found');
    }

    const task = tasks[index];
    const sessionIndex = task.runSessions.findIndex(s => s.sessionId === sessionId);
    
    if (sessionIndex === -1) {
      throw new Error('Session not found');
    }

    const now = new Date().toISOString();
    
    task.runSessions[sessionIndex].endedAt = now;
    task.runSessions[sessionIndex].status = 'stopped';

    // Update status to WAITING_APPROVAL
    const historyEntry: HistoryEntry = {
      at: now,
      from: task.status,
      to: 'WAITING_APPROVAL',
      by: 'system',
      sessionId
    };

    task.status = 'WAITING_APPROVAL';
    task.updatedAt = now;
    task.history.push(historyEntry);

    tasks[index] = task;
    await this.writeTasks(tasks);

    return task;
  }

  async addLog(
    id: string, 
    sessionId: string, 
    message: string, 
    type: 'progress' | 'milestone' | 'warning' | 'error' | 'info' = 'progress'
  ): Promise<LogEntry> {
    const tasks = this.readTasks();
    const index = tasks.findIndex(t => t.id === id);
    
    if (index === -1) {
      throw new Error('Task not found');
    }

    const task = tasks[index];
    const sessionIndex = task.runSessions.findIndex(s => s.sessionId === sessionId);
    
    if (sessionIndex === -1) {
      throw new Error('Session not found');
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      message,
      type
    };

    task.runSessions[sessionIndex].logs.push(logEntry);
    task.updatedAt = new Date().toISOString();
    
    tasks[index] = task;
    await this.writeTasks(tasks);

    return logEntry;
  }

  async claimNextTask(categories?: string[], priorities?: string[]): Promise<Task | null> {
    const filters: TaskFilters = {
      status: ['BACKLOG']
    };

    if (categories?.length) {
      filters.category = categories as any;
    }
    if (priorities?.length) {
      filters.priority = priorities as any;
    }

    const result = await this.listTasks(filters);
    
    if (result.items.length === 0) {
      return null;
    }

    // Return the first task (already sorted by priority and FIFO)
    const taskId = result.items[0].id;
    return this.getTask(taskId);
  }
}


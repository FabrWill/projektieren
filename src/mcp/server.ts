#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

// Import core modules - these will be bundled by esbuild
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Types
type Status = 'BACKLOG' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'FINISHED';
type Category = 'CORE' | 'UI' | 'API';
type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
type BranchTargetType = 'current' | 'new';

interface BranchTarget {
  type: BranchTargetType;
  name?: string;
}

interface HistoryEntry {
  at: string;
  from: Status | null;
  to: Status;
  by: 'user' | 'agent' | 'system';
  reason?: string;
  sessionId?: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'progress' | 'milestone' | 'warning' | 'error' | 'info';
}

interface RunSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'stopped' | 'completed';
  logs: LogEntry[];
}

interface Task {
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

interface TaskSummary {
  id: string;
  title: string;
  status: Status;
  category: Category;
  priority: Priority;
  updatedAt: string;
  recentLogs?: LogEntry[];
}

interface CreateTaskInput {
  title: string;
  description?: string;
  category: Category;
  priority: Priority;
  branchTarget: BranchTarget;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  category?: Category;
  priority?: Priority;
  branchTarget?: BranchTarget;
}

interface TaskFilters {
  status?: Status[];
  category?: Category[];
  priority?: Priority[];
  search?: string;
  limit?: number;
  cursor?: string;
}

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

// TaskStore implementation (self-contained for MCP server)
const KANBAN_DIR = '.cursor-kanban';
const TASKS_FILE = 'tasks.json';
const LOCK_FILE = '.lock';

class TaskStore {
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

    const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    tasks.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

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
      history: [{ at: now, from: null, to: 'BACKLOG', by: 'user' }],
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

  async updateStatus(input: { id: string; status: Status; reason?: string; by: 'user' | 'agent' | 'system'; sessionId?: string }): Promise<Task> {
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

  async addLog(id: string, sessionId: string, message: string, type: 'progress' | 'milestone' | 'warning' | 'error' | 'info' = 'progress'): Promise<LogEntry> {
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
      filters.category = categories as Category[];
    }
    if (priorities?.length) {
      filters.priority = priorities as Priority[];
    }

    const result = await this.listTasks(filters);
    
    if (result.items.length === 0) {
      return null;
    }

    const taskId = result.items[0].id;
    return this.getTask(taskId);
  }
}

// Parse command line arguments
function parseArgs(): { workspaceRoot: string } {
  const args = process.argv.slice(2);
  let workspaceRoot = process.env.KANBAN_WORKSPACE_ROOT || process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspaceRoot' && args[i + 1]) {
      workspaceRoot = args[i + 1];
      i++;
    }
  }

  return { workspaceRoot };
}

// Define MCP tools
const TOOLS: Tool[] = [
  {
    name: 'kanban.listTasks',
    description: 'List tasks from the Kanban board with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: ['BACKLOG', 'IN_PROGRESS', 'WAITING_APPROVAL', 'FINISHED'] },
          description: 'Filter by status'
        },
        category: {
          type: 'array',
          items: { type: 'string', enum: ['CORE', 'UI', 'API'] },
          description: 'Filter by category'
        },
        priority: {
          type: 'array',
          items: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          description: 'Filter by priority'
        },
        search: {
          type: 'string',
          description: 'Search in title and description'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default: 100)'
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor'
        }
      }
    }
  },
  {
    name: 'kanban.getTask',
    description: 'Get detailed information about a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'kanban.createTask',
    description: 'Create a new task in the Kanban board',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title (required, min 3 characters)'
        },
        description: {
          type: 'string',
          description: 'Task description'
        },
        category: {
          type: 'string',
          enum: ['CORE', 'UI', 'API'],
          description: 'Task category'
        },
        priority: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Task priority'
        },
        branchTarget: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['current', 'new'],
              description: 'Branch target type'
            },
            name: {
              type: 'string',
              description: 'Branch name (required for new)'
            }
          },
          required: ['type']
        }
      },
      required: ['title', 'category', 'priority', 'branchTarget']
    }
  },
  {
    name: 'kanban.updateTask',
    description: 'Update an existing task',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID'
        },
        title: {
          type: 'string',
          description: 'New title'
        },
        description: {
          type: 'string',
          description: 'New description'
        },
        category: {
          type: 'string',
          enum: ['CORE', 'UI', 'API']
        },
        priority: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW']
        },
        branchTarget: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['current', 'new'] },
            name: { type: 'string' }
          }
        }
      },
      required: ['id']
    }
  },
  {
    name: 'kanban.updateStatus',
    description: 'Update the status of a task',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID'
        },
        status: {
          type: 'string',
          enum: ['BACKLOG', 'IN_PROGRESS', 'WAITING_APPROVAL', 'FINISHED'],
          description: 'New status'
        },
        reason: {
          type: 'string',
          description: 'Reason for status change'
        },
        by: {
          type: 'string',
          enum: ['agent', 'user', 'system'],
          description: 'Who is making the change'
        },
        sessionId: {
          type: 'string',
          description: 'Optional session ID'
        }
      },
      required: ['id', 'status', 'by']
    }
  },
  {
    name: 'kanban.claimNextTask',
    description: 'Get the next available task from the backlog (prioritized by priority and FIFO)',
    inputSchema: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['CORE', 'UI', 'API'] },
          description: 'Filter by categories'
        },
        priorities: {
          type: 'array',
          items: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          description: 'Filter by priorities'
        }
      }
    }
  },
  {
    name: 'kanban.startRun',
    description: 'Start a run session for a task (moves to IN_PROGRESS)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'kanban.stopRun',
    description: 'Stop a run session for a task (moves to WAITING_APPROVAL)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID'
        },
        sessionId: {
          type: 'string',
          description: 'Session ID to stop'
        }
      },
      required: ['id', 'sessionId']
    }
  },
  {
    name: 'kanban.createTaskFromContext',
    description: `Create a new task from the current Cursor conversation/plan context. 
Use this when the user asks you to create a task based on what was discussed. 
Extract the title, description, and relevant context from the conversation.
The description should include:
- A clear summary of what needs to be done
- Any technical requirements or constraints mentioned
- Acceptance criteria if discussed
- Related files or components mentioned`,
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title - should be concise but descriptive (e.g., "Add dark mode toggle to settings page")'
        },
        description: {
          type: 'string',
          description: 'Detailed description including requirements, context, and any relevant information from the conversation'
        },
        category: {
          type: 'string',
          enum: ['CORE', 'UI', 'API'],
          description: 'Task category - CORE for core logic/features, UI for frontend/visual changes, API for backend/API work'
        },
        priority: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Task priority based on urgency discussed'
        },
        branchName: {
          type: 'string',
          description: 'Optional: suggested branch name for this task (e.g., feat/dark-mode). If not provided, will use current branch.'
        },
        relatedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: list of file paths that are relevant to this task'
        },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: list of acceptance criteria for the task'
        },
        technicalNotes: {
          type: 'string',
          description: 'Optional: any technical notes, constraints, or implementation hints'
        }
      },
      required: ['title', 'description', 'category', 'priority']
    }
  },
  {
    name: 'kanban.addLog',
    description: `Add a progress log entry to a running task session. Use this to report progress, milestones, or important updates during task execution. The logs will be visible in the Kanban UI.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID'
        },
        sessionId: {
          type: 'string',
          description: 'Session ID (from startRun)'
        },
        message: {
          type: 'string',
          description: 'Log message describing progress or update (e.g., "Implemented user authentication", "Fixed bug in form validation")'
        },
        type: {
          type: 'string',
          enum: ['progress', 'milestone', 'warning', 'error', 'info'],
          description: 'Type of log entry. Default: progress'
        }
      },
      required: ['id', 'sessionId', 'message']
    }
  }
];

async function main() {
  const { workspaceRoot } = parseArgs();
  const taskStore = new TaskStore(workspaceRoot);

  const server = new Server(
    {
      name: 'projektieren',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'kanban.listTasks': {
          const result = await taskStore.listTasks({
            status: args?.status as Status[],
            category: args?.category as Category[],
            priority: args?.priority as Priority[],
            search: args?.search as string,
            limit: args?.limit as number,
            cursor: args?.cursor as string
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        }

        case 'kanban.getTask': {
          const task = await taskStore.getTask(args?.id as string);
          if (!task) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Task not found' }) }],
              isError: true
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(task, null, 2) }]
          };
        }

        case 'kanban.createTask': {
          const input: CreateTaskInput = {
            title: args?.title as string,
            description: args?.description as string,
            category: args?.category as Category,
            priority: args?.priority as Priority,
            branchTarget: args?.branchTarget as any
          };
          const task = await taskStore.createTask(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ id: task.id }) }]
          };
        }

        case 'kanban.updateTask': {
          const { id, ...data } = args as any;
          const updateInput: UpdateTaskInput = {};
          if (data.title) updateInput.title = data.title;
          if (data.description) updateInput.description = data.description;
          if (data.category) updateInput.category = data.category;
          if (data.priority) updateInput.priority = data.priority;
          if (data.branchTarget) updateInput.branchTarget = data.branchTarget;
          
          const task = await taskStore.updateTask(id, updateInput);
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, updatedAt: task.updatedAt }) }]
          };
        }

        case 'kanban.updateStatus': {
          const task = await taskStore.updateStatus({
            id: args?.id as string,
            status: args?.status as Status,
            reason: args?.reason as string,
            by: args?.by as 'agent' | 'user' | 'system',
            sessionId: args?.sessionId as string
          });
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, updatedAt: task.updatedAt }) }]
          };
        }

        case 'kanban.claimNextTask': {
          const task = await taskStore.claimNextTask(
            args?.categories as string[],
            args?.priorities as string[]
          );
          return {
            content: [{ type: 'text', text: JSON.stringify({ task }) }]
          };
        }

        case 'kanban.startRun': {
          const session = await taskStore.startRun(args?.id as string);
          const task = await taskStore.getTask(args?.id as string);
          return {
            content: [{ type: 'text', text: JSON.stringify({ sessionId: session.sessionId, task }) }]
          };
        }

        case 'kanban.stopRun': {
          await taskStore.stopRun(args?.id as string, args?.sessionId as string);
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true }) }]
          };
        }

        case 'kanban.createTaskFromContext': {
          // Build a rich description from all the context provided
          let fullDescription = args?.description as string || '';
          
          // Add related files section if provided
          const relatedFiles = args?.relatedFiles as string[] | undefined;
          if (relatedFiles && relatedFiles.length > 0) {
            fullDescription += '\n\n## Related Files\n';
            relatedFiles.forEach((file: string) => {
              fullDescription += `- \`${file}\`\n`;
            });
          }
          
          // Add acceptance criteria if provided
          const acceptanceCriteria = args?.acceptanceCriteria as string[] | undefined;
          if (acceptanceCriteria && acceptanceCriteria.length > 0) {
            fullDescription += '\n\n## Acceptance Criteria\n';
            acceptanceCriteria.forEach((criteria: string, index: number) => {
              fullDescription += `${index + 1}. ${criteria}\n`;
            });
          }
          
          // Add technical notes if provided
          const technicalNotes = args?.technicalNotes as string | undefined;
          if (technicalNotes) {
            fullDescription += '\n\n## Technical Notes\n';
            fullDescription += technicalNotes;
          }
          
          // Determine branch target
          const branchName = args?.branchName as string | undefined;
          const branchTarget: BranchTarget = branchName 
            ? { type: 'new', name: branchName }
            : { type: 'current' };
          
          const input: CreateTaskInput = {
            title: args?.title as string,
            description: fullDescription,
            category: args?.category as Category,
            priority: args?.priority as Priority,
            branchTarget
          };
          
          const task = await taskStore.createTask(input);
          
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                success: true,
                id: task.id,
                message: `Task "${task.title}" created successfully in BACKLOG`,
                task: {
                  id: task.id,
                  title: task.title,
                  category: task.category,
                  priority: task.priority,
                  branchTarget: task.branchTarget,
                  status: task.status
                }
              }, null, 2) 
            }]
          };
        }

        case 'kanban.addLog': {
          const logEntry = await taskStore.addLog(
            args?.id as string,
            args?.sessionId as string,
            args?.message as string,
            (args?.type as 'progress' | 'milestone' | 'warning' | 'error' | 'info') || 'progress'
          );
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                ok: true, 
                log: logEntry,
                message: 'Log entry added successfully'
              }) 
            }]
          };
        }

        default:
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
            isError: true
          };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (not stdout, which is used for MCP communication)
  console.error('Projektieren MCP server started');
  console.error(`Workspace root: ${workspaceRoot}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


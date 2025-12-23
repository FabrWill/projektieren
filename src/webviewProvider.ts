import * as vscode from 'vscode';
import * as path from 'path';
import { TaskStore } from './core/TaskStore';
import { WebviewMessage, ExtensionMessage, BoardState, Status, Project } from './core/types';
import { GitHelper } from './core/gitHelper';

export class KanbanViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private taskStores: Map<string, TaskStore> = new Map();
  private gitHelpers: Map<string, GitHelper> = new Map();
  private projects: Project[] = [];
  private activeProjectId: string = '';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly defaultWorkspaceRoot: string
  ) {
    this.initializeProjects();
    
    // Listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.initializeProjects();
      this.sendProjectsState();
      this.sendBoardState();
    });
  }

  private initializeProjects() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    this.projects = [];
    this.taskStores.clear();
    this.gitHelpers.clear();

    if (workspaceFolders && workspaceFolders.length > 0) {
      for (const folder of workspaceFolders) {
        const projectId = this.generateProjectId(folder.uri.fsPath);
        const project: Project = {
          id: projectId,
          name: folder.name,
          path: folder.uri.fsPath
        };
        this.projects.push(project);
        
        // Create TaskStore and GitHelper for each project
        this.taskStores.set(projectId, new TaskStore(folder.uri.fsPath));
        this.gitHelpers.set(projectId, new GitHelper(folder.uri.fsPath));
      }

      // Set active project to first workspace if not set or invalid
      if (!this.activeProjectId || !this.projects.find(p => p.id === this.activeProjectId)) {
        this.activeProjectId = this.projects[0].id;
      }
    } else {
      // Fallback to default workspace
      const projectId = this.generateProjectId(this.defaultWorkspaceRoot);
      const project: Project = {
        id: projectId,
        name: path.basename(this.defaultWorkspaceRoot),
        path: this.defaultWorkspaceRoot
      };
      this.projects.push(project);
      this.taskStores.set(projectId, new TaskStore(this.defaultWorkspaceRoot));
      this.gitHelpers.set(projectId, new GitHelper(this.defaultWorkspaceRoot));
      this.activeProjectId = projectId;
    }
  }

  private generateProjectId(folderPath: string): string {
    // Create a simple hash-like ID from the path
    let hash = 0;
    for (let i = 0; i < folderPath.length; i++) {
      const char = folderPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `proj_${Math.abs(hash).toString(36)}`;
  }

  private getActiveTaskStore(): TaskStore {
    const store = this.taskStores.get(this.activeProjectId);
    if (!store) {
      throw new Error('No active project selected');
    }
    return store;
  }

  private getActiveGitHelper(): GitHelper {
    const helper = this.gitHelpers.get(this.activeProjectId);
    if (!helper) {
      throw new Error('No active project selected');
    }
    return helper;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this.extensionUri, 'media')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      await this.handleMessage(message);
    });
  }

  private async handleMessage(message: WebviewMessage) {
    try {
      switch (message.type) {
        case 'ready':
          await this.sendProjectsState();
          await this.sendBoardState();
          break;

        case 'switchProject':
          const newProjectId = message.payload.projectId;
          if (this.projects.find(p => p.id === newProjectId)) {
            this.activeProjectId = newProjectId;
            await this.sendProjectsState();
            await this.sendBoardState();
          }
          break;

        case 'createTask':
          const taskStore = this.getActiveTaskStore();
          const newTask = await taskStore.createTask(message.payload);
          this.sendMessage({ type: 'taskCreated', payload: { id: newTask.id } });
          await this.sendBoardState();
          break;

        case 'updateTask':
          await this.getActiveTaskStore().updateTask(message.payload.id, message.payload.data);
          this.sendMessage({ type: 'taskUpdated', payload: { id: message.payload.id } });
          await this.sendBoardState();
          break;

        case 'deleteTask':
          await this.getActiveTaskStore().deleteTask(message.payload.id);
          await this.sendBoardState();
          break;

        case 'moveTask':
          await this.getActiveTaskStore().updateStatus({
            id: message.payload.id,
            status: message.payload.status,
            by: 'user'
          });
          await this.sendBoardState();
          break;

        case 'runTask':
          await this.handleRunTask(message.payload.id);
          break;

        case 'stopTask':
          await this.getActiveTaskStore().stopRun(message.payload.id, message.payload.sessionId);
          await this.sendBoardState();
          break;

        case 'finishTask':
          await this.getActiveTaskStore().updateStatus({
            id: message.payload.id,
            status: 'FINISHED',
            by: 'user'
          });
          await this.sendBoardState();
          break;

        case 'getTaskDetails':
          const task = await this.getActiveTaskStore().getTask(message.payload.id);
          if (task) {
            this.sendMessage({ type: 'taskDetails', payload: task });
          }
          break;

        case 'refresh':
          await this.sendProjectsState();
          await this.sendBoardState();
          break;
      }
    } catch (error) {
      this.sendMessage({
        type: 'error',
        payload: { message: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  public async handleRunTask(taskId: string) {
    const taskStore = this.getActiveTaskStore();
    const gitHelper = this.getActiveGitHelper();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // If task has a branch target set to 'new', ask for branch name confirmation
    let branchName = task.branchTarget.name;
    let branchType = task.branchTarget.type;
    
    if (task.branchTarget.type !== 'current') {
      // Ask user to choose between current branch or new branch with name
      const branchChoice = await vscode.window.showQuickPick(
        [
          { label: '$(git-branch) Use current branch', value: 'current', description: 'Work on the currently checked out branch' },
          { label: '$(add) Create new branch', value: 'new', description: 'Create and checkout a new branch' }
        ],
        { 
          placeHolder: 'Select branch target for this task',
          title: 'Branch Selection'
        }
      );

      if (!branchChoice) {
        return; // User cancelled
      }

      branchType = branchChoice.value as 'current' | 'new';

      if (branchChoice.value === 'new') {
        const newBranchName = await vscode.window.showInputBox({
          prompt: 'Enter the new branch name',
          value: task.branchTarget.name || `feat/${task.title.toLowerCase().replace(/\s+/g, '-')}`,
          placeHolder: 'feat/my-feature',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Branch name is required';
            }
            return null;
          }
        });

        if (!newBranchName) {
          return; // User cancelled
        }

        branchName = newBranchName;
        
        // Create and checkout the new branch
        await gitHelper.createAndCheckoutBranch(newBranchName);
      }
    }

    // Generate a session ID for tracking (but don't change task status)
    const sessionId = `run_${Date.now().toString(36)}`;
    
    // Get active project name for context
    const activeProject = this.projects.find(p => p.id === this.activeProjectId);
    
    // Generate professional prompt for Cursor agent
    const prompt = this.generateAgentPrompt({
      ...task,
      branchTarget: {
        type: branchType,
        name: branchName
      }
    }, sessionId, activeProject?.name);
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(prompt);
    
    // Notify webview (but don't change status)
    this.sendMessage({
      type: 'taskRunStarted',
      payload: { id: taskId, sessionId }
    });
    
    // Show notification to user
    vscode.window.showInformationMessage(
      `Task "${task.title}" prompt copied to clipboard! Paste it in Cursor Chat to execute the task.`,
      'Open Chat'
    ).then(selection => {
      if (selection === 'Open Chat') {
        vscode.commands.executeCommand('workbench.action.chat.open');
      }
    });
  }

  private generateAgentPrompt(task: { 
    id: string; 
    title: string; 
    description?: string; 
    category: string; 
    priority: string;
    branchTarget: { type: string; name?: string };
  }, sessionId: string, projectName?: string): string {
    const branchInfo = task.branchTarget.type === 'current' 
      ? 'current branch' 
      : `branch: ${task.branchTarget.name}`;

    return `## Kanban Task Execution Request

**Task ID:** \`${task.id}\`
**Session ID:** \`${sessionId}\`
**Project:** ${projectName || 'Unknown'}
**Title:** ${task.title}
**Category:** ${task.category} | **Priority:** ${task.priority}
**Branch:** ${branchInfo}

${task.description ? `### Description\n${task.description}\n` : ''}
### Instructions

Execute this task from the Kanban board. Follow these guidelines:

1. **Start the Task**: First, mark the task as in progress using MCP:
   \`\`\`
   kanban.startRun({ id: "${task.id}" })
   \`\`\`

2. **Understand the Task**: Analyze the requirements based on the title${task.description ? ' and description' : ''} above.

3. **Implementation**: Proceed with the implementation following best practices for the ${task.category} category.

4. **Progress Tracking**: When reaching significant milestones, update the task via MCP:
   \`\`\`
   kanban.updateStatus({
     id: "${task.id}",
     status: "IN_PROGRESS",
     by: "agent",
     reason: "<describe current progress>",
     sessionId: "${sessionId}"
   })
   \`\`\`

5. **Completion**: When the task is complete:
   - Ensure all changes are saved
   - Call \`kanban.stopRun\` to move the task to "Waiting Approval"
   - Provide a summary of what was accomplished

### MCP Tools Available
- \`kanban.startRun\` - Start working on the task (changes status to IN_PROGRESS)
- \`kanban.updateStatus\` - Update task status with progress notes
- \`kanban.stopRun\` - Complete the session and move to review
- \`kanban.getTask\` - Get current task details if needed

Begin implementation now. Report progress as you work.`;
  }

  public async refresh() {
    await this.sendProjectsState();
    await this.sendBoardState();
  }

  private async sendProjectsState() {
    this.sendMessage({
      type: 'projectsState',
      payload: {
        projects: this.projects,
        activeProjectId: this.activeProjectId
      }
    });
  }

  private async sendBoardState() {
    const taskStore = this.getActiveTaskStore();
    const [backlog, inProgress, waitingApproval, finished] = await Promise.all([
      taskStore.listTasks({ status: ['BACKLOG'] }),
      taskStore.listTasks({ status: ['IN_PROGRESS'] }),
      taskStore.listTasks({ status: ['WAITING_APPROVAL'] }),
      taskStore.listTasks({ status: ['FINISHED'] })
    ]);

    const boardState: BoardState = {
      backlog: backlog.items,
      inProgress: inProgress.items,
      waitingApproval: waitingApproval.items,
      finished: finished.items
    };

    this.sendMessage({ type: 'boardState', payload: boardState });
  }

  private sendMessage(message: ExtensionMessage) {
    this._view?.webview.postMessage(message);
  }

  // Expose active project path for MCP server
  public getActiveProjectPath(): string {
    const project = this.projects.find(p => p.id === this.activeProjectId);
    return project?.path || this.defaultWorkspaceRoot;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.css'));

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Kanban Board</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    #root { width: 100%; height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

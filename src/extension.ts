import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';
import { KanbanViewProvider } from './webviewProvider';
import { TaskStore } from './core/TaskStore';

let mcpProcess: ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Kanban: No workspace folder open');
    return;
  }

  // Initialize webview provider (manages its own TaskStores for each project)
  const kanbanProvider = new KanbanViewProvider(context.extensionUri, workspaceRoot);

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('kanban.boardView', kanbanProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('kanban.openBoard', () => {
      // Focus the kanban view
      vscode.commands.executeCommand('kanban.boardView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kanban.createTask', async () => {
      // Get active project's task store
      const activeProjectPath = kanbanProvider.getActiveProjectPath();
      const taskStore = new TaskStore(activeProjectPath);
      
      // Quick input for creating a task
      const title = await vscode.window.showInputBox({
        prompt: 'Task title',
        placeHolder: 'Enter task title (min 3 characters)',
        validateInput: (value) => {
          if (!value || value.length < 3) {
            return 'Title must be at least 3 characters';
          }
          return null;
        }
      });

      if (!title) return;

      const category = await vscode.window.showQuickPick(['CORE', 'UI', 'API'], {
        placeHolder: 'Select category'
      });

      if (!category) return;

      const priority = await vscode.window.showQuickPick(['HIGH', 'MEDIUM', 'LOW'], {
        placeHolder: 'Select priority'
      });

      if (!priority) return;

      const branchType = await vscode.window.showQuickPick(
        [
          { label: 'Current branch', value: 'current' },
          { label: 'New branch', value: 'new' }
        ],
        { placeHolder: 'Select branch target' }
      );

      if (!branchType) return;

      let branchName: string | undefined;
      if (branchType.value === 'new') {
        branchName = await vscode.window.showInputBox({
          prompt: 'New branch name',
          placeHolder: 'feat/my-feature'
        });
        if (!branchName) return;
      }

      try {
        const task = await taskStore.createTask({
          title,
          category: category as 'CORE' | 'UI' | 'API',
          priority: priority as 'HIGH' | 'MEDIUM' | 'LOW',
          branchTarget: {
            type: branchType.value as 'current' | 'new',
            name: branchName
          }
        });

        vscode.window.showInformationMessage(`Task created: ${task.title}`);
        kanbanProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create task: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kanban.runTask', async () => {
      const activeProjectPath = kanbanProvider.getActiveProjectPath();
      const taskStore = new TaskStore(activeProjectPath);
      
      const tasks = await taskStore.listTasks({ status: ['BACKLOG'] });
      const items = tasks.items.map(t => ({ label: t.title, id: t.id }));
      
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select task to run'
      });

      if (selected) {
        kanbanProvider.handleRunTask(selected.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kanban.stopTask', async () => {
      const activeProjectPath = kanbanProvider.getActiveProjectPath();
      const taskStore = new TaskStore(activeProjectPath);
      
      const tasks = await taskStore.listTasks({ status: ['IN_PROGRESS'] });
      const items = tasks.items.map(t => ({ label: t.title, id: t.id }));
      
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select task to stop'
      });

      if (selected) {
        const task = await taskStore.getTask(selected.id);
        if (task) {
          const activeSession = task.runSessions.find(s => s.status === 'running');
          if (activeSession) {
            await taskStore.stopRun(selected.id, activeSession.sessionId);
            kanbanProvider.refresh();
            vscode.window.showInformationMessage(`Task stopped: ${task.title}`);
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kanban.finishTask', async () => {
      const activeProjectPath = kanbanProvider.getActiveProjectPath();
      const taskStore = new TaskStore(activeProjectPath);
      
      const tasks = await taskStore.listTasks({ status: ['WAITING_APPROVAL'] });
      const items = tasks.items.map(t => ({ label: t.title, id: t.id }));
      
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select task to finish'
      });

      if (selected) {
        await taskStore.updateStatus({
          id: selected.id,
          status: 'FINISHED',
          by: 'user'
        });
        kanbanProvider.refresh();
        vscode.window.showInformationMessage('Task marked as finished');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kanban.copyMcpConfig', async () => {
      const activeProjectPath = kanbanProvider.getActiveProjectPath();
      const mcpPath = path.join(context.extensionPath, 'dist', 'mcp', 'index.mjs');
      const config = {
        "projektieren": {
          command: "node",
          args: [mcpPath, "--workspaceRoot", activeProjectPath]
        }
      };
      
      await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
      vscode.window.showInformationMessage('MCP config copied to clipboard! Add it to your mcp.json');
    })
  );

  // Start MCP server with active project
  startMcpServer(context, kanbanProvider.getActiveProjectPath());

  // Watch for file changes in all workspace folders to sync state
  const watchers: vscode.FileSystemWatcher[] = [];
  
  const setupWatchers = () => {
    // Clear existing watchers
    watchers.forEach(w => w.dispose());
    watchers.length = 0;
    
    // Create watchers for all workspace folders
    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder.uri.fsPath, '.cursor-kanban/tasks.json')
      );
      
      watcher.onDidChange(() => {
        kanbanProvider.refresh();
      });
      
      watchers.push(watcher);
    }
  };
  
  setupWatchers();
  
  // Re-setup watchers when workspace folders change
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    setupWatchers();
  });

  context.subscriptions.push({
    dispose: () => {
      watchers.forEach(w => w.dispose());
    }
  });
}

function startMcpServer(context: vscode.ExtensionContext, workspaceRoot: string) {
  const mcpPath = path.join(context.extensionPath, 'dist', 'mcp', 'index.mjs');
  
  // Check if MCP server exists
  if (!fs.existsSync(mcpPath)) {
    console.log('MCP server not built yet, skipping auto-start');
    return;
  }

  try {
    mcpProcess = spawn('node', ['--experimental-modules', mcpPath, '--workspaceRoot', workspaceRoot], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, KANBAN_WORKSPACE_ROOT: workspaceRoot }
    });

    mcpProcess.on('error', (err) => {
      console.error('MCP server error:', err);
    });

    mcpProcess.on('exit', (code) => {
      console.log('MCP server exited with code:', code);
    });

    context.subscriptions.push({
      dispose: () => {
        if (mcpProcess) {
          mcpProcess.kill();
          mcpProcess = null;
        }
      }
    });
  } catch (error) {
    console.error('Failed to start MCP server:', error);
  }
}

export function deactivate() {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}

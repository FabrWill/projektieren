import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from './vscode';
import { Board } from './components/Board';
import { TaskForm } from './components/TaskForm';
import { TaskEditForm } from './components/TaskEditForm';
import { TaskDetails } from './components/TaskDetails';
import { Header } from './components/Header';
import {
  BoardState,
  Task,
  ExtensionMessage,
  CreateTaskInput,
  UpdateTaskInput,
  Status,
  Category,
  Priority,
  Project
} from './types';

const initialBoardState: BoardState = {
  backlog: [],
  inProgress: [],
  waitingApproval: [],
  finished: []
};

export function App() {
  const [boardState, setBoardState] = useState<BoardState>(initialBoardState);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'ALL'>('ALL');
  
  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');

  // Reset filters when project changes
  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setPriorityFilter('ALL');
    setShowDetails(false);
    setShowTaskForm(false);
    setShowEditForm(false);
    setSelectedTask(null);
    setTaskToEdit(null);
  }, []);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'boardState':
          setBoardState(message.payload);
          break;
        case 'projectsState':
          setProjects(message.payload.projects);
          setActiveProjectId(message.payload.activeProjectId);
          break;
        case 'taskDetails':
          setSelectedTask(message.payload);
          setShowDetails(true);
          break;
        case 'error':
          setError(message.payload.message);
          setTimeout(() => setError(null), 5000);
          break;
        case 'taskCreated':
          setShowTaskForm(false);
          break;
        case 'taskUpdated':
          setShowEditForm(false);
          setTaskToEdit(null);
          // Refresh task details if it was open
          if (selectedTask && message.payload.id === selectedTask.id) {
            vscode.postMessage({ type: 'getTaskDetails', payload: { id: selectedTask.id } });
          }
          break;
        case 'taskRunStarted':
          // Task run started, board will be refreshed via boardState
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Signal ready and request initial state
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handleMessage);
  }, [selectedTask]);

  const handleProjectChange = useCallback((projectId: string) => {
    if (projectId !== activeProjectId) {
      resetFilters();
      vscode.postMessage({ type: 'switchProject', payload: { projectId } });
    }
  }, [activeProjectId, resetFilters]);

  const handleCreateTask = useCallback((input: CreateTaskInput) => {
    vscode.postMessage({ type: 'createTask', payload: input });
  }, []);

  const handleMoveTask = useCallback((id: string, status: Status) => {
    vscode.postMessage({ type: 'moveTask', payload: { id, status } });
  }, []);

  const handleRunTask = useCallback((id: string) => {
    vscode.postMessage({ type: 'runTask', payload: { id } });
  }, []);

  const handleStopTask = useCallback((id: string, sessionId: string) => {
    vscode.postMessage({ type: 'stopTask', payload: { id, sessionId } });
  }, []);

  const handleFinishTask = useCallback((id: string) => {
    vscode.postMessage({ type: 'finishTask', payload: { id } });
  }, []);

  const handleDeleteTask = useCallback((id: string) => {
    vscode.postMessage({ type: 'deleteTask', payload: { id } });
    setShowDetails(false);
    setSelectedTask(null);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setTaskToEdit(task);
    setShowEditForm(true);
    setShowDetails(false);
  }, []);

  const handleUpdateTask = useCallback((id: string, data: UpdateTaskInput) => {
    vscode.postMessage({ type: 'updateTask', payload: { id, data } });
  }, []);

  const handleViewDetails = useCallback((id: string) => {
    vscode.postMessage({ type: 'getTaskDetails', payload: { id } });
  }, []);

  const handleRefresh = useCallback(() => {
    vscode.postMessage({ type: 'refresh' });
  }, []);

  // Filter function
  const filterTasks = useCallback((tasks: typeof boardState.backlog) => {
    return tasks.filter(task => {
      const matchesSearch = !searchQuery || 
        task.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || task.category === categoryFilter;
      const matchesPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
      return matchesSearch && matchesCategory && matchesPriority;
    });
  }, [searchQuery, categoryFilter, priorityFilter]);

  const filteredBoardState: BoardState = {
    backlog: filterTasks(boardState.backlog),
    inProgress: filterTasks(boardState.inProgress),
    waitingApproval: filterTasks(boardState.waitingApproval),
    finished: filterTasks(boardState.finished)
  };

  return (
    <div className="app">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        onNewTask={() => setShowTaskForm(true)}
        onRefresh={handleRefresh}
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectChange={handleProjectChange}
      />

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <Board
        boardState={filteredBoardState}
        onMoveTask={handleMoveTask}
        onRunTask={handleRunTask}
        onStopTask={handleStopTask}
        onFinishTask={handleFinishTask}
        onViewDetails={handleViewDetails}
      />

      {showTaskForm && (
        <TaskForm
          onSubmit={handleCreateTask}
          onCancel={() => setShowTaskForm(false)}
        />
      )}

      {showDetails && selectedTask && (
        <TaskDetails
          task={selectedTask}
          onClose={() => {
            setShowDetails(false);
            setSelectedTask(null);
          }}
          onRun={handleRunTask}
          onStop={handleStopTask}
          onFinish={handleFinishTask}
          onDelete={handleDeleteTask}
          onMove={handleMoveTask}
          onEdit={handleEditTask}
        />
      )}

      {showEditForm && taskToEdit && (
        <TaskEditForm
          task={taskToEdit}
          onSubmit={handleUpdateTask}
          onCancel={() => {
            setShowEditForm(false);
            setTaskToEdit(null);
          }}
        />
      )}
    </div>
  );
}

# Task Form Redesign & Play Button Behavior Changes

**Date:** 2024-12-23  
**Type:** UI/UX Improvement + Behavior Change

## Summary

This change redesigns the "Add New Feature" modal with improved UX and updates the play button behavior to not automatically change task status.

## Changes Made

### 1. Task Form Modal Redesign

The task creation modal has been redesigned with the following improvements:

#### Priority Selection
- **Before:** Dropdown select with options (High, Medium, Low)
- **After:** Three horizontal buttons with visual states
  - Each priority has a distinct active color (High: red, Medium: purple, Low: green)
  - Buttons show visual feedback on selection

#### Target Branch Selection
- **Before:** Dropdown select with 3 options (Current, New, Existing)
- **After:** Radio button group with 2 options:
  - "Use current selected branch" (shows current branch name hint)
  - "Other branch" - when selected, shows input field for new branch name
- Removed "existing branch" option - simplified to only "current" or "new"

#### Description Field
- Only field using textarea (as before)
- Added helpful hint text below

#### Category Field
- Kept as select dropdown
- Added custom styling with dropdown arrow

#### VS Code Theme Integration
- Modal colors now use VS Code CSS variables
- Automatically adapts to the user's VS Code theme (light/dark)
- Uses `--vscode-*` CSS variables for colors

### 2. Play Button Behavior Change

- **Before:** Clicking play immediately changed task status to IN_PROGRESS and started a run session
- **After:** Clicking play:
  1. Prompts user to choose branch (current or new)
  2. If "new" selected, asks for branch name
  3. Creates the branch if needed
  4. Generates and copies the agent prompt to clipboard
  5. Shows notification with option to open chat
  6. **Does NOT change task status** - the agent should call `kanban.startRun` to change status

### 3. Agent Prompt Update

The generated prompt now includes instruction to call `kanban.startRun` first to mark the task as in progress.

## Files Modified

- `src/webview/components/TaskForm.tsx` - Complete redesign
- `src/webview/styles.css` - Added new styles for form components + VS Code theme variables
- `src/webviewProvider.ts` - Modified `handleRunTask` to not change status
- `src/webview/types.ts` - Removed "existing" from BranchTargetType
- `src/core/types.ts` - Removed "existing" from BranchTargetType
- `src/mcp/server.ts` - Removed "existing" from BranchTargetType
- `src/extension.ts` - Removed "existing" branch option

## Breaking Changes

- `BranchTargetType` no longer includes `'existing'` option
- Tasks with `branchTarget.type === 'existing'` in kanban.json may need migration

---

# MCP Tool: Create Task From Context

**Date:** 2024-12-23  
**Type:** New Feature

## Summary

Added a new MCP tool `kanban.createTaskFromContext` that allows the AI agent to create tasks by extracting information from the current Cursor conversation/plan context.

## New Tool: `kanban.createTaskFromContext`

### Purpose
This tool enables the AI agent to create rich, well-documented tasks based on what was discussed in the conversation. It's designed to capture:
- The main task title and description
- Related files mentioned in the conversation
- Acceptance criteria if discussed
- Technical notes and constraints
- Suggested branch name

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Concise but descriptive task title |
| `description` | string | Yes | Detailed description including requirements and context |
| `category` | enum | Yes | CORE, UI, or API |
| `priority` | enum | Yes | HIGH, MEDIUM, or LOW |
| `branchName` | string | No | Suggested branch name (e.g., feat/dark-mode) |
| `relatedFiles` | string[] | No | List of file paths relevant to the task |
| `acceptanceCriteria` | string[] | No | List of acceptance criteria |
| `technicalNotes` | string | No | Technical constraints or implementation hints |

### Output Format

```json
{
  "success": true,
  "id": "task-uuid",
  "message": "Task \"Task Title\" created successfully in BACKLOG",
  "task": {
    "id": "task-uuid",
    "title": "Task Title",
    "category": "CORE",
    "priority": "HIGH",
    "branchTarget": { "type": "new", "name": "feat/feature-name" },
    "status": "BACKLOG"
  }
}
```

### Usage Example

When a user says: "Create a task for the dark mode feature we discussed"

The agent can call:
```json
{
  "title": "Add dark mode toggle to settings page",
  "description": "Implement a dark mode toggle in the settings page that persists user preference...",
  "category": "UI",
  "priority": "MEDIUM",
  "branchName": "feat/dark-mode",
  "relatedFiles": [
    "src/components/Settings.tsx",
    "src/styles/theme.css"
  ],
  "acceptanceCriteria": [
    "Toggle switch visible in settings",
    "Theme persists after page reload",
    "Smooth transition between themes"
  ],
  "technicalNotes": "Use CSS variables for theme colors. Consider using prefers-color-scheme for initial state."
}
```

## Files Modified

- `src/mcp/server.ts` - Added new tool definition and handler

---

# Visual Task Editing Feature

**Date:** 2024-12-23  
**Type:** New Feature

## Summary

Added visual task editing capability through a new Edit button in the Task Details modal.

## Changes Made

### 1. New TaskEditForm Component

Created `src/webview/components/TaskEditForm.tsx` - a dedicated component for editing existing tasks with:
- Pre-populated fields with current task values
- Same UI design as the Create form (priority buttons, branch radio, etc.)
- Save Changes button with green accent color

### 2. Edit Button in Task Details

Added an "✎ Edit" button in the Task Details modal footer (between Move dropdown and Delete button).

### 3. App Integration

Updated `src/webview/App.tsx` to:
- Track edit form visibility and task being edited
- Handle `taskUpdated` message from extension
- Auto-refresh task details after successful edit

### 4. Types Updated

Added `taskUpdated` message type to `ExtensionMessage` union in both:
- `src/webview/types.ts`
- `src/core/types.ts`

### 5. WebviewProvider Update

Modified `src/webviewProvider.ts` to send `taskUpdated` message after successful task update.

## MCP Tool

The existing `kanban.updateTask` tool already supports task editing via MCP:

```json
{
  "id": "task-uuid",
  "title": "Updated title",
  "description": "Updated description",
  "category": "UI",
  "priority": "HIGH",
  "branchTarget": { "type": "new", "name": "feat/updated-branch" }
}
```

## Files Modified

- `src/webview/components/TaskEditForm.tsx` (new file)
- `src/webview/components/TaskDetails.tsx` - Added Edit button
- `src/webview/App.tsx` - Integrated edit flow
- `src/webview/types.ts` - Added taskUpdated message
- `src/core/types.ts` - Added taskUpdated message
- `src/webviewProvider.ts` - Send taskUpdated message
- `src/webview/styles.css` - Added btn-save style


import React, { useState } from 'react';
import { Task, UpdateTaskInput, Category, Priority, BranchTargetType } from '../types';

interface TaskEditFormProps {
  task: Task;
  onSubmit: (id: string, data: UpdateTaskInput) => void;
  onCancel: () => void;
}

export function TaskEditForm({ task, onSubmit, onCancel }: TaskEditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [category, setCategory] = useState<Category>(task.category);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [branchType, setBranchType] = useState<BranchTargetType>(task.branchTarget.type);
  const [branchName, setBranchName] = useState(task.branchTarget.name || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title || title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }

    if (branchType === 'new' && !branchName) {
      newErrors.branchName = 'Branch name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const data: UpdateTaskInput = {
      title,
      description: description || undefined,
      category,
      priority,
      branchTarget: {
        type: branchType,
        name: branchType === 'new' ? branchName : undefined
      }
    };

    onSubmit(task.id, data);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal task-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <h2>Edit Task</h2>
            <span className="modal-subtitle">Update the task details.</span>
          </div>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <form className="form task-form" onSubmit={handleSubmit}>
          {/* Title Input */}
          <div className="form-group">
            <label htmlFor="edit-title">Title *</label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          {/* Description Textarea */}
          <div className="form-group">
            <label htmlFor="edit-description">Description</label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              rows={4}
            />
          </div>

          {/* Category Select */}
          <div className="form-group">
            <label htmlFor="edit-category">Category</label>
            <select
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="category-select"
            >
              <option value="CORE">Core</option>
              <option value="UI">UI</option>
              <option value="API">API</option>
            </select>
          </div>

          {/* Target Branch Radio */}
          <div className="form-group">
            <label>Target Branch</label>
            <div className="branch-radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="edit-branchType"
                  value="current"
                  checked={branchType === 'current'}
                  onChange={() => setBranchType('current')}
                />
                <span className="radio-label">Use current selected branch</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="edit-branchType"
                  value="new"
                  checked={branchType === 'new'}
                  onChange={() => setBranchType('new')}
                />
                <span className="radio-label">Other branch</span>
              </label>
            </div>
            
            {branchType === 'new' && (
              <div className="branch-name-input">
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feat/my-feature"
                  className={errors.branchName ? 'input-error' : ''}
                />
                {errors.branchName && <span className="error-text">{errors.branchName}</span>}
              </div>
            )}
          </div>

          {/* Priority Buttons */}
          <div className="form-group">
            <label>Priority</label>
            <div className="priority-button-group">
              <button
                type="button"
                className={`priority-btn priority-high ${priority === 'HIGH' ? 'active' : ''}`}
                onClick={() => setPriority('HIGH')}
              >
                High
              </button>
              <button
                type="button"
                className={`priority-btn priority-medium ${priority === 'MEDIUM' ? 'active' : ''}`}
                onClick={() => setPriority('MEDIUM')}
              >
                Medium
              </button>
              <button
                type="button"
                className={`priority-btn priority-low ${priority === 'LOW' ? 'active' : ''}`}
                onClick={() => setPriority('LOW')}
              >
                Low
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="form-actions">
            <button type="button" className="btn btn-text" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-save">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


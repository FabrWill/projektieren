import React, { useState } from 'react';
import { CreateTaskInput, Category, Priority, BranchTargetType } from '../types';

interface TaskFormProps {
  onSubmit: (input: CreateTaskInput) => void;
  onCancel: () => void;
}

export function TaskForm({ onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('CORE');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [branchType, setBranchType] = useState<BranchTargetType>('current');
  const [branchName, setBranchName] = useState('');
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

    onSubmit({
      title,
      description: description || undefined,
      category,
      priority,
      branchTarget: {
        type: branchType,
        name: branchType === 'new' ? branchName : undefined
      }
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal task-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <h2>Add New Feature</h2>
            <span className="modal-subtitle">Create a new feature card for the Kanban board.</span>
          </div>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <form className="form task-form" onSubmit={handleSubmit}>
          {/* Title Input */}
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter feature title"
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          {/* Description Textarea */}
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the feature..."
              rows={4}
            />
            <span className="form-hint">Paste, drag and drop images, or browse to attach context images.</span>
          </div>

          {/* Category Select */}
          <div className="form-group">
            <label htmlFor="category">Category (optional)</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="category-select"
            >
              <option value="">e.g., Core, UI, API</option>
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
                  name="branchType"
                  value="current"
                  checked={branchType === 'current'}
                  onChange={() => setBranchType('current')}
                />
                <span className="radio-label">Use current selected branch</span>
                <span className="branch-name-hint">(main)</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="branchType"
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
            <span className="form-hint">Work will be done in the currently selected branch. A worktree will be created if needed.</span>
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
            <button type="submit" className="btn btn-primary btn-add-feature">
              Add Feature <span className="btn-shortcut">⌘ ↵</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

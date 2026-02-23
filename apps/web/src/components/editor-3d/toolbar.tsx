'use client';

import {
  MousePointer2,
  Move,
  RotateCcw,
  Maximize,
  Ruler,
  Undo2,
  Redo2,
  ArrowUp,
  MonitorUp,
  Orbit,
  Maximize2,
} from 'lucide-react';
import { Button } from '@openlintel/ui';
import { cn } from '@openlintel/ui';

export type EditorTool = 'select' | 'move' | 'rotate' | 'scale' | 'measure';
export type ViewPreset = 'perspective' | 'top' | 'front';

interface ToolbarProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onViewChange: (view: ViewPreset) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onFullscreen: () => void;
  isFullscreen: boolean;
}

const tools: { id: EditorTool; label: string; icon: React.ComponentType<{ className?: string }>; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V' },
  { id: 'move', label: 'Move', icon: Move, shortcut: 'G' },
  { id: 'rotate', label: 'Rotate', icon: RotateCcw, shortcut: 'R' },
  { id: 'scale', label: 'Scale', icon: Maximize, shortcut: 'S' },
  { id: 'measure', label: 'Measure', icon: Ruler, shortcut: 'M' },
];

const views: { id: ViewPreset; label: string; icon: React.ComponentType<{ className?: string }>; shortcut: string }[] = [
  { id: 'top', label: 'Top View', icon: ArrowUp, shortcut: 'T' },
  { id: 'front', label: 'Front View', icon: MonitorUp, shortcut: 'F' },
  { id: 'perspective', label: 'Perspective', icon: Orbit, shortcut: 'P' },
];

export function Toolbar({
  activeTool,
  onToolChange,
  onViewChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFullscreen,
  isFullscreen,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5">
        {tools.map((tool) => (
          <Button
            key={tool.id}
            variant={activeTool === tool.id ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              activeTool === tool.id && 'shadow-sm',
            )}
            onClick={() => onToolChange(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <tool.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-border" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-border" />

      {/* View buttons */}
      <div className="flex items-center gap-0.5">
        {views.map((view) => (
          <Button
            key={view.id}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onViewChange(view.id)}
            title={`${view.label} (${view.shortcut})`}
          >
            <view.icon className="mr-1 h-3.5 w-3.5" />
            {view.label}
          </Button>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-border" />

      {/* Fullscreen */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onFullscreen}
        title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F11)'}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

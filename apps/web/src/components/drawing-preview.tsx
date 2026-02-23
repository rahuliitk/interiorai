'use client';

import { useState, useRef, useCallback } from 'react';
import { Button, Badge } from '@openlintel/ui';
import { ZoomIn, ZoomOut, RotateCcw, Layers, Eye, EyeOff } from 'lucide-react';
import { cn } from '@openlintel/ui';

const LAYERS = [
  { id: 'walls', label: 'Walls', color: '#1f2937' },
  { id: 'furniture', label: 'Furniture', color: '#059669' },
  { id: 'electrical', label: 'Electrical', color: '#d97706' },
  { id: 'plumbing', label: 'Plumbing', color: '#2563eb' },
  { id: 'dimensions', label: 'Dimensions', color: '#dc2626' },
] as const;

interface DrawingPreviewProps {
  svgUrl?: string | null;
  drawingType: string;
  title?: string;
  roomName?: string;
  variantName?: string;
  date?: string;
}

export function DrawingPreview({
  svgUrl,
  drawingType,
  title,
  roomName,
  variantName,
  date,
}: DrawingPreviewProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [showLayers, setShowLayers] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    new Set(LAYERS.map((l) => l.id)),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setScale((s) => Math.min(s * 1.25, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s / 1.25, 0.25));
  const handleReset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    },
    [isPanning, startPan],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.25), 5));
  }, []);

  const toggleLayer = (layerId: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  const hasSvg = Boolean(svgUrl);

  return (
    <div className="flex flex-col rounded-lg border bg-white dark:bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {drawingType
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())}
          </Badge>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(scale * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant={showLayers ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowLayers(!showLayers)}
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative flex">
        {/* SVG viewer */}
        <div
          ref={containerRef}
          className={cn(
            'flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900',
            isPanning ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ height: 420 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {hasSvg ? (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={svgUrl!}
                alt={`${drawingType} drawing`}
                className="max-h-full max-w-full"
                draggable={false}
              />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
              <svg
                width="120"
                height="120"
                viewBox="0 0 120 120"
                fill="none"
                className="mb-3 opacity-30"
              >
                <rect x="10" y="10" width="100" height="100" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
                <line x1="30" y1="10" x2="30" y2="110" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="60" y1="10" x2="60" y2="110" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="90" y1="10" x2="90" y2="110" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="10" y1="35" x2="110" y2="35" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="10" y1="60" x2="110" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="10" y1="85" x2="110" y2="85" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <rect x="35" y="40" width="20" height="30" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <rect x="70" y="50" width="25" height="25" stroke="currentColor" strokeWidth="1.5" fill="none" rx="2" />
              </svg>
              <p className="text-sm">Drawing preview will appear here</p>
              <p className="text-xs">Generate drawings from a design variant</p>
            </div>
          )}
        </div>

        {/* Layer panel */}
        {showLayers && (
          <div className="w-48 border-l bg-white p-3 dark:bg-gray-950">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Layers
            </p>
            <div className="space-y-1">
              {LAYERS.map((layer) => {
                const isVisible = visibleLayers.has(layer.id);
                return (
                  <button
                    key={layer.id}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                      !isVisible && 'opacity-50',
                    )}
                    onClick={() => toggleLayer(layer.id)}
                  >
                    {isVisible ? (
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <div
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span>{layer.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Title block */}
      {(title || roomName || variantName) && (
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {title && <span className="font-medium text-foreground">{title}</span>}
            {roomName && <span>{roomName}</span>}
            {variantName && <span>{variantName}</span>}
          </div>
          {date && <span>{new Date(date).toLocaleDateString()}</span>}
        </div>
      )}
    </div>
  );
}

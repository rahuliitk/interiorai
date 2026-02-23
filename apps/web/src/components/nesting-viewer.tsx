'use client';

import { useState, useMemo } from 'react';
import { Button, Badge } from '@openlintel/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@openlintel/ui';

export interface PlacedPanel {
  id: string;
  partName: string;
  furnitureUnit: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
}

export interface NestingSheet {
  sheetNumber: number;
  sheetLength: number;
  sheetWidth: number;
  material: string;
  thickness: number;
  panels: PlacedPanel[];
  wastePercent: number;
}

const UNIT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
];

interface NestingViewerProps {
  sheets: NestingSheet[];
}

export function NestingViewer({ sheets }: NestingViewerProps) {
  const [currentSheet, setCurrentSheet] = useState(0);

  const unitColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;
    for (const sheet of sheets) {
      for (const panel of sheet.panels) {
        if (!(panel.furnitureUnit in map)) {
          map[panel.furnitureUnit] = UNIT_COLORS[idx % UNIT_COLORS.length];
          idx++;
        }
      }
    }
    return map;
  }, [sheets]);

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-12 text-center">
        <svg
          width="80"
          height="80"
          viewBox="0 0 80 80"
          fill="none"
          className="mb-3 opacity-30"
        >
          <rect x="5" y="5" width="70" height="70" stroke="currentColor" strokeWidth="2" />
          <rect x="8" y="8" width="25" height="18" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1" />
          <rect x="36" y="8" width="16" height="30" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
          <rect x="8" y="29" width="25" height="22" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" />
          <rect x="55" y="8" width="17" height="25" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="1" />
          <rect x="8" y="54" width="30" height="18" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1" />
        </svg>
        <p className="text-sm text-muted-foreground">Nesting visualization will appear here</p>
        <p className="text-xs text-muted-foreground">
          Generate a cut list to see panel nesting on sheets
        </p>
      </div>
    );
  }

  const sheet = sheets[currentSheet];
  if (!sheet) return null;

  // Scale to fit within the viewer (600px max width)
  const viewerWidth = 600;
  const scaleRatio = viewerWidth / sheet.sheetLength;
  const viewerHeight = sheet.sheetWidth * scaleRatio;

  return (
    <div className="space-y-4">
      {/* Sheet navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentSheet === 0}
            onClick={() => setCurrentSheet((s) => s - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            Sheet {currentSheet + 1} of {sheets.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentSheet === sheets.length - 1}
            onClick={() => setCurrentSheet((s) => s + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs">
            {sheet.material} {sheet.thickness}mm
          </Badge>
          <span className="text-xs text-muted-foreground">
            {sheet.sheetLength} x {sheet.sheetWidth} mm
          </span>
          <Badge
            variant={sheet.wastePercent > 25 ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            Waste: {sheet.wastePercent.toFixed(1)}%
          </Badge>
        </div>
      </div>

      {/* Sheet visualization */}
      <div className="overflow-x-auto rounded-lg border bg-white p-4 dark:bg-gray-950">
        <div
          className="relative mx-auto border-2 border-dashed border-gray-300 dark:border-gray-700"
          style={{
            width: viewerWidth,
            height: viewerHeight,
          }}
        >
          {/* Sheet dimensions labels */}
          <div className="absolute -top-5 left-0 right-0 text-center text-[10px] text-muted-foreground">
            {sheet.sheetLength} mm
          </div>
          <div
            className="absolute -left-12 top-0 flex items-center text-[10px] text-muted-foreground"
            style={{ height: viewerHeight, writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
          >
            {sheet.sheetWidth} mm
          </div>

          {/* Waste area background */}
          <div
            className="absolute inset-0"
            style={{
              background: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(239,68,68,0.05) 5px, rgba(239,68,68,0.05) 10px)',
            }}
          />

          {/* Placed panels */}
          {sheet.panels.map((panel) => {
            const color = unitColorMap[panel.furnitureUnit] || '#6b7280';
            const panelW = (panel.rotated ? panel.width : panel.length) * scaleRatio;
            const panelH = (panel.rotated ? panel.length : panel.width) * scaleRatio;
            const panelX = panel.x * scaleRatio;
            const panelY = panel.y * scaleRatio;

            return (
              <div
                key={panel.id}
                className="absolute flex items-center justify-center overflow-hidden border text-[9px] font-medium text-white"
                style={{
                  left: panelX,
                  top: panelY,
                  width: panelW,
                  height: panelH,
                  backgroundColor: color,
                  borderColor: 'rgba(255,255,255,0.3)',
                  opacity: 0.85,
                }}
                title={`${panel.partName} (${panel.furnitureUnit}) - ${panel.length}x${panel.width}mm${panel.rotated ? ' [rotated]' : ''}`}
              >
                {panelW > 40 && panelH > 20 && (
                  <span className="truncate px-1">{panel.partName}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(unitColorMap).map(([unit, color]) => (
          <div
            key={unit}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          >
            <div
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span>{unit}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
          <div
            className="h-2.5 w-2.5 rounded-sm"
            style={{
              background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(239,68,68,0.3) 2px, rgba(239,68,68,0.3) 4px)',
            }}
          />
          <span className="text-muted-foreground">Waste</span>
        </div>
      </div>
    </div>
  );
}

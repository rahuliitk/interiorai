'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from '@openlintel/ui';
import { Eye, EyeOff, Layers } from 'lucide-react';

interface Segment {
  id: string;
  type: SegmentType;
  label: string;
  polygon: Array<{ x: number; y: number }>; // normalized 0-1 coordinates
  confidence: number;
  area?: number; // in pixels or mm^2
}

type SegmentType =
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'furniture'
  | 'window'
  | 'door'
  | 'lighting'
  | 'decoration'
  | 'other';

const SEGMENT_COLORS: Record<SegmentType, { fill: string; stroke: string; label: string }> = {
  wall: { fill: 'rgba(59, 130, 246, 0.25)', stroke: '#3b82f6', label: 'Walls' },
  floor: { fill: 'rgba(34, 197, 94, 0.25)', stroke: '#22c55e', label: 'Floor' },
  ceiling: { fill: 'rgba(168, 85, 247, 0.25)', stroke: '#a855f7', label: 'Ceiling' },
  furniture: { fill: 'rgba(249, 115, 22, 0.25)', stroke: '#f97316', label: 'Furniture' },
  window: { fill: 'rgba(6, 182, 212, 0.25)', stroke: '#06b6d4', label: 'Windows' },
  door: { fill: 'rgba(236, 72, 153, 0.25)', stroke: '#ec4899', label: 'Doors' },
  lighting: { fill: 'rgba(234, 179, 8, 0.25)', stroke: '#eab308', label: 'Lighting' },
  decoration: { fill: 'rgba(139, 92, 246, 0.25)', stroke: '#8b5cf6', label: 'Decoration' },
  other: { fill: 'rgba(107, 114, 128, 0.25)', stroke: '#6b7280', label: 'Other' },
};

interface RoomSegmentationViewerProps {
  imageUrl: string;
  segments: Segment[];
  imageWidth?: number;
  imageHeight?: number;
}

export function RoomSegmentationViewer({
  imageUrl,
  segments,
  imageWidth = 1920,
  imageHeight = 1080,
}: RoomSegmentationViewerProps) {
  const [visibility, setVisibility] = useState<Record<SegmentType, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const type of Object.keys(SEGMENT_COLORS)) {
        initial[type] = true;
      }
      return initial as Record<SegmentType, boolean>;
    },
  );
  const [showAll, setShowAll] = useState(true);

  // Group segments by type for the legend
  const segmentsByType = useMemo(() => {
    const groups: Partial<Record<SegmentType, Segment[]>> = {};
    for (const seg of segments) {
      if (!groups[seg.type]) groups[seg.type] = [];
      groups[seg.type]!.push(seg);
    }
    return groups;
  }, [segments]);

  const toggleType = (type: SegmentType) => {
    setVisibility((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const toggleAll = () => {
    const newValue = !showAll;
    setShowAll(newValue);
    const updated: Record<string, boolean> = {};
    for (const type of Object.keys(SEGMENT_COLORS)) {
      updated[type] = newValue;
    }
    setVisibility(updated as Record<SegmentType, boolean>);
  };

  const visibleSegments = segments.filter(
    (seg) => visibility[seg.type] !== false,
  );

  const viewBoxWidth = imageWidth;
  const viewBoxHeight = imageHeight;

  return (
    <div className="space-y-4">
      {/* Image with overlay */}
      <div className="relative overflow-hidden rounded-lg border">
        <img
          src={imageUrl}
          alt="Room photo"
          className="block w-full"
          draggable={false}
        />

        {/* SVG overlay for segments */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid slice"
        >
          {visibleSegments.map((seg) => {
            const color = SEGMENT_COLORS[seg.type] ?? SEGMENT_COLORS.other;
            const points = seg.polygon
              .map(
                (p) =>
                  `${p.x * viewBoxWidth},${p.y * viewBoxHeight}`,
              )
              .join(' ');

            return (
              <g key={seg.id}>
                <polygon
                  points={points}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth="2"
                />
                {/* Label at centroid */}
                {seg.polygon.length > 0 && (
                  <text
                    x={
                      (seg.polygon.reduce((sum, p) => sum + p.x, 0) /
                        seg.polygon.length) *
                      viewBoxWidth
                    }
                    y={
                      (seg.polygon.reduce((sum, p) => sum + p.y, 0) /
                        seg.polygon.length) *
                      viewBoxHeight
                    }
                    fill={color.stroke}
                    fontSize="14"
                    fontWeight="600"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      textShadow:
                        '0 0 3px rgba(255,255,255,0.8), 0 0 6px rgba(255,255,255,0.6)',
                    }}
                  >
                    {seg.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend and controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Segment Legend
            </CardTitle>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {showAll ? (
                <>
                  <EyeOff className="mr-1 h-3.5 w-3.5" />
                  Hide All
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Show All
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(segmentsByType).map(([type, segs]) => {
              const segType = type as SegmentType;
              const color = SEGMENT_COLORS[segType] ?? SEGMENT_COLORS.other;
              const isVisible = visibility[segType] !== false;

              return (
                <button
                  key={type}
                  onClick={() => toggleType(segType)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${
                    isVisible ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{
                      backgroundColor: color.fill,
                      borderColor: color.stroke,
                    }}
                  />
                  {color.label} ({segs?.length ?? 0})
                  {isVisible ? (
                    <Eye className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>

          {segments.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No segmentation results available. Run room analysis to detect
              segments.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

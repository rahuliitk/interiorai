'use client';

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from '@openlintel/ui';
import { Ruler, Eye, EyeOff, Info } from 'lucide-react';

interface MeasurementPoint {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
}

interface Measurement {
  id: string;
  label: string;
  valueMm: number;
  start: MeasurementPoint;
  end: MeasurementPoint;
  type: 'width' | 'height' | 'depth' | 'diagonal';
  confidence: number;
}

interface ReferenceObject {
  label: string;
  knownSizeMm: number;
  position: MeasurementPoint;
  detectedSizePx: number;
}

interface MeasurementOverlayProps {
  imageUrl: string;
  measurements: Measurement[];
  referenceObject?: ReferenceObject | null;
  imageWidth?: number;
  imageHeight?: number;
}

function formatMm(mm: number): string {
  if (mm >= 1000) {
    return `${(mm / 1000).toFixed(2)}m`;
  }
  return `${Math.round(mm)}mm`;
}

export function MeasurementOverlay({
  imageUrl,
  measurements,
  referenceObject,
  imageWidth = 1920,
  imageHeight = 1080,
}: MeasurementOverlayProps) {
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showReference, setShowReference] = useState(true);
  const [selectedMeasurement, setSelectedMeasurement] = useState<string | null>(
    null,
  );

  const viewBoxWidth = imageWidth;
  const viewBoxHeight = imageHeight;

  const MEASUREMENT_COLORS: Record<string, string> = {
    width: '#3b82f6',
    height: '#22c55e',
    depth: '#f97316',
    diagonal: '#a855f7',
  };

  return (
    <div className="space-y-4">
      {/* Image with measurement overlay */}
      <div className="relative overflow-hidden rounded-lg border">
        <img
          src={imageUrl}
          alt="Room with measurements"
          className="block w-full"
          draggable={false}
        />

        {showMeasurements && (
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
            preserveAspectRatio="xMidYMid slice"
          >
            {/* Arrow marker definition */}
            <defs>
              {Object.entries(MEASUREMENT_COLORS).map(([type, color]) => (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  markerWidth="8"
                  markerHeight="6"
                  refX="8"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L8,3 L0,6" fill={color} />
                </marker>
              ))}
              <marker
                id="arrow-reverse"
                markerWidth="8"
                markerHeight="6"
                refX="0"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M8,0 L0,3 L8,6" fill="currentColor" />
              </marker>
            </defs>

            {/* Dimension lines */}
            {measurements.map((m) => {
              const color = MEASUREMENT_COLORS[m.type] ?? '#6b7280';
              const x1 = m.start.x * viewBoxWidth;
              const y1 = m.start.y * viewBoxHeight;
              const x2 = m.end.x * viewBoxWidth;
              const y2 = m.end.y * viewBoxHeight;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              const isSelected = selectedMeasurement === m.id;

              // Calculate offset for label
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.sqrt(dx * dx + dy * dy);
              const offsetX = len > 0 ? (-dy / len) * 20 : 0;
              const offsetY = len > 0 ? (dx / len) * 20 : -20;

              return (
                <g
                  key={m.id}
                  onClick={() =>
                    setSelectedMeasurement(
                      isSelected ? null : m.id,
                    )
                  }
                  className="cursor-pointer"
                  opacity={isSelected || !selectedMeasurement ? 1 : 0.4}
                >
                  {/* Main dimension line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={color}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray={m.type === 'diagonal' ? '6,4' : 'none'}
                    markerEnd={`url(#arrow-${m.type})`}
                  />

                  {/* Start endpoint tick */}
                  <circle
                    cx={x1}
                    cy={y1}
                    r={isSelected ? 5 : 3}
                    fill={color}
                  />

                  {/* End endpoint tick */}
                  <circle
                    cx={x2}
                    cy={y2}
                    r={isSelected ? 5 : 3}
                    fill={color}
                  />

                  {/* Label background */}
                  <rect
                    x={midX + offsetX - 40}
                    y={midY + offsetY - 10}
                    width="80"
                    height="20"
                    rx="4"
                    fill="rgba(0,0,0,0.75)"
                  />

                  {/* Label text */}
                  <text
                    x={midX + offsetX}
                    y={midY + offsetY + 4}
                    fill="white"
                    fontSize="12"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {formatMm(m.valueMm)}
                  </text>
                </g>
              );
            })}

            {/* Reference object indicator */}
            {showReference && referenceObject && (
              <g>
                <circle
                  cx={referenceObject.position.x * viewBoxWidth}
                  cy={referenceObject.position.y * viewBoxHeight}
                  r="16"
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="2"
                  strokeDasharray="4,3"
                />
                <circle
                  cx={referenceObject.position.x * viewBoxWidth}
                  cy={referenceObject.position.y * viewBoxHeight}
                  r="4"
                  fill="#eab308"
                />
                <rect
                  x={referenceObject.position.x * viewBoxWidth - 55}
                  y={referenceObject.position.y * viewBoxHeight + 20}
                  width="110"
                  height="20"
                  rx="4"
                  fill="rgba(234, 179, 8, 0.9)"
                />
                <text
                  x={referenceObject.position.x * viewBoxWidth}
                  y={referenceObject.position.y * viewBoxHeight + 34}
                  fill="black"
                  fontSize="11"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  Ref: {referenceObject.label}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Measurement Details */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4" />
              Measurements
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMeasurements(!showMeasurements)}
              >
                {showMeasurements ? (
                  <>
                    <EyeOff className="mr-1 h-3.5 w-3.5" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Show
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {referenceObject && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 dark:bg-amber-950/50">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Reference Object: {referenceObject.label}
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  Known size: {formatMm(referenceObject.knownSizeMm)} — used to
                  calibrate all measurements.
                </p>
              </div>
            </div>
          )}

          {measurements.length > 0 ? (
            <div className="space-y-2">
              {measurements.map((m) => {
                const color = MEASUREMENT_COLORS[m.type] ?? '#6b7280';
                const isSelected = selectedMeasurement === m.id;

                return (
                  <button
                    key={m.id}
                    onClick={() =>
                      setSelectedMeasurement(isSelected ? null : m.id)
                    }
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium">{m.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {m.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {formatMm(m.valueMm)}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {Math.round(m.confidence * 100)}%
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No measurements available. Run room analysis to detect dimensions.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

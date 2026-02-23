'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Separator,
} from '@openlintel/ui';
import {
  Download,
  ShoppingCart,
  FileText,
  GripVertical,
  ImageIcon,
} from 'lucide-react';

interface DesignResultViewerProps {
  beforeImageUrl?: string | null;
  afterImageUrl?: string | null;
  renderUrls?: string[];
  style: string;
  budgetTier: string;
  constraints?: string[];
  variantName: string;
  onGenerateBOM?: () => void;
  onGenerateDrawings?: () => void;
  onDownload?: (url: string) => void;
}

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    [],
  );

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    },
    [isDragging, handleMove],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX);
    },
    [handleMove],
  );

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full cursor-col-resize overflow-hidden rounded-lg border select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* After image (full width, behind) */}
      <img
        src={afterUrl}
        alt="After design"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeUrl}
          alt="Before design"
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            width: containerRef.current
              ? `${containerRef.current.offsetWidth}px`
              : '100vw',
          }}
          draggable={false}
        />
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-lg"
        style={{ left: `${sliderPosition}%` }}
      >
        <div
          className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-10">
        <Badge variant="secondary" className="bg-black/60 text-white">
          Before
        </Badge>
      </div>
      <div className="absolute top-3 right-3 z-10">
        <Badge variant="secondary" className="bg-black/60 text-white">
          After
        </Badge>
      </div>
    </div>
  );
}

export function DesignResultViewer({
  beforeImageUrl,
  afterImageUrl,
  renderUrls = [],
  style,
  budgetTier,
  constraints = [],
  variantName,
  onGenerateBOM,
  onGenerateDrawings,
  onDownload,
}: DesignResultViewerProps) {
  const [selectedRender, setSelectedRender] = useState(0);
  const allRenderUrls = afterImageUrl
    ? [afterImageUrl, ...renderUrls.filter((u) => u !== afterImageUrl)]
    : renderUrls;
  const currentRenderUrl = allRenderUrls[selectedRender] ?? null;

  const handleDownload = (url: string) => {
    if (onDownload) {
      onDownload(url);
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${variantName}-render.png`;
      link.click();
    }
  };

  return (
    <div className="space-y-6">
      {/* Before/After Comparison */}
      {beforeImageUrl && currentRenderUrl ? (
        <BeforeAfterSlider
          beforeUrl={beforeImageUrl}
          afterUrl={currentRenderUrl}
        />
      ) : currentRenderUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
          <img
            src={currentRenderUrl}
            alt={variantName}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border bg-muted">
          <div className="text-center">
            <ImageIcon className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No render available yet
            </p>
          </div>
        </div>
      )}

      {/* Render thumbnails */}
      {allRenderUrls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allRenderUrls.map((url, i) => (
            <button
              key={i}
              onClick={() => setSelectedRender(i)}
              className={`shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                i === selectedRender
                  ? 'border-primary'
                  : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <img
                src={url}
                alt={`Render ${i + 1}`}
                className="h-16 w-24 object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Design Details Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Design Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </Badge>
            <Badge variant="outline">
              {budgetTier.charAt(0).toUpperCase() + budgetTier.slice(1)}
            </Badge>
          </div>

          {constraints.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-sm font-medium">Constraints Applied</p>
                <div className="flex flex-wrap gap-1.5">
                  {constraints.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {currentRenderUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(currentRenderUrl)}
              >
                <Download className="mr-1 h-4 w-4" />
                Download Render
              </Button>
            )}
            {onGenerateBOM && (
              <Button variant="outline" size="sm" onClick={onGenerateBOM}>
                <ShoppingCart className="mr-1 h-4 w-4" />
                Generate BOM
              </Button>
            )}
            {onGenerateDrawings && (
              <Button variant="outline" size="sm" onClick={onGenerateDrawings}>
                <FileText className="mr-1 h-4 w-4" />
                Generate Drawings
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { Button, Card, CardContent, Badge } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import {
  Plus,
  Minus,
  RotateCcw,
  Move,
  Check,
  X,
  Smartphone,
  Target,
  Maximize2,
} from 'lucide-react';

export interface ARPlacedItem {
  id: string;
  name: string;
  category: string;
  color: string;
  /** Scale factor (1 = real-world size). */
  scale: number;
  /** Whether placement has been confirmed. */
  confirmed: boolean;
}

interface ARPlacementProps {
  /** Items available for placement. */
  items: { name: string; category: string; color: string }[];
  /** Currently placed items. */
  placedItems: ARPlacedItem[];
  /** Callback when an item is placed. */
  onPlace: (item: ARPlacedItem) => void;
  /** Callback when an item placement is confirmed. */
  onConfirm: (id: string) => void;
  /** Callback when a placed item is removed. */
  onRemove: (id: string) => void;
  /** Callback when item scale changes. */
  onScaleChange: (id: string, scale: number) => void;
  /** Whether AR session is active. */
  sessionActive: boolean;
}

export function ARPlacement({
  items,
  placedItems,
  onPlace,
  onConfirm,
  onRemove,
  onScaleChange,
  sessionActive,
}: ARPlacementProps) {
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [surfaceDetected, setSurfaceDetected] = useState(false);

  // Simulate surface detection status (in a real app, this comes from the AR session)
  const handleSurfaceCheck = useCallback(() => {
    setSurfaceDetected(true);
  }, []);

  const handlePlaceItem = useCallback(() => {
    if (selectedItemIndex === null || !items[selectedItemIndex]) return;

    const item = items[selectedItemIndex];
    const placedItem: ARPlacedItem = {
      id: `ar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      category: item.category,
      color: item.color,
      scale: 1.0,
      confirmed: false,
    };

    onPlace(placedItem);
    setActiveItemId(placedItem.id);
  }, [selectedItemIndex, items, onPlace]);

  const handleScaleUp = useCallback(() => {
    if (!activeItemId) return;
    const item = placedItems.find((i) => i.id === activeItemId);
    if (item) {
      onScaleChange(activeItemId, Math.min(item.scale + 0.1, 3.0));
    }
  }, [activeItemId, placedItems, onScaleChange]);

  const handleScaleDown = useCallback(() => {
    if (!activeItemId) return;
    const item = placedItems.find((i) => i.id === activeItemId);
    if (item) {
      onScaleChange(activeItemId, Math.max(item.scale - 0.1, 0.1));
    }
  }, [activeItemId, placedItems, onScaleChange]);

  const activeItem = placedItems.find((i) => i.id === activeItemId);

  if (!sessionActive) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Smartphone className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">AR Placement Mode</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start an AR session to place furniture in your space.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span>Point your camera at a flat surface</span>
          </div>
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4" />
            <span>Tap to place furniture</span>
          </div>
          <div className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4" />
            <span>Pinch to resize objects</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Surface detection status */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg p-3 text-xs',
          surfaceDetected
            ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300'
            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
        )}
      >
        <Target className="h-4 w-4" />
        {surfaceDetected ? (
          <span>Surface detected. Tap to place furniture.</span>
        ) : (
          <span>Scanning for surfaces... Move your device slowly.</span>
        )}
        {!surfaceDetected && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-xs"
            onClick={handleSurfaceCheck}
          >
            Simulate
          </Button>
        )}
      </div>

      {/* Item selector */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Select Furniture</p>
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((item, idx) => (
            <button
              key={idx}
              className={cn(
                'flex items-center gap-2 rounded-md border p-2 text-left text-xs transition-colors',
                selectedItemIndex === idx
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:bg-muted',
              )}
              onClick={() => setSelectedItemIndex(idx)}
            >
              <div
                className="h-5 w-5 shrink-0 rounded border"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Place button */}
      <Button
        className="w-full"
        disabled={selectedItemIndex === null || !surfaceDetected}
        onClick={handlePlaceItem}
      >
        <Plus className="mr-1 h-4 w-4" />
        Place on Surface
      </Button>

      {/* Active item controls */}
      {activeItem && !activeItem.confirmed && (
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">{activeItem.name}</p>
              <Badge variant="outline" className="text-[10px]">
                Adjusting
              </Badge>
            </div>

            {/* Scale controls */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Scale: {(activeItem.scale * 100).toFixed(0)}%
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleScaleDown}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.05}
                  value={activeItem.scale}
                  onChange={(e) =>
                    onScaleChange(activeItemId!, parseFloat(e.target.value))
                  }
                  className="flex-1 accent-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleScaleUp}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Confirm / Cancel */}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  onConfirm(activeItemId!);
                  setActiveItemId(null);
                }}
              >
                <Check className="mr-1 h-4 w-4" />
                Confirm
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => {
                  onRemove(activeItemId!);
                  setActiveItemId(null);
                }}
              >
                <X className="mr-1 h-4 w-4" />
                Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Placed items list */}
      {placedItems.filter((i) => i.confirmed).length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Placed Items</p>
          <div className="space-y-1">
            {placedItems
              .filter((i) => i.confirmed)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded border"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(item.scale * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onRemove(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

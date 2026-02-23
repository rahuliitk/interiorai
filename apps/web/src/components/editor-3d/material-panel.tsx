'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import { Paintbrush, Check } from 'lucide-react';

export interface MaterialPreset {
  id: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
}

const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'oak-wood', name: 'Oak Wood', color: '#b5894e', roughness: 0.7, metalness: 0.0 },
  { id: 'walnut-wood', name: 'Walnut Wood', color: '#5c3a1e', roughness: 0.65, metalness: 0.0 },
  { id: 'teak-wood', name: 'Teak Wood', color: '#8b6914', roughness: 0.7, metalness: 0.0 },
  { id: 'white-marble', name: 'White Marble', color: '#f5f0eb', roughness: 0.2, metalness: 0.1 },
  { id: 'black-marble', name: 'Black Marble', color: '#1a1a1a', roughness: 0.15, metalness: 0.15 },
  { id: 'ceramic-tile', name: 'Ceramic Tile', color: '#d4c5a9', roughness: 0.3, metalness: 0.0 },
  { id: 'subway-tile', name: 'Subway Tile', color: '#f0ece4', roughness: 0.25, metalness: 0.0 },
  { id: 'cotton-fabric', name: 'Cotton Fabric', color: '#e8dcc8', roughness: 0.95, metalness: 0.0 },
  { id: 'velvet-fabric', name: 'Velvet Fabric', color: '#4a2c6e', roughness: 0.9, metalness: 0.0 },
  { id: 'linen-fabric', name: 'Linen Fabric', color: '#c9b99a', roughness: 0.92, metalness: 0.0 },
  { id: 'brushed-metal', name: 'Brushed Metal', color: '#c0c0c0', roughness: 0.4, metalness: 0.9 },
  { id: 'polished-metal', name: 'Polished Metal', color: '#d4d4d4', roughness: 0.1, metalness: 0.95 },
  { id: 'gold-metal', name: 'Gold Metal', color: '#d4a843', roughness: 0.25, metalness: 0.95 },
  { id: 'clear-glass', name: 'Clear Glass', color: '#e0f0ff', roughness: 0.05, metalness: 0.1 },
  { id: 'frosted-glass', name: 'Frosted Glass', color: '#f0f5f8', roughness: 0.6, metalness: 0.05 },
];

const CATEGORY_MAP: Record<string, string[]> = {
  Wood: ['oak-wood', 'walnut-wood', 'teak-wood'],
  Marble: ['white-marble', 'black-marble'],
  Tile: ['ceramic-tile', 'subway-tile'],
  Fabric: ['cotton-fabric', 'velvet-fabric', 'linen-fabric'],
  Metal: ['brushed-metal', 'polished-metal', 'gold-metal'],
  Glass: ['clear-glass', 'frosted-glass'],
};

const QUICK_COLORS = [
  '#ffffff', '#f5f5f5', '#d4d4d4', '#737373', '#404040', '#171717',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#06b6d4', '#a855f7',
];

interface MaterialPanelProps {
  selectedObjectId: string | null;
  onApplyMaterial: (material: MaterialPreset) => void;
  onApplyColor: (color: string) => void;
}

export function MaterialPanel({
  selectedObjectId,
  onApplyMaterial,
  onApplyColor,
}: MaterialPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('Wood');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState('#8B7355');

  const categoryPresets = CATEGORY_MAP[activeCategory]
    ?.map((id) => MATERIAL_PRESETS.find((p) => p.id === id))
    .filter(Boolean) as MaterialPreset[];

  const handleApplyPreset = (preset: MaterialPreset) => {
    setSelectedPreset(preset.id);
    onApplyMaterial(preset);
  };

  const handleApplyColor = (color: string) => {
    setCustomColor(color);
    onApplyColor(color);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Paintbrush className="h-4 w-4" />
          Materials
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedObjectId && (
          <p className="text-xs text-muted-foreground">Select an object to apply materials.</p>
        )}

        {/* Material category tabs */}
        <div className="flex flex-wrap gap-1">
          {Object.keys(CATEGORY_MAP).map((cat) => (
            <button
              key={cat}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Material presets */}
        <div className="grid grid-cols-1 gap-1.5">
          {categoryPresets.map((preset) => (
            <button
              key={preset.id}
              className={cn(
                'flex items-center gap-2 rounded-md border p-2 text-left text-xs transition-colors',
                selectedPreset === preset.id
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:bg-muted',
                !selectedObjectId && 'pointer-events-none opacity-50',
              )}
              onClick={() => handleApplyPreset(preset)}
              disabled={!selectedObjectId}
            >
              <div
                className="h-6 w-6 shrink-0 rounded border"
                style={{ backgroundColor: preset.color }}
              />
              <span className="flex-1 truncate">{preset.name}</span>
              {selectedPreset === preset.id && (
                <Check className="h-3 w-3 text-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Custom Color</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  'h-6 w-6 rounded border transition-transform hover:scale-110',
                  customColor === color && 'ring-2 ring-primary ring-offset-1',
                  !selectedObjectId && 'pointer-events-none opacity-50',
                )}
                style={{ backgroundColor: color }}
                onClick={() => handleApplyColor(color)}
                disabled={!selectedObjectId}
                title={color}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={customColor}
              onChange={(e) => handleApplyColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border p-0"
              disabled={!selectedObjectId}
            />
            <span className="text-xs text-muted-foreground">{customColor}</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 text-xs"
              disabled={!selectedObjectId}
              onClick={() => handleApplyColor(customColor)}
            >
              Apply
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

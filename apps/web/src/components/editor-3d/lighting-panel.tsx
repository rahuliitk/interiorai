'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import { Sun, Sunset, Moon, Lightbulb } from 'lucide-react';

export interface LightingConfig {
  preset: LightingPreset;
  ambientIntensity: number;
  directionalIntensity: number;
  directionalColor: string;
  directionalPosition: [number, number, number];
  ambientColor: string;
}

export type LightingPreset = 'day' | 'evening' | 'night' | 'studio';

const LIGHTING_PRESETS: Record<LightingPreset, Omit<LightingConfig, 'preset'>> = {
  day: {
    ambientIntensity: 0.5,
    directionalIntensity: 1.2,
    directionalColor: '#fff5e6',
    directionalPosition: [5, 8, 5],
    ambientColor: '#e8eef5',
  },
  evening: {
    ambientIntensity: 0.3,
    directionalIntensity: 0.8,
    directionalColor: '#ff9944',
    directionalPosition: [8, 3, 2],
    ambientColor: '#2a1f3d',
  },
  night: {
    ambientIntensity: 0.15,
    directionalIntensity: 0.3,
    directionalColor: '#4466aa',
    directionalPosition: [0, 6, 0],
    ambientColor: '#0a0a1a',
  },
  studio: {
    ambientIntensity: 0.6,
    directionalIntensity: 1.5,
    directionalColor: '#ffffff',
    directionalPosition: [3, 6, 3],
    ambientColor: '#f5f5f5',
  },
};

const presetOptions: { id: LightingPreset; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'day', label: 'Day', icon: Sun },
  { id: 'evening', label: 'Evening', icon: Sunset },
  { id: 'night', label: 'Night', icon: Moon },
  { id: 'studio', label: 'Studio', icon: Lightbulb },
];

interface LightingPanelProps {
  config: LightingConfig;
  onChange: (config: LightingConfig) => void;
}

export function LightingPanel({ config, onChange }: LightingPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const handlePresetChange = (preset: LightingPreset) => {
    const presetConfig = LIGHTING_PRESETS[preset];
    onChange({
      ...presetConfig,
      preset,
    });
  };

  const handleAmbientChange = (value: number) => {
    onChange({ ...config, ambientIntensity: value });
  };

  const handleDirectionalIntensityChange = (value: number) => {
    onChange({ ...config, directionalIntensity: value });
  };

  const handleDirectionalXChange = (value: number) => {
    onChange({
      ...config,
      directionalPosition: [value, config.directionalPosition[1], config.directionalPosition[2]],
    });
  };

  const handleDirectionalYChange = (value: number) => {
    onChange({
      ...config,
      directionalPosition: [config.directionalPosition[0], value, config.directionalPosition[2]],
    });
  };

  const handleDirectionalZChange = (value: number) => {
    onChange({
      ...config,
      directionalPosition: [config.directionalPosition[0], config.directionalPosition[1], value],
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sun className="h-4 w-4" />
          Lighting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset buttons */}
        <div className="grid grid-cols-4 gap-1">
          {presetOptions.map((preset) => (
            <button
              key={preset.id}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md p-2 text-xs transition-colors',
                config.preset === preset.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
              onClick={() => handlePresetChange(preset.id)}
            >
              <preset.icon className="h-4 w-4" />
              {preset.label}
            </button>
          ))}
        </div>

        {/* Ambient intensity slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Ambient</label>
            <span className="text-xs text-muted-foreground">
              {Math.round(config.ambientIntensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.ambientIntensity}
            onChange={(e) => handleAmbientChange(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {/* Directional intensity slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Directional</label>
            <span className="text-xs text-muted-foreground">
              {Math.round(config.directionalIntensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={config.directionalIntensity}
            onChange={(e) => handleDirectionalIntensityChange(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {/* Advanced controls toggle */}
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide advanced' : 'Show advanced controls'}
        </button>

        {expanded && (
          <div className="space-y-3 border-t pt-3">
            {/* Light position X */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Light X</label>
                <span className="text-xs text-muted-foreground">
                  {config.directionalPosition[0].toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.5}
                value={config.directionalPosition[0]}
                onChange={(e) => handleDirectionalXChange(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Light position Y */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Light Y</label>
                <span className="text-xs text-muted-foreground">
                  {config.directionalPosition[1].toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={config.directionalPosition[1]}
                onChange={(e) => handleDirectionalYChange(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Light position Z */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Light Z</label>
                <span className="text-xs text-muted-foreground">
                  {config.directionalPosition[2].toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.5}
                value={config.directionalPosition[2]}
                onChange={(e) => handleDirectionalZChange(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Light colour */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Light Color</label>
              <input
                type="color"
                value={config.directionalColor}
                onChange={(e) => onChange({ ...config, directionalColor: e.target.value })}
                className="h-6 w-6 cursor-pointer rounded border p-0"
              />
              <span className="text-xs text-muted-foreground">{config.directionalColor}</span>
            </div>

            {/* Ambient colour */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Ambient Color</label>
              <input
                type="color"
                value={config.ambientColor}
                onChange={(e) => onChange({ ...config, ambientColor: e.target.value })}
                className="h-6 w-6 cursor-pointer rounded border p-0"
              />
              <span className="text-xs text-muted-foreground">{config.ambientColor}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function getDefaultLightingConfig(): LightingConfig {
  return {
    preset: 'day',
    ...LIGHTING_PRESETS.day,
  };
}

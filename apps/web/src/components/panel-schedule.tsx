'use client';

import { useMemo } from 'react';
import { Badge } from '@openlintel/ui';
import { cn } from '@openlintel/ui';

export interface CircuitEntry {
  circuitNumber: number;
  description: string;
  breakerSize: number;
  wireGauge: string;
  load: number;
  phase: 'A' | 'B' | 'C' | 'single';
  type: 'lighting' | 'receptacle' | 'appliance' | 'motor' | 'spare';
}

interface PanelScheduleProps {
  panelName?: string;
  mainBreakerSize?: number;
  voltage?: number;
  phases?: number;
  circuits: CircuitEntry[];
  standardsCited?: string[];
}

const TYPE_COLORS: Record<string, string> = {
  lighting: 'bg-yellow-100 text-yellow-800',
  receptacle: 'bg-blue-100 text-blue-800',
  appliance: 'bg-green-100 text-green-800',
  motor: 'bg-red-100 text-red-800',
  spare: 'bg-gray-100 text-gray-500',
};

export function PanelSchedule({
  panelName = 'Main Panel',
  mainBreakerSize = 200,
  voltage = 240,
  phases = 1,
  circuits,
  standardsCited,
}: PanelScheduleProps) {
  const phaseLoads = useMemo(() => {
    const loads: Record<string, number> = { A: 0, B: 0, C: 0, single: 0 };
    for (const c of circuits) {
      loads[c.phase] = (loads[c.phase] || 0) + c.load;
    }
    return loads;
  }, [circuits]);

  const totalLoad = useMemo(
    () => circuits.reduce((sum, c) => sum + c.load, 0),
    [circuits],
  );

  const maxPhaseLoad = Math.max(phaseLoads.A, phaseLoads.B, phaseLoads.C || 0);
  const minPhaseLoad = Math.min(
    phaseLoads.A || Infinity,
    phaseLoads.B || Infinity,
    phaseLoads.C || Infinity,
  );
  const imbalancePercent =
    maxPhaseLoad > 0 ? ((maxPhaseLoad - minPhaseLoad) / maxPhaseLoad) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Panel info header */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <div>
          <span className="text-xs text-muted-foreground">Panel</span>
          <p className="text-sm font-semibold">{panelName}</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Main Breaker</span>
          <p className="text-sm font-medium">{mainBreakerSize}A</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Voltage</span>
          <p className="text-sm font-medium">{voltage}V {phases}-ph</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Total Load</span>
          <p className="text-sm font-medium">{totalLoad.toLocaleString()} W</p>
        </div>
      </div>

      {/* Circuit table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ckt #</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Description
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Breaker (A)
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Wire Gauge
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Load (W)
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phase</th>
            </tr>
          </thead>
          <tbody>
            {circuits.map((circuit) => (
              <tr key={circuit.circuitNumber} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 font-medium tabular-nums">{circuit.circuitNumber}</td>
                <td className="px-3 py-2">{circuit.description}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant="secondary"
                    className={cn('text-xs', TYPE_COLORS[circuit.type] || '')}
                  >
                    {circuit.type}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{circuit.breakerSize}</td>
                <td className="px-3 py-2 font-mono text-xs">{circuit.wireGauge}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {circuit.load.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-xs">
                    {circuit.phase === 'single' ? '1ph' : circuit.phase}
                  </Badge>
                </td>
              </tr>
            ))}
            {circuits.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No circuits configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phase balancing summary */}
      {phases > 1 && (
        <div className="rounded-lg border p-4">
          <p className="mb-3 text-sm font-semibold">Phase Balancing</p>
          <div className="grid grid-cols-3 gap-4">
            {['A', 'B', 'C'].slice(0, phases).map((phase) => {
              const load = phaseLoads[phase] || 0;
              const percent = totalLoad > 0 ? (load / totalLoad) * 100 : 0;
              return (
                <div key={phase} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Phase {phase}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {load.toLocaleString()} W
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {percent.toFixed(1)}% of total
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge
              variant={imbalancePercent > 15 ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              Imbalance: {imbalancePercent.toFixed(1)}%
            </Badge>
            {imbalancePercent > 15 && (
              <span className="text-xs text-red-600">
                Exceeds 15% recommended limit (NEC 210.11)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Standards references */}
      {standardsCited && standardsCited.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Standards Referenced
          </p>
          <div className="flex flex-wrap gap-1.5">
            {standardsCited.map((std) => (
              <Badge key={std} variant="outline" className="text-xs">
                {std}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

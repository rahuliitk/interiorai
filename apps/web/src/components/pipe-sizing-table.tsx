'use client';

import { useMemo } from 'react';
import { Badge } from '@openlintel/ui';

export interface FixtureUnit {
  id: string;
  fixtureType: string;
  count: number;
  hotFU: number;
  coldFU: number;
  drainageFU: number;
  trapSize: string;
}

export interface PipeSizing {
  id: string;
  section: string;
  totalFU: number;
  pipeSizeInch: string;
  material: string;
  flowGPM: number;
  velocityFPS: number;
}

export interface DrainageRequirement {
  id: string;
  section: string;
  drainageFU: number;
  pipeSizeInch: string;
  slopePerFoot: string;
  type: 'branch' | 'stack' | 'building_drain';
}

interface FixtureUnitTableProps {
  fixtures: FixtureUnit[];
  standardsCited?: string[];
}

export function FixtureUnitTable({ fixtures, standardsCited }: FixtureUnitTableProps) {
  const totals = useMemo(() => {
    return fixtures.reduce(
      (acc, f) => ({
        count: acc.count + f.count,
        hotFU: acc.hotFU + f.hotFU * f.count,
        coldFU: acc.coldFU + f.coldFU * f.count,
        drainageFU: acc.drainageFU + f.drainageFU * f.count,
      }),
      { count: 0, hotFU: 0, coldFU: 0, drainageFU: 0 },
    );
  }, [fixtures]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Fixture Type
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Count</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Hot FU (ea.)
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Cold FU (ea.)
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Drainage FU (ea.)
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Trap Size
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Total Hot FU
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Total Cold FU
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Total Drain FU
              </th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((fixture) => (
              <tr key={fixture.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{fixture.fixtureType}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fixture.count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fixture.hotFU}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fixture.coldFU}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fixture.drainageFU}</td>
                <td className="px-3 py-2 font-mono text-xs">{fixture.trapSize}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {(fixture.hotFU * fixture.count).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {(fixture.coldFU * fixture.count).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {(fixture.drainageFU * fixture.count).toFixed(1)}
                </td>
              </tr>
            ))}
            {fixtures.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No fixture data available.
                </td>
              </tr>
            )}

            {/* Totals row */}
            {fixtures.length > 0 && (
              <tr className="border-t-2 bg-muted/50 font-bold">
                <td className="px-3 py-3">Totals</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.count}</td>
                <td className="px-3 py-3" colSpan={4} />
                <td className="px-3 py-3 text-right tabular-nums">{totals.hotFU.toFixed(1)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.coldFU.toFixed(1)}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {totals.drainageFU.toFixed(1)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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

interface PipeSizingTableProps {
  pipes: PipeSizing[];
}

export function PipeSizingRecommendations({ pipes }: PipeSizingTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Section</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total FU</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Pipe Size
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
              Flow (GPM)
            </th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
              Velocity (FPS)
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {pipes.map((pipe) => {
            const velocityOk = pipe.velocityFPS <= 8;
            return (
              <tr key={pipe.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{pipe.section}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pipe.totalFU}</td>
                <td className="px-3 py-2 font-mono text-xs">{pipe.pipeSizeInch}"</td>
                <td className="px-3 py-2 text-muted-foreground">{pipe.material}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pipe.flowGPM.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pipe.velocityFPS.toFixed(1)}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={velocityOk ? 'secondary' : 'destructive'}
                    className="text-xs"
                  >
                    {velocityOk ? 'OK' : 'High velocity'}
                  </Badge>
                </td>
              </tr>
            );
          })}
          {pipes.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                No pipe sizing data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface DrainageTableProps {
  drains: DrainageRequirement[];
}

export function DrainageSlopeTable({ drains }: DrainageTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Section</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
              Drainage FU
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Pipe Size
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Slope (per ft)
            </th>
          </tr>
        </thead>
        <tbody>
          {drains.map((drain) => (
            <tr key={drain.id} className="border-b hover:bg-muted/20">
              <td className="px-3 py-2 font-medium">{drain.section}</td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {drain.type.replace(/_/g, ' ')}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{drain.drainageFU}</td>
              <td className="px-3 py-2 font-mono text-xs">{drain.pipeSizeInch}"</td>
              <td className="px-3 py-2 font-mono text-xs">{drain.slopePerFoot}</td>
            </tr>
          ))}
          {drains.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                No drainage data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

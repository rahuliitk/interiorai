'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import { ArrowUpDown, ArrowUp, ArrowDown, MoveRight } from 'lucide-react';

export interface CutListPanel {
  id: string;
  partName: string;
  furnitureUnit: string;
  length: number;
  width: number;
  thickness: number;
  material: string;
  grain: 'horizontal' | 'vertical' | 'none';
  edgeBanding: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
  quantity: number;
}

export interface HardwareItem {
  id: string;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  furnitureUnit: string;
}

type SortField = 'partName' | 'length' | 'width' | 'thickness' | 'material' | 'quantity';
type SortDir = 'asc' | 'desc';

const MATERIAL_COLORS: Record<string, string> = {
  plywood: 'bg-amber-100 text-amber-800',
  mdf: 'bg-stone-100 text-stone-800',
  hdhmr: 'bg-orange-100 text-orange-800',
  particle_board: 'bg-yellow-100 text-yellow-800',
  solid_wood: 'bg-emerald-100 text-emerald-800',
  marine_ply: 'bg-blue-100 text-blue-800',
  bwp_ply: 'bg-teal-100 text-teal-800',
  laminate: 'bg-purple-100 text-purple-800',
  veneer: 'bg-rose-100 text-rose-800',
  acrylic: 'bg-cyan-100 text-cyan-800',
  glass: 'bg-sky-100 text-sky-800',
};

function getMaterialColor(material: string): string {
  const key = material.toLowerCase().replace(/[\s-]+/g, '_');
  return MATERIAL_COLORS[key] || 'bg-gray-100 text-gray-800';
}

function EdgeIndicator({ edges }: { edges: CutListPanel['edgeBanding'] }) {
  return (
    <div className="flex items-center gap-0.5">
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium',
          edges.top ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/40',
        )}
        title={edges.top ? 'Top edge banded' : 'Top edge raw'}
      >
        T
      </span>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium',
          edges.bottom ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/40',
        )}
        title={edges.bottom ? 'Bottom edge banded' : 'Bottom edge raw'}
      >
        B
      </span>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium',
          edges.left ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/40',
        )}
        title={edges.left ? 'Left edge banded' : 'Left edge raw'}
      >
        L
      </span>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium',
          edges.right ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/40',
        )}
        title={edges.right ? 'Right edge banded' : 'Right edge raw'}
      >
        R
      </span>
    </div>
  );
}

function GrainIndicator({ grain }: { grain: CutListPanel['grain'] }) {
  if (grain === 'none') {
    return <span className="text-xs text-muted-foreground">--</span>;
  }
  return (
    <div
      className="flex items-center gap-1 text-xs text-muted-foreground"
      title={`Grain direction: ${grain}`}
    >
      <MoveRight
        className={cn(
          'h-3.5 w-3.5',
          grain === 'vertical' && 'rotate-90',
        )}
      />
      <span className="capitalize">{grain}</span>
    </div>
  );
}

interface CutListTableProps {
  panels: CutListPanel[];
}

export function CutListTable({ panels }: CutListTableProps) {
  const [sortField, setSortField] = useState<SortField>('partName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...panels].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'partName':
          cmp = a.partName.localeCompare(b.partName);
          break;
        case 'length':
          cmp = a.length - b.length;
          break;
        case 'width':
          cmp = a.width - b.width;
          break;
        case 'thickness':
          cmp = a.thickness - b.thickness;
          break;
        case 'material':
          cmp = a.material.localeCompare(b.material);
          break;
        case 'quantity':
          cmp = a.quantity - b.quantity;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [panels, sortField, sortDir]);

  const totalPanels = useMemo(
    () => panels.reduce((sum, p) => sum + p.quantity, 0),
    [panels],
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th
              className="cursor-pointer px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('partName')}
            >
              <span className="inline-flex items-center">
                Part Name
                <SortIcon field="partName" />
              </span>
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Furniture Unit
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('length')}
            >
              <span className="inline-flex items-center justify-end">
                Length (mm)
                <SortIcon field="length" />
              </span>
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('width')}
            >
              <span className="inline-flex items-center justify-end">
                Width (mm)
                <SortIcon field="width" />
              </span>
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('thickness')}
            >
              <span className="inline-flex items-center justify-end">
                Thick (mm)
                <SortIcon field="thickness" />
              </span>
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('material')}
            >
              <span className="inline-flex items-center">
                Material
                <SortIcon field="material" />
              </span>
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Grain</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Edge Band
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('quantity')}
            >
              <span className="inline-flex items-center justify-end">
                Qty
                <SortIcon field="quantity" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((panel) => (
            <tr key={panel.id} className="border-b hover:bg-muted/20">
              <td className="px-3 py-2 font-medium">{panel.partName}</td>
              <td className="px-3 py-2 text-muted-foreground">{panel.furnitureUnit}</td>
              <td className="px-3 py-2 text-right tabular-nums">{panel.length}</td>
              <td className="px-3 py-2 text-right tabular-nums">{panel.width}</td>
              <td className="px-3 py-2 text-right tabular-nums">{panel.thickness}</td>
              <td className="px-3 py-2">
                <Badge
                  variant="secondary"
                  className={cn('text-xs', getMaterialColor(panel.material))}
                >
                  {panel.material}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <GrainIndicator grain={panel.grain} />
              </td>
              <td className="px-3 py-2">
                <EdgeIndicator edges={panel.edgeBanding} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{panel.quantity}</td>
            </tr>
          ))}

          {/* Summary row */}
          <tr className="border-t-2 bg-muted/50 font-bold">
            <td className="px-3 py-3" colSpan={8}>
              Total: {panels.length} unique parts
            </td>
            <td className="px-3 py-3 text-right tabular-nums">{totalPanels}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface HardwareScheduleTableProps {
  items: HardwareItem[];
}

export function HardwareScheduleTable({ items }: HardwareScheduleTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hardware</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Specification
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Furniture Unit
            </th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b hover:bg-muted/20">
              <td className="px-3 py-2 font-medium">{item.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.specification}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.furnitureUnit}</td>
              <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                No hardware items.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

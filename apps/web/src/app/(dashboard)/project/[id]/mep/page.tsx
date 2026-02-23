'use client';

import { use, useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { PanelSchedule, type CircuitEntry } from '@/components/panel-schedule';
import {
  FixtureUnitTable,
  PipeSizingRecommendations,
  DrainageSlopeTable,
  type FixtureUnit,
  type PipeSizing,
  type DrainageRequirement,
} from '@/components/pipe-sizing-table';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
} from '@openlintel/ui';
import {
  Zap,
  Droplets,
  Wind,
  RefreshCw,
  Loader2,
  BookOpen,
  Thermometer,
  Gauge,
} from 'lucide-react';

interface ElectricalResult {
  panelName: string;
  mainBreakerSize: number;
  voltage: number;
  phases: number;
  circuits: CircuitEntry[];
  wireGaugeRecommendations: { circuit: string; gauge: string; reason: string }[];
  standardsCited: string[];
}

interface PlumbingResult {
  fixtures: FixtureUnit[];
  pipeSizing: PipeSizing[];
  drainage: DrainageRequirement[];
  standardsCited: string[];
}

interface HvacResult {
  coolingLoadBtu: number;
  heatingLoadBtu: number;
  equipmentSizing: {
    type: string;
    capacity: string;
    model: string;
    notes: string;
  }[];
  ductSizing: {
    section: string;
    cfm: number;
    sizeInch: string;
    velocity: number;
    type: string;
  }[];
  standardsCited: string[];
}

export default function MEPPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [selectedVariant, setSelectedVariant] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeCalcType, setActiveCalcType] = useState<string | null>(null);

  const { data: variants = [], isLoading: loadingVariants } =
    trpc.designVariant.listByProject.useQuery({ projectId });
  const { data: mepResults = [], isLoading: loadingMep } =
    trpc.mep.listByProject.useQuery({ projectId });

  const calculateMep = trpc.mep.calculate.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      toast({ title: `${activeCalcType} calculation started` });
    },
    onError: (err) => {
      toast({ title: 'Failed to start calculation', description: err.message });
    },
  });

  const { data: jobStatus } = trpc.mep.jobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: Boolean(activeJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === 'completed' || status === 'failed') return false;
        return 2000;
      },
    },
  );

  useEffect(() => {
    if (jobStatus?.status === 'completed') {
      utils.mep.listByProject.invalidate({ projectId });
      setActiveJobId(null);
      setActiveCalcType(null);
      toast({ title: 'Calculation complete' });
    } else if (jobStatus?.status === 'failed') {
      setActiveJobId(null);
      setActiveCalcType(null);
      toast({ title: 'Calculation failed', description: jobStatus.error || 'Unknown error' });
    }
  }, [jobStatus?.status, projectId, utils.mep.listByProject, jobStatus?.error]);

  const handleCalculate = (calcType: 'electrical' | 'plumbing' | 'hvac') => {
    if (!selectedVariant) {
      toast({ title: 'Please select a design variant first' });
      return;
    }
    setActiveCalcType(calcType);
    calculateMep.mutate({ designVariantId: selectedVariant, calcType });
  };

  // Parse results by type
  const electricalResults = mepResults.filter((r) => r.calcType === 'electrical');
  const plumbingResults = mepResults.filter((r) => r.calcType === 'plumbing');
  const hvacResults = mepResults.filter((r) => r.calcType === 'hvac');

  const latestElectrical = electricalResults.length > 0
    ? (electricalResults[0].result as ElectricalResult)
    : null;
  const latestPlumbing = plumbingResults.length > 0
    ? (plumbingResults[0].result as PlumbingResult)
    : null;
  const latestHvac = hvacResults.length > 0
    ? (hvacResults[0].result as HvacResult)
    : null;

  if (loadingVariants || loadingMep) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MEP Calculations</h1>
          <p className="text-sm text-muted-foreground">
            Mechanical, Electrical, and Plumbing engineering calculations.
          </p>
        </div>
        {variants.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={selectedVariant} onValueChange={setSelectedVariant}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select variant" />
              </SelectTrigger>
              <SelectContent>
                {variants.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.name} ({variant.roomName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Job progress */}
      {activeJobId && jobStatus && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Calculating {activeCalcType}...
                </span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {jobStatus.status}
              </Badge>
            </div>
            <Progress value={jobStatus.progress || 0} />
            <p className="mt-1 text-xs text-muted-foreground">
              {jobStatus.progress || 0}% complete
            </p>
          </CardContent>
        </Card>
      )}

      {variants.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Zap className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Design Variants</h2>
          <p className="text-sm text-muted-foreground">
            Create design variants in the Designs tab first. MEP calculations are performed per variant.
          </p>
        </Card>
      ) : (
        /* Tabs */
        <Tabs defaultValue="electrical">
          <TabsList className="mb-4">
            <TabsTrigger value="electrical">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Electrical
            </TabsTrigger>
            <TabsTrigger value="plumbing">
              <Droplets className="mr-1.5 h-3.5 w-3.5" />
              Plumbing
            </TabsTrigger>
            <TabsTrigger value="hvac">
              <Wind className="mr-1.5 h-3.5 w-3.5" />
              HVAC
            </TabsTrigger>
          </TabsList>

          {/* ===== ELECTRICAL TAB ===== */}
          <TabsContent value="electrical" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Electrical Calculations</h2>
                <p className="text-sm text-muted-foreground">
                  Circuit schedule, panel schedule, and wire gauge recommendations per NEC standards.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleCalculate('electrical')}
                disabled={!selectedVariant || Boolean(activeJobId)}
              >
                {activeJobId && activeCalcType === 'electrical' ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Calculate
              </Button>
            </div>

            {latestElectrical ? (
              <div className="space-y-6">
                {/* Panel schedule */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Panel Schedule</CardTitle>
                    <CardDescription>
                      Circuit distribution and load balancing
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PanelSchedule
                      panelName={latestElectrical.panelName}
                      mainBreakerSize={latestElectrical.mainBreakerSize}
                      voltage={latestElectrical.voltage}
                      phases={latestElectrical.phases}
                      circuits={latestElectrical.circuits}
                      standardsCited={latestElectrical.standardsCited}
                    />
                  </CardContent>
                </Card>

                {/* Wire gauge recommendations */}
                {latestElectrical.wireGaugeRecommendations &&
                  latestElectrical.wireGaugeRecommendations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Wire Gauge Recommendations</CardTitle>
                        <CardDescription>
                          Based on load, distance, and NEC ampacity tables
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                  Circuit
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                  Recommended Gauge
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                  Reason
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {latestElectrical.wireGaugeRecommendations.map((rec, idx) => (
                                <tr key={idx} className="border-b hover:bg-muted/20">
                                  <td className="px-3 py-2 font-medium">{rec.circuit}</td>
                                  <td className="px-3 py-2 font-mono">{rec.gauge}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{rec.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <Zap className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">
                  No electrical calculations yet. Select a design variant and click Calculate.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  <Badge variant="outline" className="text-xs">NEC 2020</Badge>
                  <Badge variant="outline" className="text-xs">NEC 210</Badge>
                  <Badge variant="outline" className="text-xs">NEC 220</Badge>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ===== PLUMBING TAB ===== */}
          <TabsContent value="plumbing" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Plumbing Calculations</h2>
                <p className="text-sm text-muted-foreground">
                  Fixture units, pipe sizing, and drainage calculations per IPC standards.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleCalculate('plumbing')}
                disabled={!selectedVariant || Boolean(activeJobId)}
              >
                {activeJobId && activeCalcType === 'plumbing' ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Calculate
              </Button>
            </div>

            {latestPlumbing ? (
              <div className="space-y-6">
                {/* Fixture unit table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Fixture Unit Summary</CardTitle>
                    <CardDescription>
                      Water supply and drainage fixture unit counts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FixtureUnitTable
                      fixtures={latestPlumbing.fixtures}
                      standardsCited={latestPlumbing.standardsCited}
                    />
                  </CardContent>
                </Card>

                {/* Pipe sizing */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pipe Sizing Recommendations</CardTitle>
                    <CardDescription>
                      Supply pipe sizing based on fixture unit demand
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PipeSizingRecommendations pipes={latestPlumbing.pipeSizing} />
                  </CardContent>
                </Card>

                {/* Drainage */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Drainage Requirements</CardTitle>
                    <CardDescription>
                      Drain pipe sizing and slope requirements
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DrainageSlopeTable drains={latestPlumbing.drainage} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <Droplets className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">
                  No plumbing calculations yet. Select a design variant and click Calculate.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  <Badge variant="outline" className="text-xs">IPC 2021</Badge>
                  <Badge variant="outline" className="text-xs">UPC</Badge>
                  <Badge variant="outline" className="text-xs">ASPE</Badge>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ===== HVAC TAB ===== */}
          <TabsContent value="hvac" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">HVAC Calculations</h2>
                <p className="text-sm text-muted-foreground">
                  Cooling/heating load, equipment sizing, and duct sizing per ASHRAE standards.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleCalculate('hvac')}
                disabled={!selectedVariant || Boolean(activeJobId)}
              >
                {activeJobId && activeCalcType === 'hvac' ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Calculate
              </Button>
            </div>

            {latestHvac ? (
              <div className="space-y-6">
                {/* Load summary */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                          <Thermometer className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cooling Load</p>
                          <p className="text-xl font-bold tabular-nums">
                            {latestHvac.coolingLoadBtu.toLocaleString()} BTU/hr
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(latestHvac.coolingLoadBtu / 12000).toFixed(1)} tons
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                          <Gauge className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Heating Load</p>
                          <p className="text-xl font-bold tabular-nums">
                            {latestHvac.heatingLoadBtu.toLocaleString()} BTU/hr
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(latestHvac.heatingLoadBtu * 0.000293071).toFixed(1)} kW
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Equipment sizing */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Equipment Sizing</CardTitle>
                    <CardDescription>
                      Recommended HVAC equipment based on load calculations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Type
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Capacity
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Model/Spec
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Notes
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestHvac.equipmentSizing.map((equip, idx) => (
                            <tr key={idx} className="border-b hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium">{equip.type}</td>
                              <td className="px-3 py-2 tabular-nums">{equip.capacity}</td>
                              <td className="px-3 py-2 text-muted-foreground">{equip.model}</td>
                              <td className="px-3 py-2 text-muted-foreground">{equip.notes}</td>
                            </tr>
                          ))}
                          {latestHvac.equipmentSizing.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                                No equipment data.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Duct sizing */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Duct Sizing</CardTitle>
                    <CardDescription>
                      Duct dimensions based on airflow requirements
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Section
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                              CFM
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Size
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                              Velocity (FPM)
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Type
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestHvac.ductSizing.map((duct, idx) => {
                            const velocityOk = duct.velocity <= 1200;
                            return (
                              <tr key={idx} className="border-b hover:bg-muted/20">
                                <td className="px-3 py-2 font-medium">{duct.section}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{duct.cfm}</td>
                                <td className="px-3 py-2 font-mono text-xs">{duct.sizeInch}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{duct.velocity}</td>
                                <td className="px-3 py-2 text-muted-foreground">{duct.type}</td>
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
                          {latestHvac.ductSizing.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                                No duct sizing data.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Standards */}
                {latestHvac.standardsCited && latestHvac.standardsCited.length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Standards Referenced
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {latestHvac.standardsCited.map((std) => (
                        <Badge key={std} variant="outline" className="text-xs">
                          {std}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <Wind className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">
                  No HVAC calculations yet. Select a design variant and click Calculate.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  <Badge variant="outline" className="text-xs">ASHRAE 90.1</Badge>
                  <Badge variant="outline" className="text-xs">ASHRAE Handbook</Badge>
                  <Badge variant="outline" className="text-xs">Manual J</Badge>
                  <Badge variant="outline" className="text-xs">Manual D</Badge>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

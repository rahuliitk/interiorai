'use client';

import { use, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
} from '@openlintel/ui';
import {
  BrainCircuit,
  IndianRupee,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Sparkles,
  Clock,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

export default function PredictionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState('cost');

  const { data: costPredictions = [], isLoading: loadingCost } =
    trpc.prediction.listCostPredictions.useQuery({ projectId });

  const { data: timelinePredictions = [], isLoading: loadingTimeline } =
    trpc.prediction.listTimelinePredictions.useQuery({ projectId });

  const predictCost = trpc.prediction.predictCost.useMutation({
    onSuccess: () => {
      utils.prediction.listCostPredictions.invalidate({ projectId });
      toast({
        title: 'Cost prediction generated',
        description: 'AI has analyzed your project and produced a new cost estimate.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Cost prediction failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const predictTimeline = trpc.prediction.predictTimeline.useMutation({
    onSuccess: () => {
      utils.prediction.listTimelinePredictions.invalidate({ projectId });
      toast({
        title: 'Timeline prediction generated',
        description: 'AI has analyzed your project and produced a new timeline estimate.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Timeline prediction failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const isLoading = loadingCost || loadingTimeline;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Predictions</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered cost estimates and timeline forecasts for your project.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-950">
                <IndianRupee className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest Cost Estimate</p>
                <p className="text-lg font-bold">
                  {costPredictions.length > 0
                    ? formatCurrency((costPredictions[0] as any).predictedCost)
                    : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-950">
                <CalendarDays className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest Timeline Estimate</p>
                <p className="text-lg font-bold">
                  {timelinePredictions.length > 0
                    ? `${(timelinePredictions[0] as any).predictedDays} days`
                    : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-950">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cost Predictions</p>
                <p className="text-lg font-bold">{costPredictions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-950">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Timeline Predictions</p>
                <p className="text-lg font-bold">{timelinePredictions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="cost">Cost Predictions</TabsTrigger>
            <TabsTrigger value="timeline">Timeline Predictions</TabsTrigger>
          </TabsList>

          {activeTab === 'cost' ? (
            <Button
              size="sm"
              onClick={() => predictCost.mutate({ projectId })}
              disabled={predictCost.isPending}
            >
              {predictCost.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              {predictCost.isPending ? 'Generating...' : 'Generate Prediction'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => predictTimeline.mutate({ projectId })}
              disabled={predictTimeline.isPending}
            >
              {predictTimeline.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              {predictTimeline.isPending ? 'Generating...' : 'Generate Prediction'}
            </Button>
          )}
        </div>

        {/* ── Cost Predictions Tab ─────────────────────────────────── */}
        <TabsContent value="cost" className="mt-0">
          {costPredictions.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <BrainCircuit className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Cost Predictions</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Generate an AI-powered cost prediction to estimate your project budget
                with confidence intervals and risk analysis.
              </p>
              <Button
                size="sm"
                onClick={() => predictCost.mutate({ projectId })}
                disabled={predictCost.isPending}
              >
                {predictCost.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Generate Cost Prediction
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {costPredictions.map((prediction: any) => (
                <Card key={prediction.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          Cost Estimate &mdash;{' '}
                          {new Date(prediction.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </CardTitle>
                        <CardDescription>
                          Model: {prediction.modelProvider || 'auto'} &middot; Generated{' '}
                          {new Date(prediction.createdAt).toLocaleTimeString()}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {prediction.modelProvider || 'auto'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Predicted cost with confidence range */}
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-950">
                            <IndianRupee className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Predicted Total Cost
                            </p>
                            <p className="text-2xl font-bold">
                              {formatCurrency(prediction.predictedCost)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium text-green-600">
                            {formatCurrency(prediction.confidenceLow)}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                          <span className="font-medium text-red-600">
                            {formatCurrency(prediction.confidenceHigh)}
                          </span>
                          <span className="text-xs">(confidence range)</span>
                        </div>
                      </div>

                      {/* Risk factors */}
                      {Array.isArray(prediction.riskFactors) &&
                        prediction.riskFactors.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                              Risk Factors
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {prediction.riskFactors.map(
                                (risk: any, idx: number) => (
                                  <Badge
                                    key={idx}
                                    variant={
                                      risk.probability > 0.6
                                        ? 'destructive'
                                        : risk.probability > 0.3
                                          ? 'default'
                                          : 'secondary'
                                    }
                                    className="text-xs"
                                  >
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    {risk.name}
                                    {risk.impact
                                      ? ` (${formatCurrency(risk.impact)})`
                                      : ''}
                                  </Badge>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {/* Cost breakdown table */}
                      {Array.isArray(prediction.breakdown) &&
                        prediction.breakdown.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                              Cost Breakdown
                            </p>
                            <div className="rounded-lg border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                      Category
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                                      Amount
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                                      % of Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prediction.breakdown.map(
                                    (item: any, idx: number) => {
                                      const pct =
                                        prediction.predictedCost > 0
                                          ? (
                                              (item.amount /
                                                prediction.predictedCost) *
                                              100
                                            ).toFixed(1)
                                          : '0.0';
                                      return (
                                        <tr
                                          key={idx}
                                          className="border-b last:border-0"
                                        >
                                          <td className="px-4 py-2">
                                            {item.category}
                                          </td>
                                          <td className="px-4 py-2 text-right font-medium">
                                            {formatCurrency(item.amount)}
                                          </td>
                                          <td className="px-4 py-2 text-right text-muted-foreground">
                                            {pct}%
                                          </td>
                                        </tr>
                                      );
                                    },
                                  )}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-muted/50 font-medium">
                                    <td className="px-4 py-2">Total</td>
                                    <td className="px-4 py-2 text-right">
                                      {formatCurrency(prediction.predictedCost)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-muted-foreground">
                                      100%
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Timeline Predictions Tab ─────────────────────────────── */}
        <TabsContent value="timeline" className="mt-0">
          {timelinePredictions.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <BrainCircuit className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Timeline Predictions</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Generate an AI-powered timeline prediction to estimate your project
                duration with phase breakdowns and risk analysis.
              </p>
              <Button
                size="sm"
                onClick={() => predictTimeline.mutate({ projectId })}
                disabled={predictTimeline.isPending}
              >
                {predictTimeline.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Generate Timeline Prediction
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {timelinePredictions.map((prediction: any) => (
                <Card key={prediction.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          Timeline Estimate &mdash;{' '}
                          {new Date(prediction.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </CardTitle>
                        <CardDescription>
                          Model: {prediction.modelProvider || 'auto'} &middot; Generated{' '}
                          {new Date(prediction.createdAt).toLocaleTimeString()}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {prediction.modelProvider || 'auto'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Predicted days with confidence range */}
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-violet-100 p-3 dark:bg-violet-950">
                            <CalendarDays className="h-6 w-6 text-violet-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Predicted Duration
                            </p>
                            <p className="text-2xl font-bold">
                              {prediction.predictedDays} days
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium text-green-600">
                            {prediction.confidenceLow} days
                          </span>
                          <ArrowRight className="h-4 w-4" />
                          <span className="font-medium text-red-600">
                            {prediction.confidenceHigh} days
                          </span>
                          <span className="text-xs">(confidence range)</span>
                        </div>
                      </div>

                      {/* Critical risks */}
                      {Array.isArray(prediction.criticalRisks) &&
                        prediction.criticalRisks.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                              Critical Risks
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {prediction.criticalRisks.map(
                                (risk: any, idx: number) => (
                                  <Card key={idx} className="border-red-100 bg-red-50/50">
                                    <CardContent className="py-3">
                                      <div className="flex items-start gap-2">
                                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                        <div>
                                          <p className="text-sm font-medium">
                                            {risk.name}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Potential delay: {risk.delayDays} days
                                          </p>
                                          {risk.mitigation && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              Mitigation: {risk.mitigation}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {/* Phase breakdown table */}
                      {Array.isArray(prediction.phaseBreakdown) &&
                        prediction.phaseBreakdown.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                              Phase Breakdown
                            </p>
                            <div className="rounded-lg border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                      Phase
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                                      Days
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                      Dependencies
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prediction.phaseBreakdown.map(
                                    (phase: any, idx: number) => (
                                      <tr
                                        key={idx}
                                        className="border-b last:border-0"
                                      >
                                        <td className="px-4 py-2">
                                          {phase.phase}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium">
                                          {phase.days}
                                        </td>
                                        <td className="px-4 py-2">
                                          {Array.isArray(phase.dependencies) &&
                                          phase.dependencies.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {phase.dependencies.map(
                                                (dep: string, depIdx: number) => (
                                                  <Badge
                                                    key={depIdx}
                                                    variant="outline"
                                                    className="text-[10px]"
                                                  >
                                                    {dep}
                                                  </Badge>
                                                ),
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">
                                              None
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-muted/50 font-medium">
                                    <td className="px-4 py-2">Total</td>
                                    <td className="px-4 py-2 text-right">
                                      {prediction.predictedDays} days
                                    </td>
                                    <td className="px-4 py-2" />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
  Separator,
  Progress,
  toast,
} from '@openlintel/ui';
import {
  Leaf,
  Loader2,
  TreePine,
  Truck,
  Award,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

function scoreColor(score: number): string {
  if (score < 40) return 'text-red-600';
  if (score < 70) return 'text-yellow-600';
  return 'text-green-600';
}

function scoreBgRing(score: number): string {
  if (score < 40) return 'border-red-500';
  if (score < 70) return 'border-yellow-500';
  return 'border-green-500';
}

function scoreBg(score: number): string {
  if (score < 40) return 'bg-red-500';
  if (score < 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface GreenAlternative {
  material: string;
  alternative: string;
  carbonSaved: number;
  costDelta: string;
}

export default function SustainabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: reports = [], isLoading } = trpc.sustainability.listReports.useQuery({
    projectId,
  });

  const generateReport = trpc.sustainability.generateReport.useMutation({
    onMutate: () => {
      setIsGenerating(true);
    },
    onSuccess: () => {
      utils.sustainability.listReports.invalidate({ projectId });
      toast({ title: 'Sustainability report generated', description: 'Your new report is ready.' });
      setIsGenerating(false);
    },
    onError: (err) => {
      toast({ title: 'Failed to generate report', description: err.message });
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    generateReport.mutate({ projectId });
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const latestReport = reports.length > 0 ? reports[0] : null;
  const olderReports = reports.length > 1 ? reports.slice(1) : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <Leaf className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sustainability</h1>
            <p className="text-sm text-muted-foreground">
              Carbon footprint analysis, LEED scoring, and green material alternatives.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Generate Report
        </Button>
      </div>

      {/* Latest report */}
      {latestReport ? (
        <div className="space-y-6">
          {/* Score gauge and carbon breakdown row */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            {/* Sustainability Score - circular gauge */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sustainability Score</CardTitle>
                <CardDescription>Overall project rating</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div
                  className={`relative flex h-32 w-32 items-center justify-center rounded-full border-8 ${scoreBgRing(latestReport.sustainabilityScore)}`}
                >
                  <div className="flex flex-col items-center">
                    <span className={`text-3xl font-bold ${scoreColor(latestReport.sustainabilityScore)}`}>
                      {latestReport.sustainabilityScore}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <Progress
                  value={latestReport.sustainabilityScore}
                  className="mt-4"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {latestReport.sustainabilityScore >= 70
                    ? 'Good sustainability profile'
                    : latestReport.sustainabilityScore >= 40
                      ? 'Room for improvement'
                      : 'Significant improvements needed'}
                </p>
              </CardContent>
            </Card>

            {/* Carbon Breakdown Cards */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TreePine className="h-4 w-4 text-green-600" />
                  Total Carbon
                </CardTitle>
                <CardDescription>Combined footprint</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {latestReport.totalCarbonKg.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">kg CO2</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Leaf className="h-4 w-4 text-emerald-600" />
                  Material Carbon
                </CardTitle>
                <CardDescription>From raw materials</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {latestReport.materialCarbonKg.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">kg CO2</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Share of total</span>
                    <span>
                      {latestReport.totalCarbonKg > 0
                        ? Math.round((latestReport.materialCarbonKg / latestReport.totalCarbonKg) * 100)
                        : 0}%
                    </span>
                  </div>
                  <Progress
                    value={
                      latestReport.totalCarbonKg > 0
                        ? (latestReport.materialCarbonKg / latestReport.totalCarbonKg) * 100
                        : 0
                    }
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4 text-blue-600" />
                  Transport Carbon
                </CardTitle>
                <CardDescription>Logistics estimate</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {latestReport.transportCarbonKg.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">kg CO2</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Share of total</span>
                    <span>
                      {latestReport.totalCarbonKg > 0
                        ? Math.round((latestReport.transportCarbonKg / latestReport.totalCarbonKg) * 100)
                        : 0}%
                    </span>
                  </div>
                  <Progress
                    value={
                      latestReport.totalCarbonKg > 0
                        ? (latestReport.transportCarbonKg / latestReport.totalCarbonKg) * 100
                        : 0
                    }
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* LEED Points */}
          {latestReport.leedPoints != null && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-4 w-4 text-amber-600" />
                  LEED Points Estimate
                </CardTitle>
                <CardDescription>
                  Estimated LEED certification points based on material choices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Badge
                    className={`px-4 py-2 text-lg font-bold ${
                      latestReport.leedPoints >= 80
                        ? 'bg-green-100 text-green-800'
                        : latestReport.leedPoints >= 60
                          ? 'bg-emerald-100 text-emerald-800'
                          : latestReport.leedPoints >= 40
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {latestReport.leedPoints} / 110
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    {latestReport.leedPoints >= 80
                      ? 'Platinum level'
                      : latestReport.leedPoints >= 60
                        ? 'Gold level'
                        : latestReport.leedPoints >= 50
                          ? 'Silver level'
                          : latestReport.leedPoints >= 40
                            ? 'Certified level'
                            : 'Below certification threshold'}
                  </div>
                </div>
                <Progress
                  value={(latestReport.leedPoints / 110) * 100}
                  className="mt-3"
                />
              </CardContent>
            </Card>
          )}

          {/* Green Alternatives */}
          {Array.isArray(latestReport.greenAlternatives) &&
            (latestReport.greenAlternatives as GreenAlternative[]).length > 0 && (
              <>
                <Separator />
                <div>
                  <h2 className="mb-4 text-lg font-semibold">Green Alternatives</h2>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Suggested material substitutions to reduce your carbon footprint.
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {(latestReport.greenAlternatives as GreenAlternative[]).map(
                      (alt, idx) => (
                        <Card key={idx}>
                          <CardContent className="pt-6">
                            <div className="flex items-center gap-2 text-sm">
                              <Badge variant="secondary">{alt.material}</Badge>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              <Badge className="bg-green-100 text-green-800">
                                {alt.alternative}
                              </Badge>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">Carbon saved</p>
                                <p className="text-sm font-semibold text-green-600">
                                  -{alt.carbonSaved} kg CO2
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Cost impact</p>
                                <p className="text-sm font-medium">{alt.costDelta}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}

          {/* Report metadata */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Generated: {formatDate(latestReport.createdAt)}
            </span>
            {latestReport.modelProvider && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                <span>Model: {latestReport.modelProvider}</span>
              </>
            )}
          </div>

          {/* History Section */}
          {olderReports.length > 0 && (
            <>
              <Separator />
              <div>
                <h2 className="mb-4 text-lg font-semibold">Report History</h2>
                <div className="space-y-3">
                  {olderReports.map((report) => (
                    <Card key={report.id}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-full border-4 ${scoreBgRing(report.sustainabilityScore)}`}
                          >
                            <span className={`text-sm font-bold ${scoreColor(report.sustainabilityScore)}`}>
                              {report.sustainabilityScore}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              Score: {report.sustainabilityScore}/100
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(report.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Total Carbon</p>
                            <p className="font-medium">{report.totalCarbonKg.toLocaleString()} kg</p>
                          </div>
                          {report.leedPoints != null && (
                            <Badge variant="secondary">
                              LEED: {report.leedPoints}
                            </Badge>
                          )}
                          <div
                            className={`h-2 w-2 rounded-full ${scoreBg(report.sustainabilityScore)}`}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Empty state */
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Leaf className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Sustainability Reports</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Generate a sustainability report to analyze your project's carbon footprint,
            estimate LEED points, and discover greener material alternatives.
          </p>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Leaf className="mr-1 h-4 w-4" />
            )}
            Generate First Report
          </Button>
        </Card>
      )}
    </div>
  );
}

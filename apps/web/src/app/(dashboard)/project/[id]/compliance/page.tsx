'use client';

import { use, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Card,
  CardContent,
  Badge,
  Skeleton,
  Progress,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@openlintel/ui';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const STATUS_ICONS = {
  pass: <CheckCircle className="h-4 w-4 text-green-600" />,
  fail: <XCircle className="h-4 w-4 text-red-600" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
  not_applicable: <Info className="h-4 w-4 text-gray-400" />,
};

const STATUS_COLORS = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  not_applicable: 'bg-gray-100 text-gray-800',
};


export default function CompliancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: report, isLoading } = trpc.compliance.checkProject.useQuery({
    projectId,
    jurisdiction: 'IN',
  });

  const toggleRoom = (roomId: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">No Compliance Data</h2>
        <p className="text-sm text-muted-foreground">
          Add rooms with dimensions to your project to run compliance checks.
        </p>
      </div>
    );
  }

  const { summary, rooms: roomReports } = report;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Compliance Report</h1>
        <p className="text-sm text-muted-foreground">
          Building code compliance check against Indian NBC 2016 standards.
        </p>
      </div>

      {/* Overall compliance score */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <Card className="col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {summary.complianceRate >= 80 ? (
                <ShieldCheck className="h-12 w-12 text-green-600" />
              ) : summary.complianceRate >= 50 ? (
                <ShieldAlert className="h-12 w-12 text-yellow-600" />
              ) : (
                <ShieldAlert className="h-12 w-12 text-red-600" />
              )}
              <div>
                <p className="text-3xl font-bold">{summary.complianceRate}%</p>
                <p className="text-sm text-muted-foreground">Compliance Rate</p>
              </div>
            </div>
            <Progress
              value={summary.complianceRate}
              className="mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-green-600">{summary.pass}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-red-600">{summary.fail}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-yellow-600">{summary.warning}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Category filter */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All Categories</TabsTrigger>
          <TabsTrigger value="room_dimensions">Dimensions</TabsTrigger>
          <TabsTrigger value="ventilation">Ventilation</TabsTrigger>
          <TabsTrigger value="fire_safety">Fire Safety</TabsTrigger>
          <TabsTrigger value="electrical">Electrical</TabsTrigger>
          <TabsTrigger value="plumbing">Plumbing</TabsTrigger>
          <TabsTrigger value="accessibility">Accessibility</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Room-by-room results */}
      <div className="space-y-3">
        {roomReports.map((room: any) => {
          const isExpanded = expandedRooms.has(room.roomId);
          const filteredResults = selectedCategory === 'all'
            ? room.results
            : room.results.filter((r: any) => r.category === selectedCategory);

          if (filteredResults.length === 0) return null;

          const roomFailCount = filteredResults.filter((r: any) => r.status === 'fail').length;
          const roomPassCount = filteredResults.filter((r: any) => r.status === 'pass').length;

          return (
            <Card key={room.roomId}>
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleRoom(room.roomId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{room.roomName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {room.roomType.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {roomFailCount > 0 && (
                    <Badge className="bg-red-100 text-red-800 text-[10px]">
                      {roomFailCount} fail
                    </Badge>
                  )}
                  {roomPassCount > 0 && (
                    <Badge className="bg-green-100 text-green-800 text-[10px]">
                      {roomPassCount} pass
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {filteredResults.length} checks
                  </Badge>
                </div>
              </div>

              {isExpanded && (
                <CardContent className="pt-0">
                  <Separator className="mb-3" />
                  <div className="space-y-2">
                    {filteredResults.map((result: any) => (
                      <div
                        key={result.ruleId}
                        className="flex items-start gap-3 rounded-lg border p-3"
                      >
                        <div className="mt-0.5">
                          {STATUS_ICONS[result.status as keyof typeof STATUS_ICONS]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{result.description}</p>
                            <Badge className={`text-[10px] ${STATUS_COLORS[result.status as keyof typeof STATUS_COLORS]}`}>
                              {result.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {result.requirement}
                          </p>
                          {result.actualValue !== undefined && result.requiredValue !== undefined && (
                            <p className="text-xs mt-1">
                              <span className="text-muted-foreground">Actual: </span>
                              <span className={result.status === 'fail' ? 'text-red-600 font-medium' : 'font-medium'}>
                                {result.actualValue} {result.unit}
                              </span>
                              <span className="text-muted-foreground"> / Required: </span>
                              <span className="font-medium">
                                {result.requiredValue} {result.unit}
                              </span>
                            </p>
                          )}
                          {typeof result.actualValue === 'string' && (
                            <p className="text-xs text-yellow-600 mt-1">
                              {result.actualValue}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Source: {result.source} - {result.clause}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {roomReports.length === 0 && (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <ShieldCheck className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Rooms to Check</h2>
          <p className="text-sm text-muted-foreground">
            Add rooms with dimensions to start compliance checking.
          </p>
        </Card>
      )}
    </div>
  );
}

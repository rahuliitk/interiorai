'use client';

import { trpc } from '@/lib/trpc/client';
import {
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
  Progress,
} from '@openlintel/ui';
import {
  Server,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@openlintel/ui';

interface InfraService {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latencyMs?: number;
  version?: string;
  uptime?: string;
}

interface Microservice {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  port: number;
  replicas?: number;
  cpuPercent?: number;
  memoryMb?: number;
}

interface StorageMetrics {
  totalGb: number;
  usedGb: number;
  label: string;
}

const INFRASTRUCTURE_SERVICES = ['PostgreSQL', 'Redis', 'MinIO', 'Meilisearch'];

const MICROSERVICES = [
  { name: 'media-service', port: 8001 },
  { name: 'design-engine', port: 8000 },
  { name: 'bom-engine', port: 8002 },
  { name: 'drawing-generator', port: 8003 },
  { name: 'cutlist-engine', port: 8004 },
  { name: 'mep-calculator', port: 8005 },
  { name: 'catalogue-service', port: 8006 },
  { name: 'project-service', port: 8007 },
  { name: 'procurement-service', port: 8008 },
  { name: 'collaboration', port: 8009 },
];

export default function AdminSystemPage() {
  const {
    data: systemHealth,
    isLoading: loadingHealth,
    refetch: refetchHealth,
  } = trpc.admin.getSystemHealth.useQuery(undefined, {
    retry: false,
    refetchInterval: 30000,
  });

  const {
    data: resourceUsage,
    isLoading: loadingResources,
    refetch: refetchResources,
  } = trpc.admin.getResourceUsage.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const handleRefresh = () => {
    refetchHealth();
    refetchResources();
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'running':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'down':
      case 'stopped':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const statusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'healthy':
      case 'running':
        return 'default';
      case 'degraded':
        return 'secondary';
      case 'down':
      case 'stopped':
      case 'error':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const infraServices: InfraService[] = systemHealth?.infrastructure ?? [];
  const microservices: Microservice[] = systemHealth?.microservices ?? [];
  const storage: StorageMetrics[] = resourceUsage?.storage ?? [];
  const cpuPercent: number = resourceUsage?.cpuPercent ?? 0;
  const memoryPercent: number = resourceUsage?.memoryPercent ?? 0;
  const memoryUsedGb: number = resourceUsage?.memoryUsedGb ?? 0;
  const memoryTotalGb: number = resourceUsage?.memoryTotalGb ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground">
            Infrastructure, services, and resource monitoring
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="infrastructure">
        <TabsList className="mb-6">
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          <TabsTrigger value="microservices">Microservices</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        {/* Infrastructure Tab */}
        <TabsContent value="infrastructure">
          <div className="grid gap-4 sm:grid-cols-2">
            {loadingHealth ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20" />
                  </CardContent>
                </Card>
              ))
            ) : infraServices.length > 0 ? (
              infraServices.map((service) => (
                <Card key={service.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="h-4 w-4" />
                        {service.name}
                      </CardTitle>
                      <Badge variant={statusBadgeVariant(service.status)}>
                        {service.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <div className="flex items-center gap-1">
                          {statusIcon(service.status)}
                          <span className="capitalize">{service.status}</span>
                        </div>
                      </div>
                      {service.latencyMs !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Latency</span>
                          <span>{service.latencyMs}ms</span>
                        </div>
                      )}
                      {service.version && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Version</span>
                          <span>{service.version}</span>
                        </div>
                      )}
                      {service.uptime && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Uptime</span>
                          <span>{service.uptime}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              // Placeholder cards for infrastructure services
              INFRASTRUCTURE_SERVICES.map((name) => (
                <Card key={name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="h-4 w-4" />
                        {name}
                      </CardTitle>
                      <Badge variant="outline">unknown</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Connect the admin.getSystemHealth tRPC route to display live status.
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Microservices Tab */}
        <TabsContent value="microservices">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" />
                Microservices
              </CardTitle>
              <CardDescription>
                Status of all backend services
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHealth ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Service
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Port
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Replicas
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          CPU %
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Memory (MB)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(microservices.length > 0 ? microservices : MICROSERVICES.map((s) => ({
                        ...s,
                        status: 'unknown' as const,
                        replicas: 0,
                        cpuPercent: 0,
                        memoryMb: 0,
                      }))).map((service) => (
                        <tr
                          key={service.name}
                          className="border-b last:border-0 hover:bg-muted/50"
                        >
                          <td className="px-3 py-3 font-medium">{service.name}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              {statusIcon(service.status)}
                              <Badge
                                variant={statusBadgeVariant(service.status)}
                                className="text-xs"
                              >
                                {service.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            :{service.port}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {service.replicas ?? '—'}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {service.cpuPercent !== undefined
                              ? `${service.cpuPercent}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {service.memoryMb !== undefined
                              ? `${service.memoryMb} MB`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* CPU Usage */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4" />
                  CPU Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingResources ? (
                  <Skeleton className="h-20" />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">{cpuPercent}%</span>
                      <Badge
                        variant={
                          cpuPercent > 90
                            ? 'destructive'
                            : cpuPercent > 70
                              ? 'secondary'
                              : 'default'
                        }
                      >
                        {cpuPercent > 90 ? 'Critical' : cpuPercent > 70 ? 'High' : 'Normal'}
                      </Badge>
                    </div>
                    <Progress value={cpuPercent} className="h-3" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Memory Usage */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MemoryStick className="h-4 w-4" />
                  Memory Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingResources ? (
                  <Skeleton className="h-20" />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">{memoryPercent}%</span>
                      <span className="text-sm text-muted-foreground">
                        {memoryUsedGb} / {memoryTotalGb} GB
                      </span>
                    </div>
                    <Progress value={memoryPercent} className="h-3" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Storage Usage */}
            {storage.length > 0 ? (
              storage.map((vol) => (
                <Card key={vol.label}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HardDrive className="h-4 w-4" />
                      {vol.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">
                          {Math.round((vol.usedGb / vol.totalGb) * 100)}%
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {vol.usedGb} / {vol.totalGb} GB
                        </span>
                      </div>
                      <Progress
                        value={Math.round((vol.usedGb / vol.totalGb) * 100)}
                        className="h-3"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HardDrive className="h-4 w-4" />
                      PostgreSQL Storage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Connect admin.getResourceUsage to display storage metrics.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HardDrive className="h-4 w-4" />
                      MinIO Object Storage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Connect admin.getResourceUsage to display storage metrics.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

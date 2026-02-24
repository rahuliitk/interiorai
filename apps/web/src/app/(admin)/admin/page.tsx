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
} from '@openlintel/ui';
import {
  Users,
  FolderKanban,
  ListTodo,
  Activity,
  Server,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface StatCard {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: string;
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading: loadingStats } = trpc.admin.getStats.useQuery(undefined, {
    retry: false,
  });
  const { data: recentActivity, isLoading: loadingActivity } = trpc.admin.getRecentActivity.useQuery(
    undefined,
    { retry: false },
  );
  const { data: systemHealth, isLoading: loadingHealth } = trpc.admin.getSystemHealth.useQuery(
    undefined,
    { retry: false, refetchInterval: 30000 },
  );

  const statCards: StatCard[] = [
    {
      title: 'Total Users',
      value: stats?.totalUsers ?? 0,
      description: `${stats?.newUsersThisWeek ?? 0} new this week`,
      icon: Users,
      trend: stats?.userGrowthPercent ? `+${stats.userGrowthPercent}%` : undefined,
    },
    {
      title: 'Active Projects',
      value: stats?.activeProjects ?? 0,
      description: `${stats?.totalProjects ?? 0} total projects`,
      icon: FolderKanban,
    },
    {
      title: 'Running Jobs',
      value: stats?.runningJobs ?? 0,
      description: `${stats?.queuedJobs ?? 0} in queue`,
      icon: ListTodo,
    },
    {
      title: 'System Health',
      value: systemHealth?.overallStatus === 'healthy' ? 'Healthy' : systemHealth?.overallStatus === 'degraded' ? 'Degraded' : 'Unknown',
      description: `${systemHealth?.servicesUp ?? 0}/${systemHealth?.totalServices ?? 0} services up`,
      icon: Activity,
    },
  ];

  const healthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'default';
      case 'degraded':
        return 'secondary';
      case 'down':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const healthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return CheckCircle2;
      case 'degraded':
        return AlertTriangle;
      case 'down':
        return XCircle;
      default:
        return Clock;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          System overview and platform metrics
        </p>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingStats || loadingHealth ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stat.value}</span>
                  {stat.trend && (
                    <span className="flex items-center text-xs text-green-600">
                      <TrendingUp className="mr-0.5 h-3 w-3" />
                      {stat.trend}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              System Health
            </CardTitle>
            <CardDescription>Infrastructure and service status</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHealth ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(systemHealth?.services ?? []).map((service: { name: string; status: string; latencyMs?: number }) => {
                  const StatusIcon = healthStatusIcon(service.status);
                  return (
                    <div
                      key={service.name}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon
                          className={`h-4 w-4 ${
                            service.status === 'healthy'
                              ? 'text-green-500'
                              : service.status === 'degraded'
                                ? 'text-yellow-500'
                                : 'text-red-500'
                          }`}
                        />
                        <span className="text-sm font-medium">{service.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {service.latencyMs !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {service.latencyMs}ms
                          </span>
                        )}
                        <Badge variant={healthStatusColor(service.status) as 'default' | 'secondary' | 'destructive' | 'outline'}>
                          {service.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {(!systemHealth?.services || systemHealth.services.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No health data available. Connect the admin.getSystemHealth tRPC route.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest platform events</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(recentActivity ?? []).map((event: { id: string; type: string; description: string; userName: string; createdAt: string }) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {event.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate">
                          {event.userName}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground truncate">
                        {event.description}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {(!recentActivity || recentActivity.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent activity. Connect the admin.getRecentActivity tRPC route.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

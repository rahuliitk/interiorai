'use client';

import { use, useState, useMemo } from 'react';
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
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  toast,
} from '@openlintel/ui';
import {
  ClipboardList,
  Plus,
  Calendar,
  Cloud,
  Users,
  ImageIcon,
  Tag,
  Filter,
} from 'lucide-react';
import { SiteLogForm } from '@/components/site-log-form';
import { ChangeOrderDialog } from '@/components/change-order-dialog';

export default function SiteLogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: siteLogs = [], isLoading } = trpc.schedule.listSiteLogs.useQuery({ projectId });

  const createSiteLog = trpc.schedule.createSiteLog.useMutation({
    onSuccess: () => {
      utils.schedule.listSiteLogs.invalidate({ projectId });
      setOpen(false);
      toast({ title: 'Site log created' });
    },
    onError: () => {
      toast({ title: 'Failed to create site log', variant: 'destructive' });
    },
  });

  const filteredLogs = useMemo(() => {
    let logs = siteLogs;
    if (dateFrom) {
      const from = new Date(dateFrom);
      logs = logs.filter((log: any) => new Date(log.date as string) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      logs = logs.filter((log: any) => new Date(log.date as string) <= to);
    }
    return logs;
  }, [siteLogs, dateFrom, dateTo]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site Logs</h1>
          <p className="text-sm text-muted-foreground">
            {siteLogs.length} log entr{siteLogs.length !== 1 ? 'ies' : 'y'} recorded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChangeOrderDialog projectId={projectId} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                New Log Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Site Log</DialogTitle>
                <DialogDescription>Record daily construction site activity.</DialogDescription>
              </DialogHeader>
              <SiteLogForm
                onSubmit={(data) => {
                  createSiteLog.mutate({
                    projectId,
                    date: data.date,
                    title: data.title,
                    notes: data.notes || undefined,
                    weather: data.weather || undefined,
                    workersOnSite: data.workersOnSite || undefined,
                    photoKeys: data.photoKeys.length > 0 ? data.photoKeys : undefined,
                    tags: data.tags.length > 0 ? data.tags : undefined,
                  });
                }}
                isPending={createSiteLog.isPending}
                onCancel={() => setOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date range filter */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Label htmlFor="date-from" className="text-xs">From</Label>
              <Input
                id="date-from"
                type="date"
                className="h-8 w-40"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="date-to" className="text-xs">To</Label>
              <Input
                id="date-to"
                type="date"
                className="h-8 w-40"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Showing {filteredLogs.length} of {siteLogs.length} entries
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Logs list */}
      {filteredLogs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">
            {siteLogs.length === 0 ? 'No Site Logs' : 'No Logs in Range'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {siteLogs.length === 0
              ? 'Start recording daily construction activity with site log entries.'
              : 'Adjust the date filter to see more entries.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log: any) => (
            <Card key={log.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{log.title}</CardTitle>
                    <CardDescription className="flex items-center gap-3 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(log.date as string).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {log.weather && (
                        <span className="inline-flex items-center gap-1">
                          <Cloud className="h-3 w-3" />
                          {log.weather}
                        </span>
                      )}
                      {log.workersOnSite != null && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {log.workersOnSite} workers
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {log.notes && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">
                    {log.notes}
                  </p>
                )}

                {/* Photo gallery */}
                {log.photoKeys && (log.photoKeys as string[]).length > 0 && (
                  <div className="mb-3">
                    <div className="flex gap-2 overflow-x-auto">
                      {(log.photoKeys as string[]).map((key, idx) => (
                        <div
                          key={idx}
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted"
                        >
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {log.tags && (log.tags as string[]).length > 0 && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <div className="flex flex-wrap gap-1">
                      {(log.tags as string[]).map((tag: any) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

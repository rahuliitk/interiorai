'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Textarea,
  Badge,
  toast,
} from '@openlintel/ui';
import { trpc } from '@/lib/trpc/client';
import { Plus, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface ChangeOrderDialogProps {
  projectId: string;
  trigger?: React.ReactNode;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending Review' },
  approved: { icon: CheckCircle2, color: 'text-green-500', label: 'Approved' },
  rejected: { icon: XCircle, color: 'text-red-500', label: 'Rejected' },
};

export function ChangeOrderDialog({ projectId, trigger }: ChangeOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [costImpact, setCostImpact] = useState('');
  const [timeImpactDays, setTimeImpactDays] = useState('');

  const utils = trpc.useUtils();

  const { data: changeOrders = [] } = trpc.schedule.listChangeOrders.useQuery({ projectId });

  const createChangeOrder = trpc.schedule.createChangeOrder.useMutation({
    onSuccess: () => {
      utils.schedule.listChangeOrders.invalidate({ projectId });
      setOpen(false);
      setTitle('');
      setDescription('');
      setCostImpact('');
      setTimeImpactDays('');
      toast({ title: 'Change order created' });
    },
    onError: () => {
      toast({ title: 'Failed to create change order', variant: 'destructive' });
    },
  });

  const updateChangeOrder = trpc.schedule.updateChangeOrder.useMutation({
    onSuccess: () => {
      utils.schedule.listChangeOrders.invalidate({ projectId });
      toast({ title: 'Change order updated' });
    },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    createChangeOrder.mutate({
      projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      costImpact: costImpact ? parseFloat(costImpact) : undefined,
      timeImpactDays: timeImpactDays ? parseInt(timeImpactDays, 10) : undefined,
    });
  };

  return (
    <div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-4 w-4" />
              New Change Order
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Change Order</DialogTitle>
            <DialogDescription>
              Document scope changes with cost and time impact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="co-title">Title</Label>
              <Input
                id="co-title"
                placeholder="e.g. Additional electrical points in master bedroom"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-description">Description</Label>
              <Textarea
                id="co-description"
                placeholder="Describe the change and its justification..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="co-cost">Cost Impact ($)</Label>
                <Input
                  id="co-cost"
                  type="number"
                  placeholder="0.00"
                  value={costImpact}
                  onChange={(e) => setCostImpact(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-time">Time Impact (days)</Label>
                <Input
                  id="co-time"
                  type="number"
                  placeholder="0"
                  value={timeImpactDays}
                  onChange={(e) => setTimeImpactDays(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createChangeOrder.isPending || !title.trim()}
            >
              {createChangeOrder.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing change orders list */}
      {changeOrders.length > 0 && (
        <div className="mt-4 space-y-2">
          {changeOrders.map((order) => {
            const config = STATUS_CONFIG[order.status as string] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;
            return (
              <div
                key={order.id}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div className="flex gap-3">
                  <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
                  <div>
                    <p className="text-sm font-medium">{order.title}</p>
                    {order.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{order.description}</p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      {order.costImpact != null && (
                        <span>Cost: ${Number(order.costImpact).toLocaleString()}</span>
                      )}
                      {order.timeImpactDays != null && (
                        <span>Time: +{order.timeImpactDays} days</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {config.label}
                  </Badge>
                  {order.status === 'pending' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                        onClick={() =>
                          updateChangeOrder.mutate({ id: order.id, status: 'approved' })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                        onClick={() =>
                          updateChangeOrder.mutate({ id: order.id, status: 'rejected' })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

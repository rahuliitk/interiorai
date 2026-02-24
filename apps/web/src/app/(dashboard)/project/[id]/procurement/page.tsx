'use client';

import { use, useState, useEffect } from 'react';
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
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
  Separator,
  toast,
} from '@openlintel/ui';
import {
  ShoppingCart,
  Package,
  Truck,
  FileText,
  Loader2,
  CheckCircle,
  Clock,
  ChevronRight,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function ProcurementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data: bomResults = [], isLoading: loadingBom } =
    trpc.bom.listByProject.useQuery({ projectId });
  const { data: orders = [], isLoading: loadingOrders } =
    trpc.procurement.listOrders.useQuery({ projectId });

  const generateOrders = trpc.procurement.generateOrders.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job!.id);
      setGenerateOpen(false);
      toast({ title: 'Order generation started' });
    },
    onError: (err) => {
      toast({ title: 'Failed to generate orders', description: err.message });
    },
  });

  const syncResults = trpc.procurement.syncOrderResults.useMutation({
    onSuccess: (result) => {
      if (result.synced) {
        utils.procurement.listOrders.invalidate({ projectId });
        toast({ title: `${result.count || 0} purchase orders created` });
      }
    },
  });

  const updateStatus = trpc.procurement.updateOrderStatus.useMutation({
    onSuccess: () => {
      utils.procurement.listOrders.invalidate({ projectId });
      toast({ title: 'Order status updated' });
    },
  });

  const { data: jobStatus } = trpc.procurement.jobStatus.useQuery(
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
    if (jobStatus?.status === 'completed' && activeJobId) {
      syncResults.mutate({ jobId: activeJobId, projectId });
      setActiveJobId(null);
    } else if (jobStatus?.status === 'failed') {
      setActiveJobId(null);
      toast({ title: 'Order generation failed', description: jobStatus.error || 'Unknown error' });
    }
  }, [jobStatus?.status, activeJobId, projectId, syncResults, jobStatus?.error]);

  const handleGenerate = () => {
    if (!selectedBom) return;
    generateOrders.mutate({ projectId, bomResultId: selectedBom });
  };

  const selectedOrder: any = orders.find((o: any) => o.id === selectedOrderId);

  const totalValue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const deliveredCount = orders.filter((o: any) => o.status === 'delivered').length;
  const pendingCount = orders.filter((o: any) => !['delivered', 'cancelled'].includes(o.status)).length;

  if (loadingBom || loadingOrders) {
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
          <h1 className="text-2xl font-bold tracking-tight">Procurement</h1>
          <p className="text-sm text-muted-foreground">
            Purchase orders, vendor assignments, and delivery tracking.
          </p>
        </div>
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={bomResults.length === 0 || Boolean(activeJobId)}>
              {activeJobId ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="mr-1 h-4 w-4" />
              )}
              Generate Orders
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Purchase Orders</DialogTitle>
              <DialogDescription>
                Select a BOM result to automatically generate optimized purchase orders
                with vendor assignments and delivery phasing.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select value={selectedBom} onValueChange={setSelectedBom}>
                <SelectTrigger>
                  <SelectValue placeholder="Select BOM result" />
                </SelectTrigger>
                <SelectContent>
                  {bomResults.map((bom: any) => (
                    <SelectItem key={bom.id} value={bom.id}>
                      BOM - {new Date(bom.createdAt).toLocaleDateString()} (
                      {bom.currency} {(bom.totalCost || 0).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateOrders.isPending || !selectedBom}
              >
                {generateOrders.isPending ? 'Starting...' : 'Generate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Job progress */}
      {activeJobId && jobStatus && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating purchase orders...</span>
              </div>
              <Badge variant="secondary" className="text-xs">{jobStatus.status}</Badge>
            </div>
            <Progress value={jobStatus.progress || 0} />
            <p className="mt-1 text-xs text-muted-foreground">
              {jobStatus.progress || 0}% complete
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {orders.length > 0 && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{orders.length}</p>
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">
                    {(totalValue).toLocaleString('en-IN', { style: 'currency', currency: orders[0]?.currency || 'INR', maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Value</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{deliveredCount}</p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Orders list + detail split view */}
      {orders.length > 0 ? (
        <div className="flex gap-4">
          {/* Order list */}
          <div className="w-1/2 space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">PURCHASE ORDERS</h2>
            {orders.map((order: any) => (
              <Card
                key={order.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedOrderId === order.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {(order.vendor as any)?.name || 'Unassigned Vendor'}
                        </p>
                        <Badge className={`text-[10px] ${STATUS_COLORS[order.status] || ''}`}>
                          {order.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(order.items as any[])?.length || 0} items &middot;{' '}
                        {(order.totalAmount || 0).toLocaleString('en-IN', {
                          style: 'currency',
                          currency: order.currency || 'INR',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Order detail */}
          <div className="w-1/2">
            {selectedOrder ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {(selectedOrder.vendor as any)?.name || 'Purchase Order'}
                    </CardTitle>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={(status) =>
                        updateStatus.mutate({
                          id: selectedOrder.id,
                          status: status as any,
                        })
                      }
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(
                          (s) => (
                            <SelectItem key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <CardDescription>
                    Created {new Date(selectedOrder.createdAt).toLocaleDateString()}
                    {selectedOrder.expectedDelivery && (
                      <> &middot; Expected: {new Date(selectedOrder.expectedDelivery).toLocaleDateString()}</>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Vendor info */}
                    {selectedOrder.vendor && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Vendor</p>
                        <p className="text-sm font-medium">{(selectedOrder.vendor as any).name}</p>
                        {(selectedOrder.vendor as any).city && (
                          <p className="text-xs text-muted-foreground">{(selectedOrder.vendor as any).city}</p>
                        )}
                        {(selectedOrder.vendor as any).contactEmail && (
                          <p className="text-xs text-muted-foreground">{(selectedOrder.vendor as any).contactEmail}</p>
                        )}
                      </div>
                    )}

                    <Separator />

                    {/* Items table */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">LINE ITEMS</p>
                      <div className="space-y-1">
                        {((selectedOrder.items as any[]) || []).map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-md border p-2"
                          >
                            <div>
                              <p className="text-sm">{item.name || item.productId || `Item ${idx + 1}`}</p>
                              <p className="text-xs text-muted-foreground">
                                Qty: {item.quantity} &middot; Unit: {(item.unitPrice || item.unit_price || 0).toLocaleString('en-IN', {
                                  style: 'currency',
                                  currency: selectedOrder.currency || 'INR',
                                  maximumFractionDigits: 0,
                                })}
                              </p>
                            </div>
                            <p className="text-sm font-medium">
                              {((item.quantity || 1) * (item.unitPrice || item.unit_price || 0)).toLocaleString('en-IN', {
                                style: 'currency',
                                currency: selectedOrder.currency || 'INR',
                                maximumFractionDigits: 0,
                              })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Total */}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Total</p>
                      <p className="text-lg font-bold">
                        {(selectedOrder.totalAmount || 0).toLocaleString('en-IN', {
                          style: 'currency',
                          currency: selectedOrder.currency || 'INR',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>

                    {selectedOrder.notes && (
                      <p className="text-xs text-muted-foreground italic">{selectedOrder.notes}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex items-center justify-center p-12 text-center">
                <div>
                  <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Select an order to view details
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      ) : (
        /* Empty state */
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Truck className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Purchase Orders</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {bomResults.length > 0
              ? 'Generate purchase orders from your Bill of Materials to start procurement.'
              : 'Generate a BOM first from the Designs tab, then create purchase orders.'}
          </p>
          {bomResults.length > 0 && (
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <ShoppingCart className="mr-1 h-4 w-4" />
              Generate Orders
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

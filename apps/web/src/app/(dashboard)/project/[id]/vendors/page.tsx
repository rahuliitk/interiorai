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
  CardFooter,
  Badge,
  Skeleton,
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
  toast,
} from '@openlintel/ui';
import {
  Building2,
  Plus,
  Loader2,
  Star,
  Package,
  TrendingUp,
  Truck,
  Mail,
  Phone,
  Globe,
  MapPin,
  ChevronDown,
  ChevronUp,
  Users,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Clock,
  Edit,
  BarChart3,
} from 'lucide-react';

/* ── Status badge config ───────────────────────────────────── */
const ORDER_STATUS_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  pending:   { bg: 'bg-gray-100 text-gray-700',   icon: <Clock className="h-3 w-3" /> },
  ordered:   { bg: 'bg-blue-100 text-blue-700',   icon: <ShoppingCart className="h-3 w-3" /> },
  shipped:   { bg: 'bg-amber-100 text-amber-700', icon: <Truck className="h-3 w-3" /> },
  delivered: { bg: 'bg-green-100 text-green-700',  icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { bg: 'bg-red-100 text-red-700',     icon: <XCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const style = ORDER_STATUS_STYLES[status] ?? ORDER_STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg}`}>
      {style.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ── Star rating display ───────────────────────────────────── */
function RatingStars({ rating }: { rating: number | null | undefined }) {
  const value = rating ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < Math.round(value)
              ? 'fill-amber-400 text-amber-400'
              : 'fill-gray-200 text-gray-200'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{value.toFixed(1)}</span>
    </div>
  );
}

/* ── Format currency ───────────────────────────────────────── */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ── Main page component ───────────────────────────────────── */
export default function VendorManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  /* ── State ─────────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
  });
  const [editData, setEditData] = useState<{
    id: string;
    name: string;
    contactEmail: string;
    contactPhone: string;
    address: string;
    website: string;
  }>({ id: '', name: '', contactEmail: '', contactPhone: '', address: '', website: '' });

  /* ── Queries ───────────────────────────────────────────── */
  const vendorsQuery = trpc.vendorManagement.listVendors.useQuery({ projectId });
  const performanceQuery = trpc.vendorManagement.vendorPerformance.useQuery({ projectId });
  const ordersQuery = trpc.vendorManagement.listVendorOrders.useQuery(
    { projectId, vendorId: expandedVendor ?? undefined },
    { enabled: !!expandedVendor },
  );

  /* ── Mutations ─────────────────────────────────────────── */
  const createMutation = trpc.vendorManagement.createVendor.useMutation({
    onSuccess: () => {
      toast.success('Vendor created successfully');
      utils.vendorManagement.invalidate();
      setCreateOpen(false);
      setFormData({ name: '', contactEmail: '', contactPhone: '', address: '', website: '' });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.vendorManagement.updateVendor.useMutation({
    onSuccess: () => {
      toast.success('Vendor updated successfully');
      utils.vendorManagement.invalidate();
      setEditOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  /* ── Derived data ──────────────────────────────────────── */
  const performance = performanceQuery.data ?? [];
  const vendorList = vendorsQuery.data ?? [];

  const dashboardStats = useMemo(() => {
    const totalVendors = vendorList.length;
    const totalOrders = performance.reduce((sum, v) => sum + v.totalOrders, 0);
    const totalDelivered = performance.reduce((sum, v) => sum + v.delivered, 0);
    const deliveryRate = totalOrders > 0 ? Math.round((totalDelivered / totalOrders) * 100) : 0;
    const totalSpend = performance.reduce((sum, v) => sum + v.totalAmount, 0);
    return { totalVendors, totalOrders, deliveryRate, totalSpend };
  }, [vendorList, performance]);

  /* ── Performance map for vendor cards ──────────────────── */
  const perfMap = useMemo(() => {
    const map: Record<string, (typeof performance)[0]> = {};
    performance.forEach((p) => { map[p.id] = p; });
    return map;
  }, [performance]);

  /* ── Handlers ──────────────────────────────────────────── */
  function handleCreate() {
    if (!formData.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      contactEmail: formData.contactEmail || undefined,
      contactPhone: formData.contactPhone || undefined,
      address: formData.address || undefined,
      website: formData.website || undefined,
    });
  }

  function handleUpdate() {
    updateMutation.mutate({
      id: editData.id,
      name: editData.name || undefined,
      contactEmail: editData.contactEmail || undefined,
      contactPhone: editData.contactPhone || undefined,
      address: editData.address || undefined,
      website: editData.website || undefined,
    });
  }

  function openEdit(vendor: any) {
    setEditData({
      id: vendor.id,
      name: vendor.name ?? '',
      contactEmail: vendor.contactEmail ?? '',
      contactPhone: vendor.contactPhone ?? '',
      address: vendor.address ?? '',
      website: vendor.website ?? '',
    });
    setEditOpen(true);
  }

  function toggleExpand(vendorId: string) {
    setExpandedVendor((prev) => (prev === vendorId ? null : vendorId));
  }

  /* ── Loading state ─────────────────────────────────────── */
  if (vendorsQuery.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Vendor Management</h1>
            <p className="text-muted-foreground">Loading vendor data...</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Main render ───────────────────────────────────────── */
  return (
    <div className="space-y-6 p-6">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Vendor Management</h1>
            <p className="text-muted-foreground">
              Track vendors, purchase orders, and performance metrics
            </p>
          </div>
        </div>

        {/* Create Vendor Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
              <DialogDescription>
                Enter the vendor details below. Only the name is required.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="vendor-name">Vendor Name *</Label>
                <Input
                  id="vendor-name"
                  placeholder="e.g. Acme Building Supplies"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="vendor-email">Email</Label>
                  <Input
                    id="vendor-email"
                    type="email"
                    placeholder="contact@vendor.com"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData((p) => ({ ...p, contactEmail: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vendor-phone">Phone</Label>
                  <Input
                    id="vendor-phone"
                    placeholder="+1 (555) 000-0000"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData((p) => ({ ...p, contactPhone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vendor-address">Address</Label>
                <Input
                  id="vendor-address"
                  placeholder="123 Main St, City, State"
                  value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vendor-website">Website</Label>
                <Input
                  id="vendor-website"
                  placeholder="https://vendor.com"
                  value={formData.website}
                  onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Performance Dashboard ────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Vendors
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalVendors}</div>
            <p className="text-xs text-muted-foreground">Active vendor relationships</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Orders
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalOrders}</div>
            <p className="text-xs text-muted-foreground">Purchase orders this project</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivery Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.deliveryRate}%</div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${dashboardStats.deliveryRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spend
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalSpend)}</div>
            <p className="text-xs text-muted-foreground">Across all vendor orders</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Vendor Performance Table ─────────────────────── */}
      {performance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Vendor Performance Summary
            </CardTitle>
            <CardDescription>
              Order statistics and delivery performance per vendor for this project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Vendor</th>
                    <th className="pb-3 pr-4 font-medium text-center">Orders</th>
                    <th className="pb-3 pr-4 font-medium text-center">Delivered</th>
                    <th className="pb-3 pr-4 font-medium text-center">Pending</th>
                    <th className="pb-3 pr-4 font-medium text-right">Amount</th>
                    <th className="pb-3 font-medium text-right">Delivery Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((p) => {
                    const rate = p.totalOrders > 0 ? Math.round((p.delivered / p.totalOrders) * 100) : 0;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{p.name}</td>
                        <td className="py-3 pr-4 text-center">{p.totalOrders}</td>
                        <td className="py-3 pr-4 text-center">
                          <span className="text-green-600">{p.delivered}</span>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className="text-amber-600">{p.pending}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">{formatCurrency(p.totalAmount)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-16 rounded-full bg-gray-100">
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs font-medium">{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Vendor List ──────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">All Vendors ({vendorList.length})</h2>

        {vendorList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="mb-1 text-lg font-medium">No vendors yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Add your first vendor to start tracking purchase orders and performance.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Vendor
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vendorList.map((vendor: any) => {
              const perf = perfMap[vendor.id];
              const isExpanded = expandedVendor === vendor.id;
              const rate =
                perf && perf.totalOrders > 0
                  ? Math.round((perf.delivered / perf.totalOrders) * 100)
                  : null;

              return (
                <Card key={vendor.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">{vendor.name}</CardTitle>
                        <RatingStars rating={vendor.rating} />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(vendor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-3 text-sm">
                    {/* Contact info */}
                    <div className="space-y-1.5">
                      {vendor.contactEmail && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{vendor.contactEmail}</span>
                        </div>
                      )}
                      {vendor.contactPhone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{vendor.contactPhone}</span>
                        </div>
                      )}
                      {vendor.address && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{vendor.address}</span>
                        </div>
                      )}
                      {vendor.website && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="h-3.5 w-3.5" />
                          <a
                            href={vendor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {vendor.website}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Order stats */}
                    {perf && (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-lg font-semibold">{perf.totalOrders}</div>
                            <div className="text-xs text-muted-foreground">Orders</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold text-green-600">
                              {perf.delivered}
                            </div>
                            <div className="text-xs text-muted-foreground">Delivered</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold">
                              {formatCurrency(perf.totalAmount)}
                            </div>
                            <div className="text-xs text-muted-foreground">Total</div>
                          </div>
                        </div>
                        {rate !== null && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Delivery Rate</span>
                              <span className="font-medium">{rate}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  rate >= 80
                                    ? 'bg-green-500'
                                    : rate >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expanded order history */}
                    {isExpanded && (
                      <div className="space-y-2 border-t pt-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Order History
                        </h4>
                        {ordersQuery.isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (ordersQuery.data ?? []).length === 0 ? (
                          <p className="py-2 text-center text-xs text-muted-foreground">
                            No orders found for this vendor in this project.
                          </p>
                        ) : (
                          <div className="max-h-48 space-y-2 overflow-y-auto">
                            {(ordersQuery.data ?? []).map((order: any) => (
                              <div
                                key={order.id}
                                className="flex items-center justify-between rounded-md border px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium">
                                    {order.orderNumber ?? order.id.slice(0, 8)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {order.createdAt
                                      ? new Date(order.createdAt).toLocaleDateString()
                                      : 'N/A'}
                                  </div>
                                </div>
                                <div className="ml-2 flex items-center gap-2">
                                  {(order as any).totalAmount != null && (
                                    <span className="text-xs font-medium">
                                      {formatCurrency((order as any).totalAmount)}
                                    </span>
                                  )}
                                  <StatusBadge status={order.status ?? 'pending'} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="border-t pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => toggleExpand(vendor.id)}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="mr-2 h-4 w-4" />
                          Hide Orders
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-2 h-4 w-4" />
                          View Orders
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit Vendor Dialog ────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
            <DialogDescription>
              Update the vendor information below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Vendor Name</Label>
              <Input
                id="edit-name"
                value={editData.name}
                onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editData.contactEmail}
                  onChange={(e) => setEditData((p) => ({ ...p, contactEmail: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editData.contactPhone}
                  onChange={(e) => setEditData((p) => ({ ...p, contactPhone: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editData.address}
                onChange={(e) => setEditData((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-website">Website</Label>
              <Input
                id="edit-website"
                value={editData.website}
                onChange={(e) => setEditData((p) => ({ ...p, website: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

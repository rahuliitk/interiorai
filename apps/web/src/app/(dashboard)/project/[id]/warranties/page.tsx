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
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Textarea,
  toast,
} from '@openlintel/ui';
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Clock,
  FileWarning,
} from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: 'appliance', label: 'Appliance' },
  { value: 'fixture', label: 'Fixture' },
  { value: 'material', label: 'Material' },
  { value: 'system', label: 'System' },
] as const;

const WARRANTY_TYPE_OPTIONS = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'extended', label: 'Extended' },
  { value: 'contractor', label: 'Contractor' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-800',
  claimed: 'bg-orange-100 text-orange-800',
};

const CATEGORY_COLORS: Record<string, string> = {
  appliance: 'bg-blue-100 text-blue-800',
  fixture: 'bg-purple-100 text-purple-800',
  material: 'bg-amber-100 text-amber-800',
  system: 'bg-cyan-100 text-cyan-800',
};

const WARRANTY_TYPE_COLORS: Record<string, string> = {
  manufacturer: 'bg-indigo-100 text-indigo-800',
  extended: 'bg-teal-100 text-teal-800',
  contractor: 'bg-rose-100 text-rose-800',
};

function getDaysRemaining(endDate: string | Date): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getWarrantyStatus(warranty: any): string {
  if (warranty.status === 'claimed') return 'claimed';
  const days = getDaysRemaining(warranty.warrantyEndDate);
  return days <= 0 ? 'expired' : 'active';
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function WarrantiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimWarrantyId, setClaimWarrantyId] = useState<string | null>(null);

  // Form state for adding a warranty
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [warrantyStartDate, setWarrantyStartDate] = useState('');
  const [warrantyEndDate, setWarrantyEndDate] = useState('');
  const [warrantyType, setWarrantyType] = useState('');

  // Form state for filing a claim
  const [issueDescription, setIssueDescription] = useState('');

  const { data: warranties = [], isLoading } = trpc.warranty.list.useQuery({ projectId });
  const { data: expiringAlertsData } = trpc.warranty.getExpiringAlerts.useQuery({ projectId });
  const expiringAlerts = expiringAlertsData?.all ?? [];

  const createWarranty = trpc.warranty.create.useMutation({
    onSuccess: () => {
      utils.warranty.list.invalidate({ projectId });
      utils.warranty.getExpiringAlerts.invalidate({ projectId });
      setAddOpen(false);
      resetAddForm();
      toast({ title: 'Warranty added', description: 'The warranty has been recorded.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to add warranty', description: err.message, variant: 'destructive' });
    },
  });

  const fileClaim = trpc.warranty.fileClaim.useMutation({
    onSuccess: () => {
      utils.warranty.list.invalidate({ projectId });
      utils.warranty.getExpiringAlerts.invalidate({ projectId });
      setClaimOpen(false);
      setClaimWarrantyId(null);
      setIssueDescription('');
      toast({ title: 'Claim filed', description: 'Your warranty claim has been submitted.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to file claim', description: err.message, variant: 'destructive' });
    },
  });

  const deleteWarranty = trpc.warranty.delete.useMutation({
    onSuccess: () => {
      utils.warranty.list.invalidate({ projectId });
      utils.warranty.getExpiringAlerts.invalidate({ projectId });
      toast({ title: 'Warranty deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete warranty', description: err.message, variant: 'destructive' });
    },
  });

  function resetAddForm() {
    setItemName('');
    setCategory('');
    setBrand('');
    setSerialNumber('');
    setWarrantyStartDate('');
    setWarrantyEndDate('');
    setWarrantyType('');
  }

  function handleCreate() {
    if (!itemName || !category || !warrantyStartDate || !warrantyEndDate || !warrantyType) return;
    createWarranty.mutate({
      projectId,
      itemName,
      category: category as 'appliance' | 'fixture' | 'material' | 'system',
      brand,
      serialNumber,
      warrantyStartDate: new Date(warrantyStartDate),
      warrantyEndDate: new Date(warrantyEndDate),
      warrantyType: warrantyType as 'manufacturer' | 'extended' | 'contractor',
    });
  }

  function handleFileClaim() {
    if (!claimWarrantyId || !issueDescription.trim()) return;
    fileClaim.mutate({
      warrantyId: claimWarrantyId,
      issueDescription: issueDescription.trim(),
    });
  }

  function openClaimDialog(warrantyId: string) {
    setClaimWarrantyId(warrantyId);
    setIssueDescription('');
    setClaimOpen(true);
  }

  // Group expiring alerts by urgency
  const alerts30 = expiringAlerts.filter((a: any) => {
    const days = getDaysRemaining(a.warrantyEndDate);
    return days > 0 && days <= 30;
  });
  const alerts60 = expiringAlerts.filter((a: any) => {
    const days = getDaysRemaining(a.warrantyEndDate);
    return days > 30 && days <= 60;
  });
  const alerts90 = expiringAlerts.filter((a: any) => {
    const days = getDaysRemaining(a.warrantyEndDate);
    return days > 60 && days <= 90;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Warranties</h1>
            <p className="text-sm text-muted-foreground">
              Track warranties, expiry dates, and file claims.
            </p>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Warranty
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Warranty</DialogTitle>
              <DialogDescription>
                Record a new warranty for an item in this project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="itemName">Item Name</Label>
                <Input
                  id="itemName"
                  placeholder="e.g. Samsung Refrigerator"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Warranty Type</Label>
                  <Select value={warrantyType} onValueChange={setWarrantyType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {WARRANTY_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    placeholder="e.g. Samsung"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    placeholder="e.g. SN-12345"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={warrantyStartDate}
                    onChange={(e) => setWarrantyStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={warrantyEndDate}
                    onChange={(e) => setWarrantyEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  createWarranty.isPending ||
                  !itemName ||
                  !category ||
                  !warrantyStartDate ||
                  !warrantyEndDate ||
                  !warrantyType
                }
              >
                {createWarranty.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Warranty'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Expiry Alerts Banner */}
      {(alerts30.length > 0 || alerts60.length > 0 || alerts90.length > 0) && (
        <div className="mb-6 space-y-2">
          {alerts30.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  {alerts30.length} warrant{alerts30.length === 1 ? 'y' : 'ies'} expiring within 30 days
                </p>
                <p className="text-xs text-red-600">
                  {alerts30.map((a: any) => a.itemName).join(', ')}
                </p>
              </div>
            </div>
          )}
          {alerts60.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
              <Clock className="h-5 w-5 flex-shrink-0 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-orange-800">
                  {alerts60.length} warrant{alerts60.length === 1 ? 'y' : 'ies'} expiring within 60 days
                </p>
                <p className="text-xs text-orange-600">
                  {alerts60.map((a: any) => a.itemName).join(', ')}
                </p>
              </div>
            </div>
          )}
          {alerts90.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <Clock className="h-5 w-5 flex-shrink-0 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  {alerts90.length} warrant{alerts90.length === 1 ? 'y' : 'ies'} expiring within 90 days
                </p>
                <p className="text-xs text-yellow-600">
                  {alerts90.map((a: any) => a.itemName).join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Claim Dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File Warranty Claim</DialogTitle>
            <DialogDescription>
              Describe the issue to submit a warranty claim.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="issueDescription">Issue Description</Label>
              <Textarea
                id="issueDescription"
                placeholder="Describe the issue in detail..."
                rows={4}
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleFileClaim}
              disabled={fileClaim.isPending || !issueDescription.trim()}
            >
              {fileClaim.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Filing...
                </>
              ) : (
                'File Claim'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warranty Cards */}
      {warranties.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {warranties.map((warranty: any) => {
            const status = getWarrantyStatus(warranty);
            const daysRemaining = getDaysRemaining(warranty.warrantyEndDate);
            const claimCount = warranty.claims?.length || warranty.claimCount || 0;

            return (
              <Card key={warranty.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{warranty.itemName}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {warranty.brand && <span>{warranty.brand}</span>}
                        {warranty.brand && warranty.serialNumber && <span> &middot; </span>}
                        {warranty.serialNumber && (
                          <span className="font-mono text-xs">{warranty.serialNumber}</span>
                        )}
                      </CardDescription>
                    </div>
                    <Badge className={`ml-2 flex-shrink-0 text-[10px] ${STATUS_COLORS[status] || ''}`}>
                      {status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Category and warranty type badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className={`text-[10px] ${CATEGORY_COLORS[warranty.category] || 'bg-gray-100 text-gray-800'}`}>
                      {warranty.category}
                    </Badge>
                    <Badge className={`text-[10px] ${WARRANTY_TYPE_COLORS[warranty.warrantyType] || 'bg-gray-100 text-gray-800'}`}>
                      {warranty.warrantyType}
                    </Badge>
                    {claimCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {claimCount} claim{claimCount === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </div>

                  {/* Dates and days remaining */}
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Start</span>
                      <span className="font-medium">{formatDate(warranty.warrantyStartDate)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">End</span>
                      <span className="font-medium">{formatDate(warranty.warrantyEndDate)}</span>
                    </div>
                    <div className="mt-2 border-t pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Remaining</span>
                        <span
                          className={`font-semibold ${
                            daysRemaining <= 0
                              ? 'text-gray-500'
                              : daysRemaining <= 30
                                ? 'text-red-600'
                                : daysRemaining <= 60
                                  ? 'text-orange-600'
                                  : daysRemaining <= 90
                                    ? 'text-yellow-600'
                                    : 'text-green-600'
                          }`}
                        >
                          {daysRemaining <= 0
                            ? 'Expired'
                            : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={status === 'expired'}
                      onClick={() => openClaimDialog(warranty.id)}
                    >
                      <FileWarning className="mr-1 h-3.5 w-3.5" />
                      File Claim
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteWarranty.mutate({ id: warranty.id })}
                      disabled={deleteWarranty.isPending}
                    >
                      {deleteWarranty.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Empty state */
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Shield className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Warranties</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add warranties to track coverage, expiry dates, and file claims for your project items.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Warranty
          </Button>
        </Card>
      )}
    </div>
  );
}

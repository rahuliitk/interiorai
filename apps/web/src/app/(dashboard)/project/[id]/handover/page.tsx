'use client';

import { use, useState, useCallback } from 'react';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@openlintel/ui';
import {
  Package,
  CheckCircle2,
  FileText,
  Wrench,
  Users,
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  ClipboardCheck,
  ArrowRight,
  Shield,
  UserCheck,
  Pencil,
  Save,
  X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface MaterialRow {
  item: string;
  brand: string;
  model: string;
  batch?: string;
  purchaseDate?: string;
  vendor?: string;
}

interface ContractorRow {
  name: string;
  trade: string;
  phone?: string;
  email?: string;
}

interface GuideRow {
  system: string;
  instructions: string;
}

// ── Constants ──────────────────────────────────────────────────
const STATUS_STEPS = ['draft', 'in_progress', 'ready', 'delivered'] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  ready: 'Ready for Delivery',
  delivered: 'Delivered',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  ready: 'bg-amber-100 text-amber-800',
  delivered: 'bg-green-100 text-green-800',
};

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Page Component ─────────────────────────────────────────────
export default function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  // Local state
  const [activeTab, setActiveTab] = useState('drawings');
  const [signOffOpen, setSignOffOpen] = useState(false);

  // As-Built Drawings state
  const [drawingKeys, setDrawingKeys] = useState<string[]>([]);
  const [newDrawingKey, setNewDrawingKey] = useState('');
  const [drawingsEditing, setDrawingsEditing] = useState(false);

  // Material Register state
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [materialsEditing, setMaterialsEditing] = useState(false);

  // Contractor Directory state
  const [contractorList, setContractorList] = useState<ContractorRow[]>([]);
  const [contractorsEditing, setContractorsEditing] = useState(false);

  // Operational Guides state
  const [guides, setGuides] = useState<GuideRow[]>([]);
  const [guidesEditing, setGuidesEditing] = useState(false);

  // ── Queries ────────────────────────────────────────────────
  const { data: pkg, isLoading: pkgLoading } = trpc.handover.get.useQuery(
    { projectId },
    {
      onSuccess: (data: any) => {
        if (data) {
          setDrawingKeys((data.asBuiltDrawingKeys as string[]) ?? []);
          setMaterials((data.materialRegister as MaterialRow[]) ?? []);
          setContractorList((data.contractorDirectory as ContractorRow[]) ?? []);
          setGuides((data.operationalGuides as GuideRow[]) ?? []);
        }
      },
    },
  );

  const { data: summaryData, isLoading: summaryLoading } =
    trpc.handover.gatherData.useQuery({ projectId });

  // ── Mutations ──────────────────────────────────────────────
  const getOrCreate = trpc.handover.getOrCreate.useMutation({
    onSuccess: () => {
      utils.handover.get.invalidate({ projectId });
      utils.handover.gatherData.invalidate({ projectId });
      toast({ title: 'Handover package created', description: 'Your handover package has been initialized.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create package', description: err.message, variant: 'destructive' });
    },
  });

  const updatePkg = trpc.handover.update.useMutation({
    onSuccess: () => {
      utils.handover.get.invalidate({ projectId });
      toast({ title: 'Package updated', description: 'Handover package has been saved.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    },
  });

  const signOffMut = trpc.handover.signOff.useMutation({
    onSuccess: () => {
      utils.handover.get.invalidate({ projectId });
      utils.handover.gatherData.invalidate({ projectId });
      setSignOffOpen(false);
      toast({ title: 'Signed off', description: 'The handover package has been delivered.' });
    },
    onError: (err) => {
      toast({ title: 'Sign-off failed', description: err.message, variant: 'destructive' });
    },
  });

  // ── Save handlers ──────────────────────────────────────────
  const saveDrawings = useCallback(() => {
    if (!pkg) return;
    updatePkg.mutate({ id: pkg.id, asBuiltDrawingKeys: drawingKeys });
    setDrawingsEditing(false);
  }, [pkg, drawingKeys, updatePkg]);

  const saveMaterials = useCallback(() => {
    if (!pkg) return;
    const valid = materials.filter((m) => m.item.trim() && m.brand.trim() && m.model.trim());
    setMaterials(valid);
    updatePkg.mutate({ id: pkg.id, materialRegister: valid });
    setMaterialsEditing(false);
  }, [pkg, materials, updatePkg]);

  const saveContractors = useCallback(() => {
    if (!pkg) return;
    const valid = contractorList.filter((c) => c.name.trim() && c.trade.trim());
    setContractorList(valid);
    updatePkg.mutate({ id: pkg.id, contractorDirectory: valid });
    setContractorsEditing(false);
  }, [pkg, contractorList, updatePkg]);

  const saveGuides = useCallback(() => {
    if (!pkg) return;
    const valid = guides.filter((g) => g.system.trim() && g.instructions.trim());
    setGuides(valid);
    updatePkg.mutate({ id: pkg.id, operationalGuides: valid });
    setGuidesEditing(false);
  }, [pkg, guides, updatePkg]);

  const updateStatus = useCallback(
    (status: 'draft' | 'in_progress' | 'ready' | 'delivered') => {
      if (!pkg) return;
      updatePkg.mutate({ id: pkg.id, status });
    },
    [pkg, updatePkg],
  );

  // ── Row manipulation helpers ───────────────────────────────
  const addDrawingKey = () => {
    const trimmed = newDrawingKey.trim();
    if (!trimmed) return;
    setDrawingKeys((prev) => [...prev, trimmed]);
    setNewDrawingKey('');
  };
  const removeDrawingKey = (idx: number) => setDrawingKeys((p) => p.filter((_, i) => i !== idx));

  const addMaterialRow = () => setMaterials((p) => [...p, { item: '', brand: '', model: '', batch: '', purchaseDate: '', vendor: '' }]);
  const updateMaterialRow = (idx: number, field: keyof MaterialRow, val: string) => setMaterials((p) => p.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  const removeMaterialRow = (idx: number) => setMaterials((p) => p.filter((_, i) => i !== idx));

  const addContractorRow = () => setContractorList((p) => [...p, { name: '', trade: '', phone: '', email: '' }]);
  const updateContractorRow = (idx: number, field: keyof ContractorRow, val: string) => setContractorList((p) => p.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  const removeContractorRow = (idx: number) => setContractorList((p) => p.filter((_, i) => i !== idx));

  const addGuideRow = () => setGuides((p) => [...p, { system: '', instructions: '' }]);
  const updateGuideRow = (idx: number, field: keyof GuideRow, val: string) => setGuides((p) => p.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  const removeGuideRow = (idx: number) => setGuides((p) => p.filter((_, i) => i !== idx));

  // ── Loading state ──────────────────────────────────────────
  if (pkgLoading || summaryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // ── No package yet ──────────────────────────────────────────
  if (!pkg) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Handover Package</h1>
            <p className="text-sm text-muted-foreground">
              Compile as-built documentation, materials, and guides for client handover.
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Warranties Tracked</CardDescription>
              <CardTitle className="text-2xl">{summaryData?.warrantiesCount ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" /><span>Active warranties</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Contractors Assigned</CardDescription>
              <CardTitle className="text-2xl">{summaryData?.contractorsAssigned ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /><span>Project contractors</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Package Status</CardDescription>
              <CardTitle className="text-2xl">Not Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Package className="h-3.5 w-3.5" /><span>No handover package created yet</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Handover Package</h2>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            Create a handover package to compile as-built drawings, material registers,
            contractor directories, and operational guides for client delivery.
          </p>
          <Button onClick={() => getOrCreate.mutate({ projectId })} disabled={getOrCreate.isPending}>
            {getOrCreate.isPending ? (
              <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Creating...</>
            ) : (
              <><Plus className="mr-1 h-4 w-4" />Generate Handover Package</>
            )}
          </Button>
        </Card>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────
  const currentStepIdx = STATUS_STEPS.indexOf(pkg.status as any);
  const isDelivered = pkg.status === 'delivered';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Handover Package</h1>
            <p className="text-sm text-muted-foreground">
              Compile and deliver as-built documentation to the client.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_COLORS[pkg.status] ?? 'bg-gray-100 text-gray-800'}>
            {STATUS_LABELS[pkg.status] ?? pkg.status}
          </Badge>
          {!isDelivered && (
            <Dialog open={signOffOpen} onOpenChange={setSignOffOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><ClipboardCheck className="mr-1 h-4 w-4" />Client Sign-Off</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Client Sign-Off</DialogTitle>
                  <DialogDescription>
                    This will mark the handover package as delivered and record the client sign-off timestamp.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Drawings</span>
                      <span className="font-medium">{drawingKeys.length} file(s)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Materials</span>
                      <span className="font-medium">{materials.length} item(s)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Contractors</span>
                      <span className="font-medium">{contractorList.length} contact(s)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Guides</span>
                      <span className="font-medium">{guides.length} guide(s)</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSignOffOpen(false)}>Cancel</Button>
                  <Button onClick={() => signOffMut.mutate({ id: pkg.id })} disabled={signOffMut.isPending}>
                    {signOffMut.isPending ? (
                      <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Signing...</>
                    ) : (
                      <><UserCheck className="mr-1 h-4 w-4" />Confirm Sign-Off</>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {STATUS_STEPS.map((step, idx) => {
            const isComplete = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            return (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                    isComplete ? 'border-green-500 bg-green-500 text-white'
                      : isCurrent ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground'
                  }`}>
                    {isComplete ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                  </div>
                  <span className={`mt-1 text-[11px] whitespace-nowrap ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {STATUS_LABELS[step]}
                  </span>
                </div>
                {idx < STATUS_STEPS.length - 1 && (
                  <div className={`mx-2 h-0.5 flex-1 ${idx < currentStepIdx ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
                )}
              </div>
            );
          })}
        </div>
        {!isDelivered && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Advance status:</span>
            {STATUS_STEPS.filter((_, idx) => idx > currentStepIdx && idx < STATUS_STEPS.length - 1).map((step) => (
              <Button key={step} size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(step)} disabled={updatePkg.isPending}>
                <ArrowRight className="mr-1 h-3 w-3" />{STATUS_LABELS[step]}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Warranties Tracked</CardDescription>
            <CardTitle className="text-2xl">{summaryData?.warrantiesCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /><span>Active warranties</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contractors Assigned</CardDescription>
            <CardTitle className="text-2xl">{summaryData?.contractorsAssigned ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /><span>Project contractors</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Created</CardDescription>
            <CardTitle className="text-lg">{formatDate(pkg.createdAt)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /><span>Package initialized</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Delivered</CardDescription>
            <CardTitle className="text-lg">{pkg.deliveredAt ? formatDate(pkg.deliveredAt) : '--'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span>{pkg.clientSignedAt ? `Signed ${formatDate(pkg.clientSignedAt)}` : 'Awaiting sign-off'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="drawings" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">As-Built Drawings</span>
            <span className="sm:hidden">Drawings</span>
          </TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">Material Register</span>
            <span className="sm:hidden">Materials</span>
          </TabsTrigger>
          <TabsTrigger value="contractors" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Contractor Directory</span>
            <span className="sm:hidden">Contractors</span>
          </TabsTrigger>
          <TabsTrigger value="guides" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Operational Guides</span>
            <span className="sm:hidden">Guides</span>
          </TabsTrigger>
        </TabsList>

        {/* ── As-Built Drawings Tab ─────────────────────────── */}
        <TabsContent value="drawings">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />As-Built Drawings
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Reference keys for as-built drawing files uploaded to this project.
                  </CardDescription>
                </div>
                {!isDelivered && (
                  <Button size="sm" variant={drawingsEditing ? 'default' : 'outline'}
                    onClick={() => { if (drawingsEditing) saveDrawings(); else setDrawingsEditing(true); }}
                    disabled={updatePkg.isPending}>
                    {updatePkg.isPending && drawingsEditing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : drawingsEditing ? <Save className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
                    {drawingsEditing ? 'Save' : 'Edit'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {drawingsEditing && (
                <div className="mb-4 flex items-center gap-2">
                  <Input
                    placeholder="Enter drawing file key or reference..."
                    value={newDrawingKey}
                    onChange={(e) => setNewDrawingKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDrawingKey(); } }}
                  />
                  <Button size="sm" variant="outline" onClick={addDrawingKey}>
                    <Plus className="mr-1 h-4 w-4" />Add
                  </Button>
                </div>
              )}
              {drawingKeys.length > 0 ? (
                <div className="space-y-2">
                  {drawingKeys.map((key, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-mono">{key}</span>
                      </div>
                      {drawingsEditing && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeDrawingKey(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No as-built drawings added yet.{!isDelivered && ' Click Edit to add drawing file references.'}
                  </p>
                </div>
              )}
            </CardContent>
            {drawingsEditing && (
              <CardFooter className="justify-end gap-2 border-t pt-4">
                <Button size="sm" variant="ghost" onClick={() => { setDrawingKeys((pkg.asBuiltDrawingKeys as string[]) ?? []); setDrawingsEditing(false); }}>
                  <X className="mr-1 h-4 w-4" />Cancel
                </Button>
                <Button size="sm" onClick={saveDrawings} disabled={updatePkg.isPending}>
                  {updatePkg.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save Drawings
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ── Material Register Tab ─────────────────────────── */}
        <TabsContent value="materials">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />Material Register
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Comprehensive list of all materials used in the project build.
                  </CardDescription>
                </div>
                {!isDelivered && (
                  <div className="flex items-center gap-2">
                    {materialsEditing && (
                      <Button size="sm" variant="outline" onClick={addMaterialRow}>
                        <Plus className="mr-1 h-4 w-4" />Add Row
                      </Button>
                    )}
                    <Button size="sm" variant={materialsEditing ? 'default' : 'outline'}
                      onClick={() => { if (materialsEditing) saveMaterials(); else setMaterialsEditing(true); }}
                      disabled={updatePkg.isPending}>
                      {updatePkg.isPending && materialsEditing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : materialsEditing ? <Save className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
                      {materialsEditing ? 'Save' : 'Edit'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {materials.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Item</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Brand</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Model</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Batch</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Purchase Date</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Vendor</th>
                        {materialsEditing && <th className="pb-2 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((row, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {materialsEditing
                              ? <Input className="h-8 text-sm" value={row.item} onChange={(e) => updateMaterialRow(idx, 'item', e.target.value)} placeholder="Item name" />
                              : <span className="font-medium">{row.item}</span>}
                          </td>
                          <td className="py-2 pr-3">
                            {materialsEditing
                              ? <Input className="h-8 text-sm" value={row.brand} onChange={(e) => updateMaterialRow(idx, 'brand', e.target.value)} placeholder="Brand" />
                              : row.brand}
                          </td>
                          <td className="py-2 pr-3">
                            {materialsEditing
                              ? <Input className="h-8 text-sm" value={row.model} onChange={(e) => updateMaterialRow(idx, 'model', e.target.value)} placeholder="Model" />
                              : row.model}
                          </td>
                          <td className="py-2 pr-3">
                            {materialsEditing
                              ? <Input className="h-8 text-sm" value={row.batch ?? ''} onChange={(e) => updateMaterialRow(idx, 'batch', e.target.value)} placeholder="Batch #" />
                              : (row.batch || '--')}
                          </td>
                          <td className="py-2 pr-3">
                            {materialsEditing
                              ? <Input className="h-8 text-sm" type="date" value={row.purchaseDate ?? ''} onChange={(e) => updateMaterialRow(idx, 'purchaseDate', e.target.value)} />
                              : (row.purchaseDate || '--')}
                          </td>
                          <td className="py-2 pr-3">
                            {materialsEditing
                              ? <Input className="h-8 text-sm" value={row.vendor ?? ''} onChange={(e) => updateMaterialRow(idx, 'vendor', e.target.value)} placeholder="Vendor" />
                              : (row.vendor || '--')}
                          </td>
                          {materialsEditing && (
                            <td className="py-2">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeMaterialRow(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wrench className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No materials registered yet.{!isDelivered && ' Click Edit to add material records.'}
                  </p>
                </div>
              )}
            </CardContent>
            {materialsEditing && (
              <CardFooter className="justify-end gap-2 border-t pt-4">
                <Button size="sm" variant="ghost" onClick={() => { setMaterials((pkg.materialRegister as MaterialRow[]) ?? []); setMaterialsEditing(false); }}>
                  <X className="mr-1 h-4 w-4" />Cancel
                </Button>
                <Button size="sm" onClick={saveMaterials} disabled={updatePkg.isPending}>
                  {updatePkg.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save Materials
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ── Contractor Directory Tab ──────────────────────── */}
        <TabsContent value="contractors">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />Contractor Directory
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Contact details for all contractors involved in the build.
                  </CardDescription>
                </div>
                {!isDelivered && (
                  <div className="flex items-center gap-2">
                    {contractorsEditing && (
                      <Button size="sm" variant="outline" onClick={addContractorRow}>
                        <Plus className="mr-1 h-4 w-4" />Add Contact
                      </Button>
                    )}
                    <Button size="sm" variant={contractorsEditing ? 'default' : 'outline'}
                      onClick={() => { if (contractorsEditing) saveContractors(); else setContractorsEditing(true); }}
                      disabled={updatePkg.isPending}>
                      {updatePkg.isPending && contractorsEditing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : contractorsEditing ? <Save className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
                      {contractorsEditing ? 'Save' : 'Edit'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {contractorList.length > 0 ? (
                <div className="space-y-3">
                  {contractorList.map((row, idx) => (
                    <div key={idx} className="rounded-lg border bg-muted/30 p-4">
                      {contractorsEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Name</Label>
                              <Input className="h-8 text-sm" value={row.name} onChange={(e) => updateContractorRow(idx, 'name', e.target.value)} placeholder="Contractor name" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Trade</Label>
                              <Input className="h-8 text-sm" value={row.trade} onChange={(e) => updateContractorRow(idx, 'trade', e.target.value)} placeholder="e.g. Electrician" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Phone</Label>
                              <Input className="h-8 text-sm" value={row.phone ?? ''} onChange={(e) => updateContractorRow(idx, 'phone', e.target.value)} placeholder="Phone number" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Email</Label>
                              <Input className="h-8 text-sm" type="email" value={row.email ?? ''} onChange={(e) => updateContractorRow(idx, 'email', e.target.value)} placeholder="Email address" />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeContractorRow(idx)}>
                              <Trash2 className="mr-1 h-3.5 w-3.5" />Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{row.name}</span>
                              <Badge variant="secondary" className="text-[10px]">{row.trade}</Badge>
                            </div>
                            <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                              {row.phone && <span>Tel: {row.phone}</span>}
                              {row.email && <span>Email: {row.email}</span>}
                              {!row.phone && !row.email && <span>No contact details</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No contractors listed yet.{!isDelivered && ' Click Edit to add contractor contact details.'}
                  </p>
                </div>
              )}
            </CardContent>
            {contractorsEditing && (
              <CardFooter className="justify-end gap-2 border-t pt-4">
                <Button size="sm" variant="ghost" onClick={() => { setContractorList((pkg.contractorDirectory as ContractorRow[]) ?? []); setContractorsEditing(false); }}>
                  <X className="mr-1 h-4 w-4" />Cancel
                </Button>
                <Button size="sm" onClick={saveContractors} disabled={updatePkg.isPending}>
                  {updatePkg.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save Contractors
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ── Operational Guides Tab ────────────────────────── */}
        <TabsContent value="guides">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />Operational Guides
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Instructions for operating and maintaining each home system.
                  </CardDescription>
                </div>
                {!isDelivered && (
                  <div className="flex items-center gap-2">
                    {guidesEditing && (
                      <Button size="sm" variant="outline" onClick={addGuideRow}>
                        <Plus className="mr-1 h-4 w-4" />Add Guide
                      </Button>
                    )}
                    <Button size="sm" variant={guidesEditing ? 'default' : 'outline'}
                      onClick={() => { if (guidesEditing) saveGuides(); else setGuidesEditing(true); }}
                      disabled={updatePkg.isPending}>
                      {updatePkg.isPending && guidesEditing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : guidesEditing ? <Save className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
                      {guidesEditing ? 'Save' : 'Edit'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {guides.length > 0 ? (
                <div className="space-y-4">
                  {guides.map((row, idx) => (
                    <div key={idx} className="rounded-lg border bg-muted/30 p-4">
                      {guidesEditing ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">System Name</Label>
                            <Input className="h-8 text-sm" value={row.system} onChange={(e) => updateGuideRow(idx, 'system', e.target.value)} placeholder="e.g. HVAC System, Solar Panels" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Instructions</Label>
                            <Textarea className="text-sm" rows={4} value={row.instructions} onChange={(e) => updateGuideRow(idx, 'instructions', e.target.value)} placeholder="Operating instructions, maintenance schedule, emergency procedures..." />
                          </div>
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeGuideRow(idx)}>
                              <Trash2 className="mr-1 h-3.5 w-3.5" />Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="h-4 w-4 text-primary" />
                            <span className="font-medium">{row.system}</span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {row.instructions}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <BookOpen className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No operational guides added yet.{!isDelivered && ' Click Edit to add system guides.'}
                  </p>
                </div>
              )}
            </CardContent>
            {guidesEditing && (
              <CardFooter className="justify-end gap-2 border-t pt-4">
                <Button size="sm" variant="ghost" onClick={() => { setGuides((pkg.operationalGuides as GuideRow[]) ?? []); setGuidesEditing(false); }}>
                  <X className="mr-1 h-4 w-4" />Cancel
                </Button>
                <Button size="sm" onClick={saveGuides} disabled={updatePkg.isPending}>
                  {updatePkg.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save Guides
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

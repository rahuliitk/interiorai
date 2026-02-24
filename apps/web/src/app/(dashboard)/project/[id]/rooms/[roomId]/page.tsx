'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { FileUpload } from '@/components/file-upload';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Skeleton,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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
  toast,
} from '@openlintel/ui';
import { ArrowLeft, Trash2, Palette, Pencil, ImageIcon, Plus } from 'lucide-react';

const ROOM_TYPES = [
  'living_room', 'bedroom', 'kitchen', 'bathroom', 'dining', 'study',
  'balcony', 'utility', 'foyer', 'corridor', 'pooja_room', 'store', 'garage', 'terrace', 'other',
] as const;

const DESIGN_STYLES = [
  'modern', 'contemporary', 'minimalist', 'scandinavian', 'industrial',
  'traditional', 'transitional', 'bohemian', 'coastal', 'rustic',
] as const;

const BUDGET_TIERS = ['economy', 'standard', 'premium', 'luxury'] as const;

export default function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id: projectId, roomId } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  // Edit room dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('other');
  const [editLength, setEditLength] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');

  // Design variant dialog state
  const [variantOpen, setVariantOpen] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantStyle, setVariantStyle] = useState('modern');
  const [variantBudget, setVariantBudget] = useState('standard');

  const { data: room, isLoading } = trpc.room.byId.useQuery({ id: roomId });
  const { data: roomUploads = [] } = trpc.upload.listByRoom.useQuery({ roomId });

  const deleteRoom = trpc.room.delete.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
      router.push(`/project/${projectId}`);
    },
  });

  const updateRoom = trpc.room.update.useMutation({
    onSuccess: () => {
      utils.room.byId.invalidate({ id: roomId });
      setEditOpen(false);
      toast({ title: 'Room updated' });
    },
  });

  const createVariant = trpc.designVariant.create.useMutation({
    onSuccess: () => {
      utils.room.byId.invalidate({ id: roomId });
      setVariantOpen(false);
      setVariantName('');
      toast({ title: 'Design variant created' });
    },
  });

  const deleteVariant = trpc.designVariant.delete.useMutation({
    onSuccess: () => {
      utils.room.byId.invalidate({ id: roomId });
      toast({ title: 'Design variant deleted' });
    },
  });

  const deleteUpload = trpc.upload.delete.useMutation({
    onSuccess: () => {
      utils.upload.listByRoom.invalidate({ roomId });
      toast({ title: 'Photo deleted' });
    },
  });

  const openEditDialog = () => {
    if (!room) return;
    setEditName(room.name);
    setEditType(room.type);
    setEditLength(room.lengthMm?.toString() ?? '');
    setEditWidth(room.widthMm?.toString() ?? '');
    setEditHeight(room.heightMm?.toString() ?? '');
    setEditOpen(true);
  };

  const handleUpdateRoom = () => {
    updateRoom.mutate({
      id: roomId,
      name: editName.trim() || undefined,
      type: editType,
      lengthMm: editLength ? Number(editLength) : undefined,
      widthMm: editWidth ? Number(editWidth) : undefined,
      heightMm: editHeight ? Number(editHeight) : undefined,
    });
  };

  const handleCreateVariant = () => {
    if (!variantName.trim()) return;
    createVariant.mutate({
      roomId,
      name: variantName.trim(),
      style: variantStyle,
      budgetTier: variantBudget,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  if (!room) {
    return <p className="text-muted-foreground">Room not found.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/project/${projectId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
              <Button variant="ghost" size="icon" onClick={openEditDialog} className="h-7 w-7">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">
                {room.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </Badge>
              {room.floor !== null && room.floor !== 0 && (
                <span className="text-sm text-muted-foreground">Floor {room.floor}</span>
              )}
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('Delete this room? This cannot be undone.')) {
                deleteRoom.mutate({ id: roomId });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Dimensions summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Dimensions</CardTitle>
        </CardHeader>
        <CardContent>
          {room.lengthMm && room.widthMm ? (
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">L:</span> {room.lengthMm}mm
              </div>
              <div>
                <span className="text-muted-foreground">W:</span> {room.widthMm}mm
              </div>
              <div>
                <span className="text-muted-foreground">H:</span> {room.heightMm ?? 2700}mm
              </div>
              <div className="font-medium">
                {((room.lengthMm * room.widthMm) / 1_000_000).toFixed(2)} m²
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Dimensions not set.{' '}
              <button onClick={openEditDialog} className="underline hover:text-foreground">
                Add dimensions
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Photos + Designs */}
      <Tabs defaultValue="photos">
        <TabsList>
          <TabsTrigger value="photos">
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
            Photos ({roomUploads.length})
          </TabsTrigger>
          <TabsTrigger value="designs">
            <Palette className="mr-1.5 h-3.5 w-3.5" />
            Designs ({((room as any).designVariants ?? []).length})
          </TabsTrigger>
        </TabsList>

        {/* Photos Tab */}
        <TabsContent value="photos" className="space-y-4">
          <FileUpload
            projectId={projectId}
            roomId={roomId}
            onUploadComplete={() => {
              utils.upload.listByRoom.invalidate({ roomId });
            }}
          />
          {roomUploads.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {roomUploads.map((upload: any) => (
                <div key={upload.id} className="group relative rounded-lg border overflow-hidden">
                  {upload.mimeType.startsWith('image/') ? (
                    <img
                      src={`/api/uploads/${encodeURIComponent(upload.storageKey)}`}
                      alt={upload.filename}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-muted">
                      <span className="text-xs text-muted-foreground">{upload.filename}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-2">
                    <span className="truncate text-xs text-muted-foreground">{upload.filename}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        if (confirm('Delete this photo?')) {
                          deleteUpload.mutate({ id: upload.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Designs Tab */}
        <TabsContent value="designs" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Create design variants to generate AI renderings.
            </p>
            <Dialog open={variantOpen} onOpenChange={setVariantOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Design Variant
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Design Variant</DialogTitle>
                  <DialogDescription>
                    Create a new design variant for this room.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="variant-name">Name</Label>
                    <Input
                      id="variant-name"
                      placeholder="e.g. Modern Minimalist"
                      value={variantName}
                      onChange={(e) => setVariantName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variant-style">Style</Label>
                    <Select value={variantStyle} onValueChange={setVariantStyle}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DESIGN_STYLES.map((style) => (
                          <SelectItem key={style} value={style}>
                            {style.charAt(0).toUpperCase() + style.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variant-budget">Budget Tier</Label>
                    <Select value={variantBudget} onValueChange={setVariantBudget}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUDGET_TIERS.map((tier) => (
                          <SelectItem key={tier} value={tier}>
                            {tier.charAt(0).toUpperCase() + tier.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setVariantOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateVariant}
                    disabled={createVariant.isPending || !variantName.trim()}
                  >
                    {createVariant.isPending ? 'Creating...' : 'Create Variant'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {((room as any).designVariants ?? []).length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-8 text-center">
              <Palette className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">
                No design variants yet. Add one to get started.
              </p>
              <Button size="sm" disabled title="Design engine service required">
                Generate Designs (Coming Soon)
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {((room as any).designVariants ?? []).map((variant: any) => (
                <div
                  key={variant.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{variant.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{variant.style}</Badge>
                      <Badge variant="outline">{variant.budgetTier}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(variant.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm('Delete this design variant?')) {
                        deleteVariant.mutate({ id: variant.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Room Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Room</DialogTitle>
            <DialogDescription>Update room details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Room Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Room Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-length">Length (mm)</Label>
                <Input
                  id="edit-length"
                  type="number"
                  value={editLength}
                  onChange={(e) => setEditLength(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-width">Width (mm)</Label>
                <Input
                  id="edit-width"
                  type="number"
                  value={editWidth}
                  onChange={(e) => setEditWidth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-height">Height (mm)</Label>
                <Input
                  id="edit-height"
                  type="number"
                  value={editHeight}
                  onChange={(e) => setEditHeight(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRoom} disabled={updateRoom.isPending}>
              {updateRoom.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

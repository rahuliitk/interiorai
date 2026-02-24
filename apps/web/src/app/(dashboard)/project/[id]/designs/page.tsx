'use client';

import { use, useState } from 'react';
import Link from 'next/link';
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
  toast,
} from '@openlintel/ui';
import { Palette, Plus, Trash2, ImageIcon } from 'lucide-react';

const DESIGN_STYLES = [
  'modern', 'contemporary', 'minimalist', 'scandinavian', 'industrial',
  'traditional', 'transitional', 'bohemian', 'coastal', 'rustic',
] as const;

const BUDGET_TIERS = ['economy', 'standard', 'premium', 'luxury'] as const;

export default function DesignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantStyle, setVariantStyle] = useState('modern');
  const [variantBudget, setVariantBudget] = useState('standard');

  const { data: project, isLoading: loadingProject } = trpc.project.byId.useQuery({ id: projectId });
  const { data: variants = [], isLoading: loadingVariants } = trpc.designVariant.listByProject.useQuery({ projectId });

  const createVariant = trpc.designVariant.create.useMutation({
    onSuccess: () => {
      utils.designVariant.listByProject.invalidate({ projectId });
      setOpen(false);
      setVariantName('');
      toast({ title: 'Design variant created' });
    },
  });

  const deleteVariant = trpc.designVariant.delete.useMutation({
    onSuccess: () => {
      utils.designVariant.listByProject.invalidate({ projectId });
      toast({ title: 'Design variant deleted' });
    },
  });

  const handleCreate = () => {
    if (!variantName.trim() || !selectedRoom) return;
    createVariant.mutate({
      roomId: selectedRoom,
      name: variantName.trim(),
      style: variantStyle,
      budgetTier: variantBudget,
    });
  };

  const filteredVariants =
    roomFilter === 'all' ? variants : variants.filter((v: any) => v.roomId === roomFilter);

  if (loadingProject || loadingVariants) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const rooms = (project as any)?.rooms ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Designs</h1>
          <p className="text-sm text-muted-foreground">
            {variants.length} design variant{variants.length !== 1 ? 's' : ''} across{' '}
            {rooms.length} room{rooms.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rooms.length > 0 && (
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by room" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rooms</SelectItem>
                {rooms.map((room: any) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={rooms.length === 0}>
                <Plus className="mr-1 h-4 w-4" />
                Add Design
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Design Variant</DialogTitle>
                <DialogDescription>Create a design variant for a room.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a room" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.map((room: any) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design-name">Name</Label>
                  <Input
                    id="design-name"
                    placeholder="e.g. Modern Minimalist"
                    value={variantName}
                    onChange={(e) => setVariantName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Style</Label>
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
                  <Label>Budget Tier</Label>
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
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createVariant.isPending || !variantName.trim() || !selectedRoom}
                >
                  {createVariant.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {rooms.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Palette className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Rooms Yet</h2>
          <p className="text-sm text-muted-foreground">
            Add rooms to your project first, then create design variants for each room.
          </p>
        </Card>
      ) : filteredVariants.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Palette className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Design Variants</h2>
          <p className="text-sm text-muted-foreground">
            Create design variants to start generating AI renderings.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVariants.map((variant: any) => (
            <Card key={variant.id} className="overflow-hidden">
              <Link href={`/project/${projectId}/designs/${variant.id}`}>
                <div className="flex aspect-video items-center justify-center bg-muted">
                  {variant.renderUrl ? (
                    <img
                      src={variant.renderUrl}
                      alt={variant.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                  )}
                </div>
              </Link>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/project/${projectId}/designs/${variant.id}`}>
                      <CardTitle className="text-base hover:underline">{variant.name}</CardTitle>
                    </Link>
                    <CardDescription>{variant.roomName}</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm('Delete this design variant?')) {
                        deleteVariant.mutate({ id: variant.id });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{variant.style}</Badge>
                  <Badge variant="outline">{variant.budgetTier}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

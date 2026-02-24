'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import Link from 'next/link';
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
import { Package, Plus, Loader2, MapPin } from 'lucide-react';

const MATERIAL_TYPES = ['wood', 'tile', 'stone', 'metal', 'fabric', 'other'] as const;
const UNITS = ['pieces', 'sqft', 'sqm', 'linear_ft', 'linear_m', 'kg'] as const;
const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;

const conditionLabels: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const PAGE_SIZE = 12;

export default function OffcutsPage() {
  const [search, setSearch] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  // Create listing form state
  const [formTitle, setFormTitle] = useState('');
  const [formMaterialType, setFormMaterialType] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [formAskingPrice, setFormAskingPrice] = useState('');
  const [formLocation, setFormLocation] = useState('');

  const utils = trpc.useUtils();

  const { data: listings = [], isLoading } = trpc.community.listListings.useQuery({
    search: search || undefined,
    materialType: materialType || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const createListing = trpc.community.createListing.useMutation({
    onSuccess: () => {
      utils.community.listListings.invalidate();
      setCreateOpen(false);
      resetForm();
      toast({ title: 'Listing created', description: 'Your offcut listing is now live.' });
    },
    onError: () => {
      toast({ title: 'Failed to create listing', variant: 'destructive' });
    },
  });

  function resetForm() {
    setFormTitle('');
    setFormMaterialType('');
    setFormQuantity('');
    setFormUnit('');
    setFormCondition('');
    setFormAskingPrice('');
    setFormLocation('');
  }

  function handleCreate() {
    if (!formTitle || !formMaterialType || !formQuantity || !formUnit) return;
    createListing.mutate({
      title: formTitle,
      materialType: formMaterialType,
      quantity: Number(formQuantity),
      unit: formUnit,
      condition: formCondition ? (formCondition as 'new' | 'like_new' | 'good' | 'fair') : undefined,
      askingPrice: formAskingPrice ? Number(formAskingPrice) : undefined,
      location: formLocation || undefined,
    });
  }

  const hasMore = listings.length === PAGE_SIZE;
  const page = Math.floor(offset / PAGE_SIZE);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Offcut Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Buy and sell leftover materials from your projects. Reduce waste and save costs.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              List Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>List Material for Sale</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Oak hardwood planks"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Material Type</Label>
                  <Select value={formMaterialType} onValueChange={setFormMaterialType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select value={formCondition} onValueChange={setFormCondition}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {conditionLabels[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={formUnit} onValueChange={setFormUnit}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="askingPrice">Asking Price</Label>
                <Input
                  id="askingPrice"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={formAskingPrice}
                  onChange={(e) => setFormAskingPrice(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Mumbai, Maharashtra"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!formTitle || !formMaterialType || !formQuantity || !formUnit || createListing.isPending}
              >
                {createListing.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Create Listing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Search offcuts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <Select
          value={materialType}
          onValueChange={(v) => {
            setMaterialType(v === 'all' ? '' : v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All materials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All materials</SelectItem>
            {MATERIAL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Listings grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Listings Found</h2>
          <p className="text-sm text-muted-foreground">
            {search || materialType
              ? 'Try adjusting your search or filters.'
              : 'No offcut listings yet. Be the first to list your leftover materials!'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing: any) => (
              <Card key={listing.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-tight line-clamp-2">
                      {listing.title}
                    </CardTitle>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {listing.materialType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {listing.quantity} {listing.unit?.replace(/_/g, ' ')}
                    </span>
                    {listing.condition && (
                      <Badge
                        variant={listing.condition === 'new' ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {conditionLabels[listing.condition] || listing.condition}
                      </Badge>
                    )}
                  </div>

                  {listing.askingPrice != null && (
                    <p className="text-sm font-semibold text-green-600">
                      {listing.currency === 'INR' ? '\u20B9' : '$'}
                      {Number(listing.askingPrice).toLocaleString()}
                    </p>
                  )}

                  {listing.location && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{listing.location}</span>
                    </div>
                  )}

                  <Link href={`/marketplace/offcuts/${listing.id}`}>
                    <Button variant="outline" size="sm" className="mt-2 w-full">
                      View
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasMore}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

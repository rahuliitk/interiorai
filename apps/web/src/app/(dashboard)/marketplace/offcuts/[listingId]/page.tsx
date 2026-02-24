'use client';

import { use, useState } from 'react';
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
  Separator,
} from '@openlintel/ui';
import { Package, ArrowLeft, Plus, Loader2, MessageSquare, MapPin } from 'lucide-react';

const conditionLabels: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  sold: 'Sold',
  expired: 'Expired',
  removed: 'Removed',
};

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  sold: 'secondary',
  expired: 'outline',
  removed: 'destructive',
};

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = use(params);
  const utils = trpc.useUtils();

  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryMessage, setInquiryMessage] = useState('');

  const { data: listing, isLoading } = trpc.community.getListing.useQuery({ id: listingId });

  const createInquiry = trpc.community.createInquiry.useMutation({
    onSuccess: () => {
      utils.community.getListing.invalidate({ id: listingId });
      setInquiryOpen(false);
      setInquiryMessage('');
      toast({ title: 'Inquiry sent', description: 'The seller has been notified.' });
    },
    onError: () => {
      toast({ title: 'Failed to send inquiry', variant: 'destructive' });
    },
  });

  const updateListing = trpc.community.updateListing.useMutation({
    onSuccess: () => {
      utils.community.getListing.invalidate({ id: listingId });
      toast({ title: 'Listing updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update listing', variant: 'destructive' });
    },
  });

  function handleSendInquiry() {
    if (!inquiryMessage.trim()) return;
    createInquiry.mutate({ listingId, message: inquiryMessage.trim() });
  }

  function handleStatusChange(status: string) {
    updateListing.mutate({
      id: listingId,
      status: status as 'active' | 'sold' | 'expired' | 'removed',
    });
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-64" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Package className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">Listing Not Found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This offcut listing does not exist or has been removed.
        </p>
        <Link href="/marketplace/offcuts">
          <Button variant="outline">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Offcuts
          </Button>
        </Link>
      </div>
    );
  }

  const isOwner = (listing as any).inquiries && (listing as any).inquiries.length >= 0
    ? listing.userId === (listing as any).userId
    : false;
  // A more reliable check: if inquiries array is populated (non-empty or owner gets it)
  const ownerHasInquiries = Array.isArray((listing as any).inquiries) && (listing as any).inquiries.length > 0;
  // The backend strips inquiries for non-owners, so if we got a non-empty array, we are the owner.
  // If we got an empty array, we could be either. We rely on the listing's userId matching.
  // Since we don't have access to the current user ID client-side easily, we use a heuristic:
  // the backend returns inquiries only for the owner, so presence of inquiries = owner.
  // For the empty-inquiries case, we check if the user can update (they'll get an error if not).
  const inquiries = (listing as any).inquiries ?? [];

  const dimensions = listing.dimensions as Record<string, unknown> | null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/marketplace/offcuts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Offcuts
      </Link>

      {/* Title row */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{listing.materialType}</Badge>
            <Badge variant={statusVariants[listing.status ?? 'active'] ?? 'outline'}>
              {statusLabels[listing.status ?? 'active'] ?? listing.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Listing Details</CardTitle>
              <CardDescription>
                Listed on {new Date(listing.createdAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Material Type</p>
                  <p className="text-sm capitalize">{listing.materialType}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Quantity</p>
                  <p className="text-sm">
                    {listing.quantity} {listing.unit?.replace(/_/g, ' ')}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Condition</p>
                  <p className="text-sm">
                    {conditionLabels[listing.condition ?? ''] ?? listing.condition ?? 'N/A'}
                  </p>
                </div>

                {listing.askingPrice != null && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Asking Price</p>
                    <p className="text-sm font-semibold text-green-600">
                      {listing.currency === 'INR' ? '\u20B9' : '$'}
                      {Number(listing.askingPrice).toLocaleString()}
                    </p>
                  </div>
                )}

                {listing.location && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Location</p>
                    <div className="flex items-center gap-1 text-sm">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {listing.location}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <p className="text-sm capitalize">{listing.status ?? 'active'}</p>
                </div>
              </div>

              {/* Dimensions */}
              {dimensions && Object.keys(dimensions).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Dimensions</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      {Object.entries(dimensions).map(([key, value]) => (
                        <span key={key}>
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Owner: Inquiries */}
          {inquiries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inquiries</CardTitle>
                <CardDescription>
                  {inquiries.length} inquiry{inquiries.length !== 1 ? 'ies' : 'y'} received
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {inquiries.map((inquiry: any, idx: number) => (
                    <div key={inquiry.id}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {new Date(inquiry.createdAt).toLocaleDateString()}
                            </span>
                            <Badge
                              variant={inquiry.status === 'accepted' ? 'default' : 'outline'}
                              className="text-[10px]"
                            >
                              {inquiry.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm">{inquiry.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar actions */}
        <div className="space-y-4">
          {/* Price card */}
          {listing.askingPrice != null && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium text-muted-foreground">Asking Price</p>
                <p className="text-2xl font-bold text-green-600">
                  {listing.currency === 'INR' ? '\u20B9' : '$'}
                  {Number(listing.askingPrice).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {listing.quantity} {listing.unit?.replace(/_/g, ' ')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Send Inquiry (non-owner) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interested?</CardTitle>
              <CardDescription>
                Send a message to the seller about this listing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={listing.status !== 'active'}>
                    <MessageSquare className="mr-1 h-4 w-4" />
                    Send Inquiry
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send Inquiry</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="inquiry-message">Message</Label>
                      <Textarea
                        id="inquiry-message"
                        placeholder="Hi, I'm interested in this material. Is it still available?"
                        rows={4}
                        value={inquiryMessage}
                        onChange={(e) => setInquiryMessage(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInquiryOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSendInquiry}
                      disabled={!inquiryMessage.trim() || createInquiry.isPending}
                    >
                      {createInquiry.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      Send
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Owner: Status controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manage Listing</CardTitle>
              <CardDescription>Update the status of your listing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={listing.status ?? 'active'}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>
              {updateListing.isPending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

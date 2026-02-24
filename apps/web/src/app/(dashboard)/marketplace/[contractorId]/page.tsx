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
  Separator,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  toast,
} from '@openlintel/ui';
import {
  Star,
  MapPin,
  Briefcase,
  Phone,
  Mail,
  Globe,
  ArrowLeft,
  ImageIcon,
  MessageSquare,
  BadgeCheck,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { HireDialog } from '@/components/hire-dialog';
import { ReviewForm } from '@/components/review-form';

function renderStars(rating: number) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />,
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <Star key={i} className="h-4 w-4 fill-amber-400/50 text-amber-400" />,
      );
    } else {
      stars.push(
        <Star key={i} className="h-4 w-4 text-gray-300" />,
      );
    }
  }
  return stars;
}

export default function ContractorDetailPage({
  params,
}: {
  params: Promise<{ contractorId: string }>;
}) {
  const { contractorId } = use(params);
  const utils = trpc.useUtils();

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const { data: contractor, isLoading } = trpc.contractor.byId.useQuery({ id: contractorId });
  const { data: reviews = [] } = trpc.contractor.listReviews.useQuery({ contractorId });

  const createReview = trpc.contractor.createReview.useMutation({
    onSuccess: () => {
      utils.contractor.listReviews.invalidate({ contractorId });
      utils.contractor.byId.invalidate({ id: contractorId });
      setReviewDialogOpen(false);
      toast({ title: 'Review submitted', description: 'Thank you for your feedback.' });
    },
    onError: () => {
      toast({ title: 'Failed to submit review', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">Contractor Not Found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The contractor you are looking for does not exist.
        </p>
        <Link href="/marketplace">
          <Button variant="outline">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Marketplace
          </Button>
        </Link>
      </div>
    );
  }

  const specializations = (contractor.specializations as string[] | null) || [];
  const portfolioImages = (contractor.portfolioUrls as string[] | null) || (contractor.portfolioKeys as string[] | null) || [];
  const certifications = (contractor.certifications as string[] | null) || [];
  const rating = contractor.rating ? Number(contractor.rating) : null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/marketplace"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      {/* Header section */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
            {contractor.profileImageUrl ? (
              <img
                src={contractor.profileImageUrl}
                alt={contractor.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <Briefcase className="h-7 w-7 text-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{contractor.name}</h1>
              {contractor.verified && (
                <Badge className="bg-blue-100 text-blue-800 gap-1">
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            {contractor.companyName && (
              <p className="text-sm text-muted-foreground">{contractor.companyName}</p>
            )}
            {rating != null && (
              <div className="mt-1 flex items-center gap-2">
                <div className="flex items-center gap-0.5">{renderStars(rating)}</div>
                <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">
                  ({contractor.totalReviews || 0} review
                  {(contractor.totalReviews || 0) !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Star className="mr-1 h-4 w-4" />
                Write Review
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Review {contractor.name}</DialogTitle>
                <DialogDescription>
                  Share your experience working with this contractor.
                </DialogDescription>
              </DialogHeader>
              <ReviewForm
                onSubmit={(data) => {
                  createReview.mutate({
                    contractorId,
                    rating: data.rating,
                    title: data.title || undefined,
                    review: data.review || undefined,
                  });
                }}
                isPending={createReview.isPending}
                onCancel={() => setReviewDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <HireDialog
            contractorId={contractorId}
            contractorName={contractor.name}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* About */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
            </CardHeader>
            <CardContent>
              {contractor.bio ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {contractor.bio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No bio provided.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Specializations */}
          {specializations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Specializations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {specializations.map((spec) => (
                    <Badge key={spec} variant="secondary">
                      {spec}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Portfolio gallery */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portfolio</CardTitle>
              <CardDescription>
                {portfolioImages.length > 0
                  ? `${portfolioImages.length} project photo${portfolioImages.length !== 1 ? 's' : ''}`
                  : 'No portfolio images yet'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {portfolioImages.length > 0 ? (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                  {portfolioImages.map((url, idx) => (
                    <div
                      key={idx}
                      className="aspect-square overflow-hidden rounded-lg border bg-muted"
                    >
                      <img
                        src={url}
                        alt={`Portfolio ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
                  <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No portfolio images available.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reviews</CardTitle>
              <CardDescription>
                {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
                  <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No reviews yet. Be the first to write one!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review, idx) => (
                    <div key={review.id}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <span className="text-xs font-medium text-muted-foreground">
                            {(review.userId as string)?.slice(0, 2)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              {renderStars(review.rating)}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {review.title && (
                            <p className="mt-1 text-sm font-medium">{review.title}</p>
                          )}
                          {review.review && (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {review.review}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Contact info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contractor.city && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{contractor.city}</span>
                </div>
              )}
              {contractor.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{contractor.phone}</span>
                </div>
              )}
              {contractor.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{contractor.email}</span>
                </div>
              )}
              {contractor.website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={contractor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {contractor.website}
                  </a>
                </div>
              )}
              {!contractor.city && !contractor.phone && !contractor.email && !contractor.website && (
                <p className="text-sm text-muted-foreground italic">
                  No contact information provided.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick hire */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hire This Contractor</CardTitle>
              <CardDescription>
                Assign {contractor.name} to one of your projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HireDialog
                contractorId={contractorId}
                contractorName={contractor.name}
                trigger={
                  <Button className="w-full">
                    Hire for Project
                  </Button>
                }
              />
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rating</span>
                <span className="font-medium">{rating ? `${rating.toFixed(1)} / 5` : 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reviews</span>
                <span className="font-medium">{contractor.totalReviews || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Assignments</span>
                <span className="font-medium">
                  {((contractor as any).assignments as unknown[])?.length || 0}
                </span>
              </div>
              {contractor.yearsExperience != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Experience</span>
                  <span className="font-medium">{contractor.yearsExperience} years</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Member Since</span>
                <span className="font-medium">
                  {new Date(contractor.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Certifications */}
          {certifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Certifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {certifications.map((cert, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <Shield className="h-4 w-4 text-green-600" />
                      <span>{cert}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

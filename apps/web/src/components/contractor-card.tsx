'use client';

import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from '@openlintel/ui';
import { Star, MapPin, Briefcase, BadgeCheck } from 'lucide-react';

interface ContractorCardProps {
  id: string;
  name: string;
  company?: string | null;
  city?: string | null;
  specializations?: string[] | null;
  rating?: number | null;
  totalReviews?: number | null;
  profileImageUrl?: string | null;
  verified?: boolean | null;
}

function renderStars(rating: number) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />,
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400/50 text-amber-400" />,
      );
    } else {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 text-gray-300" />,
      );
    }
  }
  return stars;
}

export function ContractorCard({
  id,
  name,
  company,
  city,
  specializations,
  rating,
  totalReviews,
  profileImageUrl,
  verified,
}: ContractorCardProps) {
  return (
    <Link href={`/marketplace/${id}`}>
      <Card className="h-full transition-colors hover:border-primary/30 hover:bg-gray-50/50">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <Briefcase className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">{name}</CardTitle>
                {verified && (
                  <BadgeCheck className="h-4 w-4 text-blue-500" />
                )}
              </div>
              {company && (
                <CardDescription>{company}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Rating */}
          {rating != null && (
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center gap-0.5">{renderStars(rating)}</div>
              <span className="text-sm font-medium">{rating.toFixed(1)}</span>
              {totalReviews != null && (
                <span className="text-xs text-muted-foreground">
                  ({totalReviews} review{totalReviews !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          )}

          {/* City */}
          {city && (
            <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {city}
            </div>
          )}

          {/* Specializations */}
          {specializations && specializations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {specializations.slice(0, 4).map((spec) => (
                <Badge key={spec} variant="secondary" className="text-[10px]">
                  {spec}
                </Badge>
              ))}
              {specializations.length > 4 && (
                <Badge variant="outline" className="text-[10px]">
                  +{specializations.length - 4} more
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

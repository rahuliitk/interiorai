'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
} from '@openlintel/ui';
import { ArrowLeft, Trash2, Palette } from 'lucide-react';

export default function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id: projectId, roomId } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: room, isLoading } = trpc.room.byId.useQuery({ id: roomId });

  const deleteRoom = trpc.room.delete.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
      router.push(`/project/${projectId}`);
    },
  });

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
            <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dimensions</CardTitle>
          </CardHeader>
          <CardContent>
            {room.lengthMm && room.widthMm ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Length</span>
                  <span>{room.lengthMm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Width</span>
                  <span>{room.widthMm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Height</span>
                  <span>{room.heightMm ?? 2700} mm</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Area</span>
                  <span>
                    {((room.lengthMm * room.widthMm) / 1_000_000).toFixed(2)} m²
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Dimensions not set. Upload a floor plan or enter manually.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design Variants</CardTitle>
            <CardDescription>
              {room.designVariants.length} variant{room.designVariants.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {room.designVariants.length === 0 ? (
              <div className="text-center py-4">
                <Palette className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">
                  No designs yet. Generate AI design variants.
                </p>
                <Button size="sm" disabled>
                  Generate Designs (Coming Soon)
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {room.designVariants.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{variant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {variant.style} · {variant.budgetTier}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {new Date(variant.createdAt).toLocaleDateString()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

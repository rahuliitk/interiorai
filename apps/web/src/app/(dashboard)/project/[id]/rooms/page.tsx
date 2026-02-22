'use client';

import { use } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from '@openlintel/ui';
import { ArrowLeft } from 'lucide-react';

export default function RoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isLoading } = trpc.project.byId.useQuery({ id });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (!project) return <p className="text-muted-foreground">Project not found.</p>;

  return (
    <div>
      <Link
        href={`/project/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to project
      </Link>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Rooms — {project.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {project.rooms.map((room) => (
          <Link key={room.id} href={`/project/${id}/rooms/${room.id}`}>
            <Card className="transition-shadow hover:shadow-md cursor-pointer">
              <CardHeader>
                <CardTitle className="text-base">{room.name}</CardTitle>
                <CardDescription>
                  {room.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {room.lengthMm && room.widthMm ? (
                  <p className="text-sm text-muted-foreground">
                    {room.lengthMm} × {room.widthMm} mm
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Dimensions not set</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

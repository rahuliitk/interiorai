'use client';

import { useState } from 'react';
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
  Input,
  Separator,
} from '@openlintel/ui';
import {
  Heart,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
} from 'lucide-react';

const STYLES = ['modern', 'traditional', 'contemporary', 'minimalist', 'industrial'] as const;
const PAGE_SIZE = 12;

export default function GalleryPage() {
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.community.browseGallery.useQuery({
    search: search || undefined,
    style,
    limit: PAGE_SIZE,
    offset,
  });

  const likeEntry = trpc.community.likeGalleryEntry.useMutation({
    onSuccess: () => {
      utils.community.browseGallery.invalidate();
    },
  });

  const entries = (data as any)?.items ?? (data as any)?.entries ?? (Array.isArray(data) ? data : []);
  const totalCount = (data as any)?.total ?? (data as any)?.totalCount ?? 0;
  const hasMore = offset + PAGE_SIZE < totalCount || entries.length === PAGE_SIZE;

  const handleStyleFilter = (s: string) => {
    setStyle(style === s ? undefined : s);
    setOffset(0);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Project Gallery</h1>
        <p className="text-sm text-muted-foreground">
          Browse inspiring interior design projects shared by the community.
        </p>
      </div>

      {/* Search and filters */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search gallery..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Style:</span>
          {STYLES.map((s) => (
            <Button
              key={s}
              variant={style === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStyleFilter(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
          {style && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStyle(undefined);
                setOffset(0);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Gallery grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/3]" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : entries.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {entries.map((entry: any) => (
              <Card key={entry.id} className="overflow-hidden">
                {/* Thumbnail */}
                <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                  {entry.imageUrl || entry.thumbnailUrl ? (
                    <img
                      src={entry.imageUrl || entry.thumbnailUrl}
                      alt={entry.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
                  )}
                </div>

                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold truncate">{entry.title}</h3>
                  {entry.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {entry.description}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {entry.style && (
                      <Badge variant="secondary" className="capitalize text-[10px]">
                        {entry.style}
                      </Badge>
                    )}
                    {entry.tags?.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <Separator className="my-3" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="h-3.5 w-3.5" />
                      <span>{entry.likes ?? entry.likeCount ?? 0}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      disabled={likeEntry.isPending}
                      onClick={() => likeEntry.mutate({ id: entry.id })}
                    >
                      {likeEntry.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Heart className="mr-1 h-3.5 w-3.5" />
                          Like
                        </>
                      )}
                    </Button>
                  </div>
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
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {Math.floor(offset / PAGE_SIZE) + 1}
              {totalCount > 0 && ` of ${Math.ceil(totalCount / PAGE_SIZE)}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasMore}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </>
      ) : (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Projects Found</h2>
          <p className="text-sm text-muted-foreground">
            {search || style
              ? 'Try adjusting your search or filters to find more projects.'
              : 'The gallery is empty. Be the first to share a project!'}
          </p>
        </Card>
      )}
    </div>
  );
}

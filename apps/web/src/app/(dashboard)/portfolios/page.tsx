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
  Textarea,
  toast,
} from '@openlintel/ui';
import { Briefcase, Plus, Trash2, Loader2, FolderKanban } from 'lucide-react';

export default function PortfoliosPage() {
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: portfolios = [], isLoading } = trpc.portfolio.list.useQuery();

  const createPortfolio = trpc.portfolio.create.useMutation({
    onSuccess: () => {
      utils.portfolio.list.invalidate();
      setCreateOpen(false);
      setName('');
      setDescription('');
      toast({ title: 'Portfolio created', description: 'Your new portfolio is ready.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create portfolio', description: err.message, variant: 'destructive' });
    },
  });

  const deletePortfolio = trpc.portfolio.delete.useMutation({
    onSuccess: () => {
      utils.portfolio.list.invalidate();
      toast({ title: 'Portfolio deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete portfolio', description: err.message, variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createPortfolio.mutate({ name: name.trim(), description: description.trim() || undefined });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this portfolio?')) return;
    deletePortfolio.mutate({ id });
  };

  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolios</h1>
          <p className="text-sm text-muted-foreground">
            Group and manage multiple projects together. Track budgets, timelines, and bulk ordering opportunities.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Create Portfolio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Portfolio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="portfolio-name">Name</Label>
                <Input
                  id="portfolio-name"
                  placeholder="e.g. Mumbai Residential Projects"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portfolio-description">Description</Label>
                <Textarea
                  id="portfolio-description"
                  placeholder="Optional description for this portfolio..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createPortfolio.isPending || !name.trim()}
              >
                {createPortfolio.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Portfolio grid */}
      {portfolios.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio: any) => (
            <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
              <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{portfolio.name}</CardTitle>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(e, portfolio.id)}
                      disabled={deletePortfolio.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {portfolio.description && (
                    <CardDescription className="mt-1 line-clamp-2">
                      {portfolio.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <Briefcase className="mr-1 h-3 w-3" />
                      {portfolio.projectCount} project{portfolio.projectCount !== 1 ? 's' : ''}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(portfolio.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty state */
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Portfolios Yet</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Create a portfolio to group related projects together and unlock bulk ordering insights.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create Your First Portfolio
          </Button>
        </Card>
      )}
    </div>
  );
}

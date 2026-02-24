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
  Separator,
  Textarea,
  toast,
} from '@openlintel/ui';
import {
  Briefcase,
  Plus,
  Trash2,
  TrendingUp,
  Loader2,
  FolderKanban,
  Package,
} from 'lucide-react';

export default function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = use(params);
  const utils = trpc.useUtils();

  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: portfolio, isLoading: loadingPortfolio } = trpc.portfolio.get.useQuery({
    id: portfolioId,
  });

  const { data: stats, isLoading: loadingStats } = trpc.portfolio.dashboardStats.useQuery({
    id: portfolioId,
  });

  const { data: bulkOpportunities = [], isLoading: loadingBulk } =
    trpc.portfolio.bulkOrderOpportunities.useQuery({ id: portfolioId });

  const { data: allProjects = [] } = trpc.project.list.useQuery();

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addProject = trpc.portfolio.addProject.useMutation({
    onSuccess: () => {
      utils.portfolio.get.invalidate({ id: portfolioId });
      utils.portfolio.dashboardStats.invalidate({ id: portfolioId });
      utils.portfolio.bulkOrderOpportunities.invalidate({ id: portfolioId });
      utils.portfolio.list.invalidate();
      setAddProjectOpen(false);
      setSelectedProjectId('');
      toast({ title: 'Project added', description: 'The project has been linked to this portfolio.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to add project', description: err.message, variant: 'destructive' });
    },
  });

  const removeProject = trpc.portfolio.removeProject.useMutation({
    onSuccess: () => {
      utils.portfolio.get.invalidate({ id: portfolioId });
      utils.portfolio.dashboardStats.invalidate({ id: portfolioId });
      utils.portfolio.bulkOrderOpportunities.invalidate({ id: portfolioId });
      utils.portfolio.list.invalidate();
      toast({ title: 'Project removed' });
    },
    onError: (err) => {
      toast({ title: 'Failed to remove project', description: err.message, variant: 'destructive' });
    },
  });

  const updatePortfolio = trpc.portfolio.update.useMutation({
    onSuccess: () => {
      utils.portfolio.get.invalidate({ id: portfolioId });
      utils.portfolio.list.invalidate();
      setEditOpen(false);
      toast({ title: 'Portfolio updated' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update portfolio', description: err.message, variant: 'destructive' });
    },
  });

  const deletePortfolio = trpc.portfolio.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Portfolio deleted' });
      window.location.href = '/portfolios';
    },
    onError: (err) => {
      toast({ title: 'Failed to delete portfolio', description: err.message, variant: 'destructive' });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAddProject = () => {
    if (!selectedProjectId) return;
    addProject.mutate({ portfolioId, projectId: selectedProjectId });
  };

  const handleRemoveProject = (projectId: string) => {
    if (!confirm('Remove this project from the portfolio?')) return;
    removeProject.mutate({ portfolioId, projectId });
  };

  const handleOpenEdit = () => {
    if (!portfolio) return;
    setEditName(portfolio.name);
    setEditDescription(portfolio.description || '');
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    updatePortfolio.mutate({
      id: portfolioId,
      name: editName.trim(),
      description: editDescription.trim() || undefined,
    });
  };

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this portfolio? This cannot be undone.')) return;
    deletePortfolio.mutate({ id: portfolioId });
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const linkedProjectIds = new Set(
    (portfolio?.portfolioProjects ?? []).map((pp: any) => pp.projectId),
  );
  const availableProjects = allProjects.filter(
    (p: any) => !linkedProjectIds.has(p.id),
  );

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loadingPortfolio || loadingStats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">Portfolio Not Found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The portfolio you are looking for does not exist or you do not have access.
        </p>
        <Link href="/portfolios">
          <Button variant="outline">Back to Portfolios</Button>
        </Link>
      </div>
    );
  }

  const projects = portfolio.portfolioProjects ?? [];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/portfolios"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <FolderKanban className="h-4 w-4" />
        Back to Portfolios
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{portfolio.name}</h1>
          {portfolio.description && (
            <p className="mt-1 text-sm text-muted-foreground">{portfolio.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Edit dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleOpenEdit}>
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Portfolio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updatePortfolio.isPending || !editName.trim()}
                >
                  {updatePortfolio.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deletePortfolio.isPending}
          >
            {deletePortfolio.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Delete
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">
                    {stats.totalBudget.toLocaleString('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Budget</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.averageCompletion}%</p>
                  <p className="text-xs text-muted-foreground">Avg Completion</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.projectCount}</p>
                  <p className="text-xs text-muted-foreground">Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.roomCount}</p>
                  <p className="text-xs text-muted-foreground">Rooms</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Projects</CardTitle>
              <CardDescription>
                {projects.length} project{projects.length !== 1 ? 's' : ''} in this portfolio
              </CardDescription>
            </div>
            <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={availableProjects.length === 0}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Project to Portfolio</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {availableProjects.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Select a project</Label>
                      <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a project..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProjects.map((project: any) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                              {project.address ? ` - ${project.address}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      All your projects are already in this portfolio.
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddProjectOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddProject}
                    disabled={addProject.isPending || !selectedProjectId}
                  >
                    {addProject.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Project'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((pp: any, idx: number) => {
                const project = pp.project;
                const roomCount = project.rooms?.length ?? 0;
                return (
                  <div key={pp.projectId}>
                    {idx > 0 && <Separator className="mb-2" />}
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Briefcase className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <Link
                            href={`/project/${project.id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {project.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            {project.address && (
                              <span className="text-xs text-muted-foreground">{project.address}</span>
                            )}
                            <Badge variant="secondary" className="text-[10px]">
                              {roomCount} room{roomCount !== 1 ? 's' : ''}
                            </Badge>
                            {project.status && (
                              <Badge variant="outline" className="text-[10px]">
                                {project.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveProject(pp.projectId)}
                        disabled={removeProject.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Briefcase className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                No projects in this portfolio yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddProjectOpen(true)}
                disabled={availableProjects.length === 0}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Your First Project
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Order Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulk Order Opportunities</CardTitle>
          <CardDescription>
            Materials shared across multiple projects that could benefit from bulk ordering discounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingBulk ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : bulkOpportunities.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Material</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Quantity</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Projects</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Est. Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkOpportunities.map((opp: any, idx: number) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{opp.material}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {opp.totalQuantity.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Badge variant="secondary" className="text-[10px]">
                          {opp.projectCount} project{opp.projectCount !== 1 ? 's' : ''}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="font-medium text-green-600">
                          {opp.estimatedSavings.toLocaleString('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Package className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {projects.length < 2
                  ? 'Add at least two projects with BOM data to see bulk ordering opportunities.'
                  : 'No common materials found across projects. Generate BOMs for your projects to see opportunities.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

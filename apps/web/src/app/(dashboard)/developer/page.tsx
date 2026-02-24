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
  Separator,
  toast,
} from '@openlintel/ui';
import {
  Code2,
  Plus,
  Loader2,
  Copy,
  Key,
  ExternalLink,
} from 'lucide-react';

const AVAILABLE_SCOPES = [
  { id: 'projects:read', label: 'Projects (Read)' },
  { id: 'projects:write', label: 'Projects (Write)' },
  { id: 'bom:read', label: 'BOMs (Read)' },
  { id: 'bom:write', label: 'BOMs (Write)' },
] as const;

export default function DeveloperPortalPage() {
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [appName, setAppName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: apps = [], isLoading } = trpc.developerPortal.listApps.useQuery();

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createApp = trpc.developerPortal.createApp.useMutation({
    onSuccess: (data: any) => {
      utils.developerPortal.listApps.invalidate();
      setCreateOpen(false);
      setAppName('');
      setSelectedScopes([]);
      // Show the secret once
      const secret = data?.clientSecret ?? data?.secret ?? '';
      if (secret) {
        setNewSecret(secret);
        setSecretDialogOpen(true);
      } else {
        toast({ title: 'App created', description: 'Your new API app has been created.' });
      }
    },
    onError: (err) => {
      toast({ title: 'Failed to create app', description: err.message, variant: 'destructive' });
    },
  });

  const revokeApp = trpc.developerPortal.revokeApp.useMutation({
    onSuccess: () => {
      utils.developerPortal.listApps.invalidate();
      toast({ title: 'App revoked', description: 'The application has been revoked.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to revoke app', description: err.message, variant: 'destructive' });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCreateApp = () => {
    if (!appName.trim()) return;
    createApp.mutate({ name: appName.trim(), scopes: selectedScopes });
  };

  const handleToggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(newSecret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleRevokeApp = (appId: string) => {
    if (!confirm('Are you sure you want to revoke this app? This action cannot be undone.')) return;
    revokeApp.mutate({ id: appId });
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">API Portal</h1>
            <p className="text-sm text-muted-foreground">
              Manage your API applications and credentials.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/developer/docs">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1 h-4 w-4" />
              API Docs
            </Button>
          </Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Create App
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New App</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="app-name">App Name</Label>
                  <Input
                    id="app-name"
                    placeholder="My Integration"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="space-y-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label key={scope.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope.id)}
                          onChange={() => handleToggleScope(scope.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm">{scope.label}</span>
                        <code className="ml-auto text-xs text-muted-foreground">{scope.id}</code>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateApp}
                  disabled={createApp.isPending || !appName.trim()}
                >
                  {createApp.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create App'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* App cards grid */}
      {apps.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app: any) => (
            <Card key={app.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{app.name}</CardTitle>
                    <CardDescription className="mt-1">
                      Created{' '}
                      {new Date(app.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={app.status === 'active' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {app.status ?? 'active'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Client ID</p>
                  <p className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                    {app.clientId}
                  </p>
                </div>
                {app.rateLimitTier && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rate Limit Tier</p>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {app.rateLimitTier}
                    </Badge>
                  </div>
                )}
              </CardContent>
              <div className="border-t px-6 py-3 flex items-center justify-between">
                <Link
                  href={`/developer/${app.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Manage
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRevokeApp(app.id)}
                  disabled={revokeApp.isPending}
                >
                  Revoke
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Key className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Apps Yet</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first API application to get started with the OpenLintel API.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create Your First App
          </Button>
        </Card>
      )}

      {/* Secret display dialog (shown once after creation) */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>App Created Successfully</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                Save your client secret now. It will not be shown again.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Client Secret</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={newSecret}
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleCopySecret}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {secretCopied && (
                <p className="text-xs text-green-600">Copied to clipboard!</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecretDialogOpen(false)}>
              I have saved my secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

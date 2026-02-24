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
  Separator,
  toast,
} from '@openlintel/ui';
import {
  ArrowLeft,
  Copy,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  ExternalLink,
} from 'lucide-react';

export default function AppDetailPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = use(params);
  const utils = trpc.useUtils();

  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  const [addWebhookOpen, setAddWebhookOpen] = useState(false);
  const [webhookEventType, setWebhookEventType] = useState('');
  const [webhookTargetUrl, setWebhookTargetUrl] = useState('');

  const [clientIdCopied, setClientIdCopied] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: app, isLoading: loadingApp } = trpc.developerPortal.getApp.useQuery({ id: appId });

  const { data: webhooks = [], isLoading: loadingWebhooks } =
    trpc.developerPortal.listWebhooks.useQuery({ appId });

  const { data: usageStats, isLoading: loadingUsage } =
    trpc.developerPortal.getUsageStats.useQuery({ appId });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const rotateSecret = trpc.developerPortal.rotateSecret.useMutation({
    onSuccess: (data: any) => {
      setRotateConfirmOpen(false);
      const secret = data?.clientSecret ?? data?.secret ?? '';
      if (secret) {
        setNewSecret(secret);
        setSecretDialogOpen(true);
      }
      toast({ title: 'Secret rotated', description: 'Your new client secret has been generated.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to rotate secret', description: err.message, variant: 'destructive' });
    },
  });

  const createWebhook = trpc.developerPortal.createWebhook.useMutation({
    onSuccess: () => {
      utils.developerPortal.listWebhooks.invalidate({ appId });
      setAddWebhookOpen(false);
      setWebhookEventType('');
      setWebhookTargetUrl('');
      toast({ title: 'Webhook created' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create webhook', description: err.message, variant: 'destructive' });
    },
  });

  const testWebhook = trpc.developerPortal.testWebhook.useMutation({
    onSuccess: () => {
      toast({ title: 'Test webhook sent', description: 'A test payload has been delivered.' });
    },
    onError: (err) => {
      toast({ title: 'Webhook test failed', description: err.message, variant: 'destructive' });
    },
  });

  const deleteWebhook = trpc.developerPortal.deleteWebhook.useMutation({
    onSuccess: () => {
      utils.developerPortal.listWebhooks.invalidate({ appId });
      toast({ title: 'Webhook deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete webhook', description: err.message, variant: 'destructive' });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCopyClientId = async () => {
    if (!app?.clientId) return;
    try {
      await navigator.clipboard.writeText(app.clientId);
      setClientIdCopied(true);
      setTimeout(() => setClientIdCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
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

  const handleCreateWebhook = () => {
    if (!webhookEventType.trim() || !webhookTargetUrl.trim()) return;
    createWebhook.mutate({
      appId,
      eventType: webhookEventType.trim(),
      targetUrl: webhookTargetUrl.trim(),
    });
  };

  const handleDeleteWebhook = (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    deleteWebhook.mutate({ id: webhookId });
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loadingApp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Key className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">App Not Found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The application you are looking for does not exist or you do not have access.
        </p>
        <Link href="/developer">
          <Button variant="outline">Back to Portal</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/developer"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to API Portal
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
        <Badge
          variant={(app as any).status === 'active' ? 'default' : 'secondary'}
          className="capitalize"
        >
          {(app as any).status ?? 'active'}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Credentials card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" />
              Credentials
            </CardTitle>
            <CardDescription>Your application credentials for API access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Client ID</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={app.clientId}
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleCopyClientId}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {clientIdCopied && (
                <p className="text-xs text-green-600">Copied!</p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Client Secret</p>
                <p className="text-xs text-muted-foreground">
                  Rotate your secret if you believe it has been compromised.
                </p>
              </div>
              <Dialog open={rotateConfirmOpen} onOpenChange={setRotateConfirmOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <RefreshCw className="mr-1 h-4 w-4" />
                    Rotate Secret
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rotate Client Secret?</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                      This will invalidate your current client secret. All existing integrations
                      using the old secret will stop working. This action cannot be undone.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setRotateConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => rotateSecret.mutate({ id: appId })}
                      disabled={rotateSecret.isPending}
                    >
                      {rotateSecret.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          Rotating...
                        </>
                      ) : (
                        'Rotate Secret'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Usage stats card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage Statistics</CardTitle>
            <CardDescription>API usage overview for this application.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUsage ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : usageStats ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">
                    {(usageStats as any).totalRequests?.toLocaleString() ?? '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Requests</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">
                    {(usageStats as any).avgResponseTime != null
                      ? `${(usageStats as any).avgResponseTime}ms`
                      : '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Response</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">
                    {(usageStats as any).errorRate != null
                      ? `${((usageStats as any).errorRate * 100).toFixed(1)}%`
                      : '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">Error Rate</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No usage data available yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Webhooks section */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4" />
                Webhooks
              </CardTitle>
              <CardDescription>
                Receive real-time notifications when events occur.
              </CardDescription>
            </div>
            <Dialog open={addWebhookOpen} onOpenChange={setAddWebhookOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Webhook</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-event">Event Type</Label>
                    <Input
                      id="webhook-event"
                      placeholder="e.g. project.updated"
                      value={webhookEventType}
                      onChange={(e) => setWebhookEventType(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">Target URL</Label>
                    <Input
                      id="webhook-url"
                      placeholder="https://example.com/webhook"
                      value={webhookTargetUrl}
                      onChange={(e) => setWebhookTargetUrl(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddWebhookOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateWebhook}
                    disabled={
                      createWebhook.isPending ||
                      !webhookEventType.trim() ||
                      !webhookTargetUrl.trim()
                    }
                  >
                    {createWebhook.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Add Webhook'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingWebhooks ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (webhooks as any[]).length > 0 ? (
            <div className="space-y-2">
              {(webhooks as any[]).map((webhook: any, idx: number) => (
                <div key={webhook.id}>
                  {idx > 0 && <Separator className="mb-2" />}
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {webhook.eventType}
                        </Badge>
                        <Badge
                          variant={webhook.status === 'active' ? 'default' : 'secondary'}
                          className="text-[10px] capitalize"
                        >
                          {webhook.status ?? 'active'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground font-mono">
                        {webhook.targetUrl}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testWebhook.mutate({ id: webhook.id })}
                        disabled={testWebhook.isPending}
                      >
                        {testWebhook.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            Test
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        disabled={deleteWebhook.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Webhook className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No webhooks configured. Add one to receive real-time event notifications.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New secret display dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Client Secret</DialogTitle>
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
                <Input readOnly value={newSecret} className="font-mono text-sm" />
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

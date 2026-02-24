'use client';

import { use, useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge,
  Skeleton, Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Input, Label, Select, SelectTrigger,
  SelectValue, SelectContent, SelectItem, Textarea, Tabs, TabsList,
  TabsTrigger, Separator, toast,
} from '@openlintel/ui';
import {
  MessageSquare, Plus, Trash2, Loader2, ArrowLeft, Send, CheckCircle,
  Archive, Clock, Filter, Hash, AlertCircle, GitPullRequest, ThumbsUp,
  Lightbulb, Star, MessagesSquare,
} from 'lucide-react';

// ── Category configuration ─────────────────────────────────
const CATEGORIES = [
  { value: 'general', label: 'General', color: 'bg-gray-100 text-gray-800' },
  { value: 'design_decision', label: 'Design Decision', color: 'bg-blue-100 text-blue-800' },
  { value: 'issue', label: 'Issue', color: 'bg-red-100 text-red-800' },
  { value: 'change_request', label: 'Change Request', color: 'bg-orange-100 text-orange-800' },
  { value: 'approval', label: 'Approval', color: 'bg-green-100 text-green-800' },
] as const;

const CAT_ICONS: Record<string, React.ReactNode> = {
  general: <Hash className="h-3.5 w-3.5" />,
  design_decision: <Lightbulb className="h-3.5 w-3.5" />,
  issue: <AlertCircle className="h-3.5 w-3.5" />,
  change_request: <GitPullRequest className="h-3.5 w-3.5" />,
  approval: <ThumbsUp className="h-3.5 w-3.5" />,
};

const STATUSES = [
  { value: 'open', label: 'Open', icon: <Clock className="h-3.5 w-3.5" /> },
  { value: 'resolved', label: 'Resolved', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  { value: 'archived', label: 'Archived', icon: <Archive className="h-3.5 w-3.5" /> },
] as const;

const STATUS_CLS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-800',
  resolved: 'bg-violet-100 text-violet-800',
  archived: 'bg-gray-100 text-gray-600',
};

const catColor = (c: string) => CATEGORIES.find((x) => x.value === c)?.color ?? 'bg-gray-100 text-gray-800';
const catLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d: string | Date) {
  const t = new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${fmtDate(d)} at ${t}`;
}
function timeAgo(d: string | Date) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return dy < 7 ? `${dy}d ago` : fmtDate(d);
}

// ── Page Component ─────────────────────────────────────────
export default function CollaborationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<'threads' | 'decisions'>('threads');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selThread, setSelThread] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCat, setNewCat] = useState('general');
  const [newRoom, setNewRoom] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [isDecision, setIsDecision] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // ── Queries ──

  const threadsQ = trpc.collaboration.listThreads.useQuery({
    projectId, category: catFilter ?? undefined, status: statusFilter ?? undefined,
  });

  const detailQ = trpc.collaboration.getThread.useQuery(
    { id: selThread! }, { enabled: !!selThread },
  );
  const decisionsQ = trpc.collaboration.listDecisions.useQuery(
    { projectId }, { enabled: activeTab === 'decisions' },
  );
  const roomsQ = trpc.room.listByProject.useQuery({ projectId });

  // ── Mutations ──

  const inv = () => utils.collaboration.invalidate();
  const createThread = trpc.collaboration.createThread.useMutation({
    onSuccess: () => {
      toast({ title: 'Thread created', description: 'Your discussion thread has been created.' });
      inv();
      setCreateOpen(false);
      setNewTitle('');
      setNewCat('general');
      setNewRoom('');
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateThread = trpc.collaboration.updateThread.useMutation({
    onSuccess: () => {
      toast({ title: 'Thread updated' });
      inv();
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteThread = trpc.collaboration.deleteThread.useMutation({
    onSuccess: () => {
      toast({ title: 'Thread deleted' });
      inv();
      setSelThread(null);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const postMsg = trpc.collaboration.postMessage.useMutation({
    onSuccess: () => {
      setMsgContent('');
      setIsDecision(false);
      inv();
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [detailQ.data?.messages]);

  const threads = threadsQ.data ?? [];
  const decisions = decisionsQ.data ?? [];
  const detail = detailQ.data;
  const rooms = roomsQ.data ?? [];

  const doCreate = () => {
    if (!newTitle.trim()) return;
    createThread.mutate({ projectId, title: newTitle.trim(), category: newCat as any, roomId: newRoom || undefined });
  };
  const doPost = () => {
    if (!msgContent.trim() || !selThread) return;
    postMsg.mutate({ threadId: selThread, content: msgContent.trim(), isDecision });
  };
  const doStatus = (id: string, s: 'open' | 'resolved' | 'archived') => updateThread.mutate({ id, status: s });

  // ════════════════════════════════════════════════════════

  // Thread Detail View
  // ════════════════════════════════════════════════════════

  if (selThread && activeTab === 'threads') {
    const msgs = (detail?.messages as any[]) ?? [];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelThread(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {detailQ.isLoading ? <Skeleton className="h-6 w-48" /> : detail && (
            <div className="flex flex-1 items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{detail.title}</h1>
                <Badge className={catColor(detail.category)}>{catLabel(detail.category)}</Badge>
                <Badge className={STATUS_CLS[detail.status] ?? 'bg-gray-100'}>{detail.status}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {detail.status === 'open' && (
                  <Button variant="outline" size="sm" onClick={() => doStatus(detail.id, 'resolved')} disabled={updateThread.isPending}>
                    <CheckCircle className="mr-1 h-3.5 w-3.5" /> Resolve
                  </Button>
                )}
                {detail.status === 'resolved' && (
                  <Button variant="outline" size="sm" onClick={() => doStatus(detail.id, 'open')} disabled={updateThread.isPending}>
                    <Clock className="mr-1 h-3.5 w-3.5" /> Reopen
                  </Button>
                )}
                {detail.status !== 'archived' && (
                  <Button variant="outline" size="sm" onClick={() => doStatus(detail.id, 'archived')} disabled={updateThread.isPending}>
                    <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                  onClick={() => deleteThread.mutate({ id: detail.id })} disabled={deleteThread.isPending}>
                  {deleteThread.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {detail && (
          <Card><CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Created {fmtDateTime(detail.createdAt)}</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Updated {timeAgo(detail.updatedAt)}</span>
              {detail.roomId && (<><Separator orientation="vertical" className="h-4" /><span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" /> Room linked</span></>)}
              <Separator orientation="vertical" className="h-4" />
              <span>{msgs.length} messages</span>
            </div>
          </CardContent></Card>
        )}

        <Card className="flex flex-col" style={{ minHeight: 400 }}>
          <CardContent className="flex-1 overflow-y-auto pt-4 pb-2 space-y-3" style={{ maxHeight: 500 }}>
            {detailQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-16 w-full" /></div>
              ))
            ) : msgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <MessagesSquare className="mb-3 h-10 w-10" />
                <p className="text-sm">No messages yet. Start the conversation below.</p>
              </div>
            ) : msgs.map((m: any) => (
              <div key={m.id} className={`rounded-lg border p-3 ${m.isDecision ? 'border-amber-300 bg-amber-50' : 'border-border bg-card'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{m.userId?.slice(0, 8)}...</span>
                    {m.isDecision && <Badge className="bg-amber-100 text-amber-800 text-xs"><Star className="mr-1 h-3 w-3" /> Decision</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(m.createdAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                {m.attachmentKeys && (m.attachmentKeys as string[]).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(m.attachmentKeys as string[]).map((k: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{k}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </CardContent>

          {detail && detail.status !== 'archived' ? (<>
            <Separator />
            <div className="p-4 space-y-3">
              <Textarea placeholder="Write a message..." value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)} rows={3}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doPost(); }} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={isDecision} onChange={(e) => setIsDecision(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                  <Star className="h-3.5 w-3.5 text-amber-600" /> Mark as Decision
                </label>
                <Button size="sm" onClick={doPost} disabled={!msgContent.trim() || postMsg.isPending}>
                  {postMsg.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                  Send
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Press Ctrl+Enter or Cmd+Enter to send quickly</p>
            </div>
          </>) : detail && detail.status === 'archived' ? (<>
            <Separator />
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Archive className="inline-block mr-1 h-4 w-4" /> This thread is archived. Reopen it to post new messages.
            </div>
          </>) : null}
        </Card>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════

  // Main List View
  // ════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Collaboration Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discuss designs, track decisions, and manage change requests across your project.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New Thread</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Discussion Thread</DialogTitle>
              <DialogDescription>Start a new conversation thread for your project team.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="t-title">Title</Label>
                <Input id="t-title" placeholder="e.g. Kitchen cabinet finish decision"
                  value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-cat">Category</Label>
                <Select value={newCat} onValueChange={setNewCat}>
                  <SelectTrigger id="t-cat"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">{CAT_ICONS[c.value]} {c.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-room">Room (optional)</Label>
                <Select value={newRoom} onValueChange={setNewRoom}>
                  <SelectTrigger id="t-room"><SelectValue placeholder="No room selected" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {rooms.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={doCreate} disabled={!newTitle.trim() || createThread.isPending}>
                {createThread.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Create Thread
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="threads"><MessagesSquare className="mr-1 h-4 w-4" /> Threads</TabsTrigger>
          <TabsTrigger value="decisions"><Star className="mr-1 h-4 w-4" /> Decision Log</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Threads Tab ──────────────────────────────────── */}
      {activeTab === 'threads' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card><CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" /> Filters:
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant={catFilter === null ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                  onClick={() => setCatFilter(null)}>All Categories</Button>
                {CATEGORIES.map((c) => (
                  <Button key={c.value} variant={catFilter === c.value ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                    onClick={() => setCatFilter(catFilter === c.value ? null : c.value)}>
                    {CAT_ICONS[c.value]} <span className="ml-1">{c.label}</span>
                  </Button>
                ))}
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-1">
                <Button variant={statusFilter === null ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                  onClick={() => setStatusFilter(null)}>All Status</Button>
                {STATUSES.map((s) => (
                  <Button key={s.value} variant={statusFilter === s.value ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                    onClick={() => setStatusFilter(statusFilter === s.value ? null : s.value)}>
                    {s.icon} <span className="ml-1">{s.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent></Card>

          {/* Thread list */}
          {threadsQ.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><CardContent className="pt-4 pb-4">
                  <Skeleton className="h-5 w-2/3 mb-2" /><Skeleton className="h-4 w-1/3" />
                </CardContent></Card>
              ))}
            </div>
          ) : threads.length > 0 ? (
            <div className="space-y-2">
              {threads.map((t: any) => (
                <Card key={t.id} className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => setSelThread(t.id)}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-muted-foreground">{CAT_ICONS[t.category] ?? <Hash className="h-3.5 w-3.5" />}</span>
                          <h3 className="font-semibold text-sm truncate">{t.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-xs ${catColor(t.category)}`}>{catLabel(t.category)}</Badge>
                          <Badge className={`text-xs ${STATUS_CLS[t.status] ?? 'bg-gray-100 text-gray-800'}`}>{t.status}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {t.messageCount} {t.messageCount === 1 ? 'message' : 'messages'}
                          </span>
                          {t.roomId && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Hash className="h-3 w-3" /> Room linked
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                        <span className="text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</span>
                        <div className="flex gap-1">
                          {t.status === 'open' && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Resolve"
                              onClick={(e) => { e.stopPropagation(); doStatus(t.id, 'resolved'); }}>
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            title="Delete" onClick={(e) => { e.stopPropagation(); deleteThread.mutate({ id: t.id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <MessagesSquare className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Threads Found</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {catFilter || statusFilter
                  ? 'No threads match the current filters. Try adjusting or create a new thread.'
                  : 'Start a discussion thread to collaborate on project decisions, issues, and changes.'}
              </p>
              {!catFilter && !statusFilter ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> New Thread
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { setCatFilter(null); setStatusFilter(null); }}>
                  Clear Filters
                </Button>
              )}
            </Card>
          )}

          {/* Summary stats */}
          {threads.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card><CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{threads.length}</p>
                <p className="text-xs text-muted-foreground">Total Threads</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{threads.filter((t: any) => t.status === 'open').length}</p>
                <p className="text-xs text-muted-foreground">Open</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-violet-600">{threads.filter((t: any) => t.status === 'resolved').length}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{threads.reduce((s: number, t: any) => s + (t.messageCount ?? 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Total Messages</p>
              </CardContent></Card>
            </div>
          )}
        </div>
      )}

      {/* ── Decision Log Tab ─────────────────────────────── */}
      {activeTab === 'decisions' && (
        <div className="space-y-4">
          <Card><CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-600" /> Decision Log
            </CardTitle>
            <CardDescription>
              All messages marked as decisions across your project threads, sorted by most recent.
            </CardDescription>
          </CardHeader></Card>

          {decisionsQ.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="pt-4 pb-4">
                  <Skeleton className="h-4 w-1/4 mb-2" /><Skeleton className="h-12 w-full" />
                </CardContent></Card>
              ))}
            </div>
          ) : decisions.length > 0 ? (
            <div className="space-y-2">
              {decisions.map((d: any, idx: number) => (
                <Card key={d.id} className="border-amber-200 bg-amber-50/30 cursor-pointer hover:bg-amber-50/60 transition-colors"
                  onClick={() => { setSelThread(d.threadId); setActiveTab('threads'); }}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-100 text-amber-800 text-xs">
                          <Star className="mr-1 h-3 w-3" /> Decision #{decisions.length - idx}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Thread: {d.threadId?.slice(0, 8)}...</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(d.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{d.content}</p>
                    <p className="mt-2 text-xs text-muted-foreground">By {d.userId?.slice(0, 8)}... \u2014 Click to view thread</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Star className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Decisions Yet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                When posting a message in a thread, check &quot;Mark as Decision&quot; to log important decisions here.
              </p>
              <Button variant="outline" size="sm" onClick={() => setActiveTab('threads')}>
                <MessagesSquare className="mr-1 h-4 w-4" /> Go to Threads
              </Button>
            </Card>
          )}

          {decisions.length > 0 && (
            <Card><CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{decisions.length}</span>{' '}
                  {decisions.length === 1 ? 'decision' : 'decisions'} recorded across your project threads.
                </div>
                <Button variant="outline" size="sm" onClick={() => setActiveTab('threads')}>View All Threads</Button>
              </div>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Separator,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
  toast,
} from '@openlintel/ui';
import { Settings, Key, Plus, Trash2, Eye, EyeOff, ShieldCheck, Globe, Loader2 } from 'lucide-react';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
  { value: 'replicate', label: 'Replicate' },
] as const;

export default function SettingsPage() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>('openai');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const { data: keys = [] } = trpc.apiKey.list.useQuery();

  const createKey = trpc.apiKey.create.useMutation({
    onSuccess: () => {
      utils.apiKey.list.invalidate();
      setOpen(false);
      setProvider('openai');
      setLabel('');
      setApiKey('');
      setShowKey(false);
      toast({ title: 'API key added', description: 'Your key has been encrypted and stored.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to add key', description: err.message, variant: 'destructive' });
    },
  });

  const deleteKey = trpc.apiKey.delete.useMutation({
    onSuccess: () => {
      utils.apiKey.list.invalidate();
      toast({ title: 'API key deleted' });
    },
  });

  const handleCreate = () => {
    if (!label.trim() || !apiKey.trim()) return;
    createKey.mutate({
      provider: provider as 'openai' | 'anthropic' | 'google' | 'replicate',
      label: label.trim(),
      key: apiKey.trim(),
    });
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Account
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span>{session?.user?.name ?? '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{session?.user?.email ?? '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Key className="h-4 w-4" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Manage your LLM provider API keys for AI design generation.
                </CardDescription>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    Add Key
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add API Key</DialogTitle>
                    <DialogDescription>
                      Add an LLM provider API key. It will be encrypted at rest.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="key-provider">Provider</Label>
                      <Select value={provider} onValueChange={setProvider}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="key-label">Label</Label>
                      <Input
                        id="key-label"
                        placeholder="e.g. Production Key"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="key-value">API Key</Label>
                      <div className="relative">
                        <Input
                          id="key-value"
                          type={showKey ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={createKey.isPending || !label.trim() || !apiKey.trim()}
                    >
                      {createKey.isPending ? 'Adding...' : 'Add Key'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No API keys configured. Add one to enable AI design generation.
              </p>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{key.label}</span>
                        <Badge variant="secondary" className="text-xs">
                          {PROVIDERS.find((p) => p.value === key.provider)?.label ?? key.provider}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <code>{key.keyPrefix}</code>
                        <span>Added {new Date(key.createdAt).toLocaleDateString()}</span>
                        {key.lastUsedAt && (
                          <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('Delete this API key?')) {
                          deleteKey.mutate({ id: key.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Keys are encrypted at rest using AES-256-GCM. Only the key prefix is visible for identification.
              </p>
            </div>
          </CardContent>
        </Card>
        <LocalizationCard />
      </div>
    </div>
  );
}

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
] as const;

const UNIT_SYSTEMS = [
  { value: 'metric', label: 'Metric (mm, m, sq m)' },
  { value: 'imperial', label: 'Imperial (inches, ft, sq ft)' },
] as const;

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
] as const;

function LocalizationCard() {
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.localization.getPreferences.useQuery();

  const [currency, setCurrency] = useState<string>('');
  const [unitSystem, setUnitSystem] = useState<string>('');
  const [locale, setLocale] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  // Initialize form state from server data
  if (prefs && !initialized) {
    setCurrency(prefs.preferredCurrency ?? 'USD');
    setUnitSystem(prefs.preferredUnitSystem ?? 'metric');
    setLocale(prefs.preferredLocale ?? 'en');
    setInitialized(true);
  }

  const savePrefs = trpc.localization.setPreferences.useMutation({
    onSuccess: () => {
      utils.localization.getPreferences.invalidate();
      toast({ title: 'Preferences saved' });
    },
    onError: (err) => {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    savePrefs.mutate({ currency, unitSystem, locale });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Localization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" />
          Localization
        </CardTitle>
        <CardDescription>Set your preferred currency, units, and language.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Unit System</Label>
          <Select value={unitSystem} onValueChange={setUnitSystem}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_SYSTEMS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSave} disabled={savePrefs.isPending}>
          {savePrefs.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Preferences'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DialogFooter,
} from '@openlintel/ui';
import { CreditCard, Loader2 } from 'lucide-react';

interface PaymentFormProps {
  onSubmit: (data: {
    amount: number;
    currency: string;
    paymentProvider: string;
    milestoneId?: string;
  }) => void;
  isPending?: boolean;
  onCancel?: () => void;
  milestones?: { id: string; name: string }[];
  defaultMilestoneId?: string;
}

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'INR', label: 'INR (Rs.)' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
];

const PROVIDERS = [
  { value: 'stripe', label: 'Stripe', description: 'Credit/debit cards, bank transfers' },
  { value: 'razorpay', label: 'Razorpay', description: 'UPI, netbanking, cards (India)' },
];

export function PaymentForm({
  onSubmit,
  isPending,
  onCancel,
  milestones = [],
  defaultMilestoneId,
}: PaymentFormProps) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [provider, setProvider] = useState('stripe');
  const [milestoneId, setMilestoneId] = useState(defaultMilestoneId ?? '');

  const parsedAmount = parseFloat(amount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) return;
    onSubmit({
      amount: parsedAmount,
      currency,
      paymentProvider: provider,
      milestoneId: milestoneId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Milestone selection */}
      {milestones.length > 0 && (
        <div className="space-y-2">
          <Label>Linked Milestone</Label>
          <Select value={milestoneId} onValueChange={setMilestoneId}>
            <SelectTrigger>
              <SelectValue placeholder="Select milestone (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No milestone</SelectItem>
              {milestones.map((ms) => (
                <SelectItem key={ms.id} value={ms.id}>
                  {ms.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Amount</Label>
          <Input
            id="payment-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
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
      </div>

      {/* Provider selection */}
      <div className="space-y-2">
        <Label>Payment Provider</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setProvider(p.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                provider === p.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Payment summary */}
      {parsedAmount > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Payment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>
                  {currency} {parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span className="capitalize">{provider}</span>
              </div>
              {milestoneId && milestones.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Milestone</span>
                  <span>{milestones.find((m) => m.id === milestoneId)?.name || '-'}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>
                  {currency} {parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending || parsedAmount <= 0}>
          {isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-1 h-4 w-4" />
              Create Payment
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

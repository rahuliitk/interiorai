'use client';

import { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  CardContent,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
} from '@openlintel/ui';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentProvider?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

interface PaymentMilestoneProps {
  milestoneName: string;
  amountDue: number;
  currency?: string;
  status: string;
  payments?: Payment[];
  onPayNow?: (provider: string) => void;
  isPaying?: boolean;
}

const STATUS_BADGES: Record<string, { variant: 'secondary' | 'default' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'secondary', label: 'Pending' },
  processing: { variant: 'default', label: 'Processing' },
  completed: { variant: 'outline', label: 'Paid' },
  overdue: { variant: 'destructive', label: 'Overdue' },
};

export function PaymentMilestone({
  milestoneName,
  amountDue,
  currency = 'USD',
  status,
  payments = [],
  onPayNow,
  isPaying,
}: PaymentMilestoneProps) {
  const [selectedProvider, setSelectedProvider] = useState('stripe');
  const [expanded, setExpanded] = useState(false);

  const badge = STATUS_BADGES[status] || STATUS_BADGES.pending;
  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, amountDue - totalPaid);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium">{milestoneName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Amount due: {currency} {amountDue.toLocaleString()}
            </p>
            {totalPaid > 0 && (
              <p className="text-xs text-green-600">
                Paid: {currency} {totalPaid.toLocaleString()} | Remaining: {currency}{' '}
                {remaining.toLocaleString()}
              </p>
            )}
          </div>
          <Badge variant={badge.variant} className="text-xs">
            {badge.label}
          </Badge>
        </div>

        {status !== 'completed' && remaining > 0 && onPayNow && (
          <div className="mt-3 flex items-center gap-2">
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="razorpay">Razorpay</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              onClick={() => onPayNow(selectedProvider)}
              disabled={isPaying}
            >
              {isPaying ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-1 h-3 w-3" />
                  Pay Now
                </>
              )}
            </Button>
          </div>
        )}

        {/* Payment history toggle */}
        {payments.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {payments.length} payment{payments.length !== 1 ? 's' : ''}
            </button>

            {expanded && (
              <div className="mt-2 space-y-2">
                <Separator />
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {payment.status === 'completed' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Clock className="h-3 w-3 text-yellow-500" />
                      )}
                      <span>
                        {payment.currency} {payment.amount.toLocaleString()}
                      </span>
                      {payment.paymentProvider && (
                        <Badge variant="outline" className="text-[9px] px-1">
                          {payment.paymentProvider}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground">
                      {payment.paidAt
                        ? new Date(payment.paidAt).toLocaleDateString()
                        : new Date(payment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

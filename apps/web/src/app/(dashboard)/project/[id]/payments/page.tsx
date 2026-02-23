'use client';

import { use, useState, useMemo } from 'react';
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
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
  toast,
} from '@openlintel/ui';
import {
  CreditCard,
  Plus,
  Receipt,
  FileText,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { PaymentMilestone } from '@/components/payment-milestone';
import { PaymentForm } from '@/components/payment-form';

export default function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const { data: payments = [], isLoading: loadingPayments } =
    trpc.payment.listByProject.useQuery({ projectId });
  const { data: purchaseOrders = [], isLoading: loadingOrders } =
    trpc.payment.listOrders.useQuery({ projectId });
  const { data: invoices = [], isLoading: loadingInvoices } =
    trpc.payment.listInvoices.useQuery({ projectId });
  const { data: schedules = [] } = trpc.schedule.getByProject.useQuery({ projectId });

  const createPayment = trpc.payment.create.useMutation({
    onSuccess: () => {
      utils.payment.listByProject.invalidate({ projectId });
      setPaymentDialogOpen(false);
      toast({ title: 'Payment created', description: 'The payment has been recorded.' });
    },
    onError: () => {
      toast({ title: 'Payment failed', variant: 'destructive' });
    },
  });

  // Compute milestones from schedule
  const milestones = useMemo(() => {
    const schedule = schedules[0];
    if (!schedule?.milestones?.length) return [];
    return schedule.milestones.map((ms: Record<string, unknown>) => ({
      id: ms.id as string,
      name: (ms.name as string) || 'Unnamed Milestone',
    }));
  }, [schedules]);

  // Summary stats
  const totalBilled = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingAmount = payments
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const orderTotal = purchaseOrders.reduce((sum, po) => sum + (Number(po.totalAmount) || 0), 0);

  const isLoading = loadingPayments || loadingOrders || loadingInvoices;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Track payments, purchase orders, and invoices
          </p>
        </div>
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New Payment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Payment</DialogTitle>
              <DialogDescription>Record a new payment for this project.</DialogDescription>
            </DialogHeader>
            <PaymentForm
              milestones={milestones}
              onSubmit={(data) => {
                createPayment.mutate({
                  projectId,
                  amount: data.amount,
                  currency: data.currency,
                  paymentProvider: data.paymentProvider,
                  milestoneId: data.milestoneId,
                });
              }}
              isPending={createPayment.isPending}
              onCancel={() => setPaymentDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalBilled.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Billed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalPaid.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Paid</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">${pendingAmount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">${orderTotal.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">PO Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">
            <CreditCard className="mr-1 h-3.5 w-3.5" />
            Payments ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="orders">
            <ShoppingBag className="mr-1 h-3.5 w-3.5" />
            Purchase Orders ({purchaseOrders.length})
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="mr-1 h-3.5 w-3.5" />
            Invoices ({invoices.length})
          </TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4">
          {payments.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <CreditCard className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Payments Yet</h2>
              <p className="text-sm text-muted-foreground">
                Create a payment to start tracking project finances.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => {
                const milestonePayments = payments.filter(
                  (p) => p.milestoneId === payment.milestoneId && payment.milestoneId,
                );
                return (
                  <PaymentMilestone
                    key={payment.id}
                    milestoneName={
                      (payment.milestone as { name?: string } | null)?.name ||
                      `Payment #${payment.id.slice(0, 8)}`
                    }
                    amountDue={Number(payment.amount) || 0}
                    currency={payment.currency || 'USD'}
                    status={payment.status || 'pending'}
                    payments={milestonePayments.length > 0 ? milestonePayments.map((p) => ({
                      id: p.id,
                      amount: Number(p.amount) || 0,
                      currency: p.currency || 'USD',
                      status: p.status || 'pending',
                      paymentProvider: p.paymentProvider,
                      paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
                      createdAt: new Date(p.createdAt).toISOString(),
                    })) : [{
                      id: payment.id,
                      amount: Number(payment.amount) || 0,
                      currency: payment.currency || 'USD',
                      status: payment.status || 'pending',
                      paymentProvider: payment.paymentProvider,
                      paidAt: payment.paidAt ? new Date(payment.paidAt).toISOString() : null,
                      createdAt: new Date(payment.createdAt).toISOString(),
                    }]}
                    onPayNow={(provider) => {
                      toast({
                        title: `Redirecting to ${provider}`,
                        description: 'Payment gateway integration will handle checkout.',
                      });
                    }}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Purchase Orders Tab */}
        <TabsContent value="orders" className="mt-4">
          {purchaseOrders.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Purchase Orders</h2>
              <p className="text-sm text-muted-foreground">
                Purchase orders will appear here when created from the BOM.
              </p>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">PO #</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vendor</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((po) => (
                        <tr key={po.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{po.id.slice(0, 8)}</td>
                          <td className="px-3 py-2">
                            {(po.vendor as { name?: string } | null)?.name || 'N/A'}
                          </td>
                          <td className="px-3 py-2">
                            ${(Number(po.totalAmount) || 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                po.status === 'delivered'
                                  ? 'outline'
                                  : po.status === 'cancelled'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                              className="text-xs"
                            >
                              {po.status || 'draft'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {new Date(po.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4">
          {invoices.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Receipt className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Invoices</h2>
              <p className="text-sm text-muted-foreground">
                Invoices will be generated automatically from payment milestones.
              </p>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            Invoice #{invoice.invoiceNumber || invoice.id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(invoice.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          ${(Number(invoice.totalAmount) || 0).toLocaleString()}
                        </span>
                        <Badge
                          variant={
                            invoice.status === 'paid'
                              ? 'outline'
                              : invoice.status === 'overdue'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="text-xs"
                        >
                          {invoice.status || 'draft'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

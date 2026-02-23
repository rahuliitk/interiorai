'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Badge,
  Input,
  Label,
  toast,
} from '@openlintel/ui';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';

interface ApprovalBannerProps {
  projectId: string;
}

export function ApprovalBanner({ projectId }: ApprovalBannerProps) {
  const [expanded, setExpanded] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();

  const { data: approvals = [] } = trpc.notification.listApprovals.useQuery({ projectId });

  const reviewApproval = trpc.notification.reviewApproval.useMutation({
    onSuccess: (_, variables) => {
      utils.notification.listApprovals.invalidate({ projectId });
      const statusLabel =
        variables.status === 'approved'
          ? 'approved'
          : variables.status === 'rejected'
            ? 'rejected'
            : 'revision requested';
      toast({ title: `Item ${statusLabel}` });
    },
    onError: () => {
      toast({ title: 'Review failed', variant: 'destructive' });
    },
  });

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  if (pendingApprovals.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {pendingApprovals.length} pending approval{pendingApprovals.length !== 1 ? 's' : ''}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            Action Required
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-600" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-3 dark:border-amber-900">
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-lg border border-amber-100 bg-white p-3 dark:border-amber-800 dark:bg-amber-950/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <p className="text-sm font-medium">
                      {approval.targetType} Approval
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Requested{' '}
                    {new Date(approval.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {' '}for {approval.targetType} #{(approval.targetId as string)?.slice(0, 8)}
                  </p>
                </div>
              </div>

              {/* Notes input */}
              <div className="mt-3 space-y-2">
                <Label htmlFor={`notes-${approval.id}`} className="text-xs">
                  Review Notes (optional)
                </Label>
                <Input
                  id={`notes-${approval.id}`}
                  placeholder="Add notes for the requester..."
                  className="h-8 text-xs"
                  value={reviewNotes[approval.id] || ''}
                  onChange={(e) =>
                    setReviewNotes({ ...reviewNotes, [approval.id]: e.target.value })
                  }
                />
              </div>

              {/* Action buttons */}
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 bg-green-600 text-xs hover:bg-green-700"
                  onClick={() =>
                    reviewApproval.mutate({
                      id: approval.id,
                      status: 'approved',
                      notes: reviewNotes[approval.id] || undefined,
                    })
                  }
                  disabled={reviewApproval.isPending}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() =>
                    reviewApproval.mutate({
                      id: approval.id,
                      status: 'rejected',
                      notes: reviewNotes[approval.id] || undefined,
                    })
                  }
                  disabled={reviewApproval.isPending}
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    reviewApproval.mutate({
                      id: approval.id,
                      status: 'revision_requested',
                      notes: reviewNotes[approval.id] || undefined,
                    })
                  }
                  disabled={reviewApproval.isPending}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Request Revision
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

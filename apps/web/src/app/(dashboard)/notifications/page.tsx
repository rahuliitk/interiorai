'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
} from '@openlintel/ui';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  CreditCard,
  CalendarDays,
  AlertTriangle,
  FileText,
  Info,
} from 'lucide-react';

const TYPE_ICONS: Record<string, typeof Bell> = {
  payment: CreditCard,
  schedule: CalendarDays,
  comment: MessageSquare,
  approval: FileText,
  alert: AlertTriangle,
  info: Info,
};

function getNotificationIcon(type: string | null | undefined) {
  const Icon = TYPE_ICONS[type || ''] || Bell;
  return Icon;
}

export default function NotificationsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: allNotifications = [], isLoading } = trpc.notification.list.useQuery({
    limit: 100,
    unreadOnly: false,
  });

  const { data: unreadNotifications = [] } = trpc.notification.list.useQuery({
    limit: 100,
    unreadOnly: true,
  });

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
      toast({ title: 'All notifications marked as read' });
    },
  });

  const unreadCount = unreadNotifications.length;

  const handleNotificationClick = (notification: typeof allNotifications[number]) => {
    if (!notification.read) {
      markRead.mutate({ id: notification.id });
    }
    // Navigate to linked resource if available
    if (notification.link) {
      router.push(notification.link);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'You are all caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="mr-1 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all">
            All ({allNotifications.length})
          </TabsTrigger>
          <TabsTrigger value="unread">
            Unread ({unreadCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {renderNotificationList(allNotifications)}
        </TabsContent>
        <TabsContent value="unread" className="mt-4">
          {renderNotificationList(unreadNotifications)}
        </TabsContent>
      </Tabs>
    </div>
  );

  function renderNotificationList(items: typeof allNotifications) {
    if (items.length === 0) {
      return (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <BellOff className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">
            {filter === 'unread' ? 'No Unread Notifications' : 'No Notifications'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {filter === 'unread'
              ? 'You have read all your notifications.'
              : 'Notifications will appear here when there are updates to your projects.'}
          </p>
        </Card>
      );
    }

    return (
      <div className="space-y-2">
        {items.map((notification) => {
          const Icon = getNotificationIcon(notification.type as string);
          return (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-colors hover:bg-gray-50/80 ${
                !notification.read ? 'border-l-4 border-l-primary bg-blue-50/30' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="flex items-start gap-4 py-4">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    !notification.read ? 'bg-primary/10' : 'bg-gray-100'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      !notification.read ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm ${
                        !notification.read ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {notification.title || 'Notification'}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {!notification.read && (
                        <Badge className="px-1.5 py-0 text-[10px]">New</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(new Date(notification.createdAt))}
                      </span>
                    </div>
                  </div>
                  {notification.message && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {notification.link && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-primary">
                        <ExternalLink className="h-2.5 w-2.5" />
                        View details
                      </span>
                    )}
                    {!notification.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead.mutate({ id: notification.id });
                        }}
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <Check className="h-2.5 w-2.5" />
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

'use client';

import { useState } from 'react';
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
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
  Separator,
} from '@openlintel/ui';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  UserCog,
  Ban,
  CheckCircle2,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listUsers.useQuery(
    {
      search: debouncedSearch || undefined,
      role: roleFilter !== 'all' ? roleFilter : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { retry: false },
  );

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: (_, variables) => {
      utils.admin.listUsers.invalidate();
      toast({
        title: 'Role updated',
        description: `User role changed to ${variables.role}.`,
      });
    },
    onError: (err) => {
      toast({
        title: 'Failed to update role',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const toggleUserStatus = trpc.admin.toggleUserStatus.useMutation({
    onSuccess: (_, variables) => {
      utils.admin.listUsers.invalidate();
      toast({
        title: variables.enabled ? 'User enabled' : 'User disabled',
        description: variables.enabled
          ? 'User can now access the platform.'
          : 'User has been disabled.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Failed to update user status',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(0);
    // Simple debounce via timeout
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
    return () => clearTimeout(timeout);
  };

  const users = data?.users ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Manage platform users, roles, and access
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="search-users">Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search-users"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-[160px] space-y-2">
              <Label>Role Filter</Label>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Users
            {!isLoading && (
              <Badge variant="secondary" className="ml-2">
                {totalCount}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {totalPages > 1
              ? `Page ${page + 1} of ${totalPages}`
              : `${totalCount} user${totalCount !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {debouncedSearch
                ? 'No users match your search.'
                : 'No users found.'}
            </p>
          ) : (
            <>
              {/* Table header */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Created
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Projects
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Role
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-3 py-3 font-medium">
                          {user.name ?? 'Unnamed'}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {user.projectsCount}
                        </td>
                        <td className="px-3 py-3">
                          <Select
                            value={user.role}
                            onValueChange={(role) =>
                              updateRole.mutate({ userId: user.id, role })
                            }
                          >
                            <SelectTrigger className="h-8 w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">
                                <div className="flex items-center gap-1">
                                  <UserCog className="h-3 w-3" />
                                  User
                                </div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-1">
                                  <Shield className="h-3 w-3" />
                                  Admin
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={user.enabled ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {user.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                confirm(
                                  user.enabled
                                    ? 'Disable this user? They will lose access.'
                                    : 'Enable this user? They will regain access.',
                                )
                              ) {
                                toggleUserStatus.mutate({
                                  userId: user.id,
                                  enabled: !user.enabled,
                                });
                              }
                            }}
                          >
                            {user.enabled ? (
                              <Ban className="h-4 w-4 text-red-500" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {page * PAGE_SIZE + 1}–
                      {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {page + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

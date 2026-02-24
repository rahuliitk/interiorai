'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@openlintel/ui';
import { Code2, Key, Webhook } from 'lucide-react';
import Link from 'next/link';

const ENDPOINT_GROUPS = [
  {
    name: 'Projects',
    description: 'Create, read, update, and delete interior design projects.',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects', description: 'List all projects' },
      { method: 'POST', path: '/api/v1/projects', description: 'Create a new project' },
      { method: 'GET', path: '/api/v1/projects/:id', description: 'Get project details' },
      { method: 'PUT', path: '/api/v1/projects/:id', description: 'Update a project' },
      { method: 'DELETE', path: '/api/v1/projects/:id', description: 'Delete a project' },
    ],
  },
  {
    name: 'BOMs',
    description: 'Manage Bills of Materials for project rooms.',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects/:id/bom', description: 'Get BOM for a project' },
      { method: 'POST', path: '/api/v1/projects/:id/bom/generate', description: 'Generate BOM from room designs' },
      { method: 'PUT', path: '/api/v1/bom/:bomId/items/:itemId', description: 'Update a BOM line item' },
      { method: 'DELETE', path: '/api/v1/bom/:bomId/items/:itemId', description: 'Remove a BOM line item' },
    ],
  },
  {
    name: 'Schedules',
    description: 'Manage project schedules and milestones.',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects/:id/schedule', description: 'Get project schedule' },
      { method: 'POST', path: '/api/v1/projects/:id/schedule/tasks', description: 'Add a schedule task' },
      { method: 'PUT', path: '/api/v1/schedule/tasks/:taskId', description: 'Update a schedule task' },
      { method: 'DELETE', path: '/api/v1/schedule/tasks/:taskId', description: 'Delete a schedule task' },
    ],
  },
  {
    name: 'Payments',
    description: 'Track and manage project payments and invoices.',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects/:id/payments', description: 'List payments for a project' },
      { method: 'POST', path: '/api/v1/projects/:id/payments', description: 'Record a payment' },
      { method: 'GET', path: '/api/v1/payments/:paymentId', description: 'Get payment details' },
      { method: 'PUT', path: '/api/v1/payments/:paymentId', description: 'Update payment status' },
    ],
  },
];

const WEBHOOK_EVENTS = [
  { event: 'project.created', description: 'A new project has been created.' },
  { event: 'project.updated', description: 'A project has been updated.' },
  { event: 'project.deleted', description: 'A project has been deleted.' },
  { event: 'bom.generated', description: 'A BOM has been generated for a project.' },
  { event: 'payment.received', description: 'A payment has been recorded.' },
  { event: 'schedule.task.completed', description: 'A schedule task has been marked complete.' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PUT: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default function ApiDocsPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">API Documentation</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete reference for the OpenLintel REST API. Use these endpoints to integrate
          with your own applications and workflows.
        </p>
        <div className="mt-2">
          <Link
            href="/developer"
            className="text-sm text-primary hover:underline"
          >
            Back to API Portal
          </Link>
        </div>
      </div>

      <Tabs defaultValue="endpoints">
        <TabsList>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="rate-limits">Rate Limits</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        {/* Endpoints tab */}
        <TabsContent value="endpoints" className="mt-6">
          <div className="grid gap-6">
            {ENDPOINT_GROUPS.map((group) => (
              <Card key={group.name}>
                <CardHeader>
                  <CardTitle className="text-base">{group.name}</CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {group.endpoints.map((endpoint, idx) => (
                      <div key={idx}>
                        {idx > 0 && <Separator className="mb-2" />}
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex w-16 items-center justify-center rounded px-2 py-0.5 text-xs font-bold ${
                              METHOD_COLORS[endpoint.method] ?? 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {endpoint.method}
                          </span>
                          <code className="text-sm font-mono text-foreground">
                            {endpoint.path}
                          </code>
                          <span className="ml-auto text-sm text-muted-foreground hidden sm:inline">
                            {endpoint.description}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                          {endpoint.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Authentication tab */}
        <TabsContent value="authentication" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4" />
                Authentication
              </CardTitle>
              <CardDescription>
                The OpenLintel API uses OAuth2 for authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">OAuth2 Client Credentials Flow</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Use your application&apos;s client ID and client secret to obtain an access token.
                  Include the token in the Authorization header of all API requests.
                </p>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      1. Request an access token
                    </p>
                    <div className="rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto">
                      <p>POST /oauth/token</p>
                      <p className="mt-1 text-muted-foreground">Content-Type: application/x-www-form-urlencoded</p>
                      <p className="mt-2">grant_type=client_credentials</p>
                      <p>&amp;client_id=YOUR_CLIENT_ID</p>
                      <p>&amp;client_secret=YOUR_CLIENT_SECRET</p>
                      <p>&amp;scope=projects:read projects:write</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      2. Use the token in API requests
                    </p>
                    <div className="rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto">
                      <p>GET /api/v1/projects</p>
                      <p className="text-muted-foreground">Authorization: Bearer YOUR_ACCESS_TOKEN</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">Available Scopes</h3>
                <div className="space-y-2">
                  {[
                    { scope: 'projects:read', description: 'Read access to projects and rooms' },
                    { scope: 'projects:write', description: 'Create, update, and delete projects and rooms' },
                    { scope: 'bom:read', description: 'Read access to bills of materials' },
                    { scope: 'bom:write', description: 'Generate and modify bills of materials' },
                  ].map((item) => (
                    <div key={item.scope} className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {item.scope}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{item.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">Token Response</h3>
                <div className="rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto">
                  <p>{'{'}</p>
                  <p className="ml-4">&quot;access_token&quot;: &quot;eyJhbGciOi...&quot;,</p>
                  <p className="ml-4">&quot;token_type&quot;: &quot;Bearer&quot;,</p>
                  <p className="ml-4">&quot;expires_in&quot;: 3600,</p>
                  <p className="ml-4">&quot;scope&quot;: &quot;projects:read projects:write&quot;</p>
                  <p>{'}'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rate Limits tab */}
        <TabsContent value="rate-limits" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rate Limits</CardTitle>
              <CardDescription>
                API rate limits are applied per application and depend on your tier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Tier</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Requests / Minute</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Requests / Day</th>
                      <th className="pb-2 font-medium text-muted-foreground">Burst Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { tier: 'Free', perMin: '60', perDay: '10,000', burst: '10' },
                      { tier: 'Basic', perMin: '300', perDay: '100,000', burst: '50' },
                      { tier: 'Pro', perMin: '1,000', perDay: '500,000', burst: '100' },
                      { tier: 'Enterprise', perMin: 'Custom', perDay: 'Custom', burst: 'Custom' },
                    ].map((row) => (
                      <tr key={row.tier} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">
                          <Badge variant="outline" className="capitalize">
                            {row.tier}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">{row.perMin}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{row.perDay}</td>
                        <td className="py-2.5 tabular-nums">{row.burst}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Separator className="my-6" />

              <div>
                <h3 className="text-sm font-semibold mb-2">Rate Limit Headers</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Every API response includes the following headers to help you track your usage:
                </p>
                <div className="space-y-2">
                  {[
                    { header: 'X-RateLimit-Limit', description: 'Maximum requests allowed per window' },
                    { header: 'X-RateLimit-Remaining', description: 'Remaining requests in current window' },
                    { header: 'X-RateLimit-Reset', description: 'Unix timestamp when the window resets' },
                    { header: 'Retry-After', description: 'Seconds to wait before retrying (only on 429 responses)' },
                  ].map((item) => (
                    <div key={item.header} className="flex items-start gap-3">
                      <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono whitespace-nowrap">
                        {item.header}
                      </code>
                      <span className="text-sm text-muted-foreground">{item.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks tab */}
        <TabsContent value="webhooks" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4" />
                Webhook Events
              </CardTitle>
              <CardDescription>
                Subscribe to webhook events to receive real-time notifications about changes
                in your projects and data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">Available Events</h3>
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((item) => (
                    <div key={item.event} className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs whitespace-nowrap">
                        {item.event}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{item.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">Payload Format</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  All webhook payloads follow a consistent JSON structure:
                </p>
                <div className="rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto">
                  <p>{'{'}</p>
                  <p className="ml-4">&quot;id&quot;: &quot;evt_abc123&quot;,</p>
                  <p className="ml-4">&quot;event&quot;: &quot;project.updated&quot;,</p>
                  <p className="ml-4">&quot;timestamp&quot;: &quot;2025-01-15T10:30:00Z&quot;,</p>
                  <p className="ml-4">&quot;data&quot;: {'{'}</p>
                  <p className="ml-8">&quot;projectId&quot;: &quot;proj_xyz789&quot;,</p>
                  <p className="ml-8">&quot;changes&quot;: {'{ ... }'}</p>
                  <p className="ml-4">{'}'}</p>
                  <p>{'}'}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">Delivery &amp; Retries</h3>
                <p className="text-sm text-muted-foreground">
                  Webhook deliveries are attempted up to 5 times with exponential backoff.
                  Your endpoint should return a 2xx status code within 30 seconds to acknowledge
                  receipt. Failed deliveries after all retry attempts will be marked as failed
                  and can be retried manually from the developer portal.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

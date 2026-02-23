'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Textarea,
  Badge,
  Separator,
  toast,
} from '@openlintel/ui';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Reply,
  User,
} from 'lucide-react';

interface CommentThreadProps {
  projectId: string;
  targetType: string;
  targetId: string;
}

export function CommentThread({ projectId, targetType, targetId }: CommentThreadProps) {
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const utils = trpc.useUtils();

  const { data: comments = [], isLoading } = trpc.notification.listComments.useQuery({
    projectId,
    targetType,
    targetId,
  });

  const createComment = trpc.notification.createComment.useMutation({
    onSuccess: () => {
      utils.notification.listComments.invalidate({ projectId, targetType, targetId });
      setNewComment('');
      setReplyingTo(null);
      setReplyText('');
      toast({ title: 'Comment added' });
    },
    onError: () => {
      toast({ title: 'Failed to add comment', variant: 'destructive' });
    },
  });

  const resolveComment = trpc.notification.resolveComment.useMutation({
    onSuccess: () => {
      utils.notification.listComments.invalidate({ projectId, targetType, targetId });
      toast({ title: 'Thread resolved' });
    },
  });

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    createComment.mutate({
      projectId,
      targetType,
      targetId,
      content: newComment.trim(),
    });
  };

  const handleReply = (parentId: string) => {
    if (!replyText.trim()) return;
    createComment.mutate({
      projectId,
      targetType,
      targetId,
      content: replyText.trim(),
      parentId,
    });
  };

  // Organize comments into threads
  const rootComments = comments.filter((c) => !c.parentId);
  const replies = comments.filter((c) => c.parentId);

  const getReplies = (parentId: string) =>
    replies.filter((r) => r.parentId === parentId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-20 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {comments.length} comment{comments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* New comment input */}
      <div className="flex gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <Textarea
            placeholder="Add a comment..."
            rows={2}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createComment.isPending || !newComment.trim()}
            >
              <Send className="mr-1 h-3 w-3" />
              {createComment.isPending ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>
      </div>

      {/* Comment thread */}
      {rootComments.length > 0 && <Separator />}

      <div className="space-y-4">
        {rootComments.map((comment) => {
          const commentReplies = getReplies(comment.id);
          const isResolved = comment.resolved;

          return (
            <div key={comment.id} className="space-y-3">
              {/* Root comment */}
              <div className={`rounded-lg border p-3 ${isResolved ? 'bg-green-50/50 border-green-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {comment.userId?.slice(0, 8) || 'User'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                        {isResolved && (
                          <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
                            Resolved
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() =>
                          setReplyingTo(replyingTo === comment.id ? null : comment.id)
                        }
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <Reply className="h-3 w-3" />
                        Reply
                      </button>
                      {!isResolved && (
                        <button
                          onClick={() => resolveComment.mutate({ id: comment.id })}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-green-600"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Replies */}
              {commentReplies.length > 0 && (
                <div className="ml-10 space-y-2">
                  {commentReplies.map((reply) => (
                    <div key={reply.id} className="rounded-lg border bg-gray-50/50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {reply.userId?.slice(0, 8) || 'User'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(reply.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 text-sm whitespace-pre-wrap">{reply.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              {replyingTo === comment.id && (
                <div className="ml-10 flex gap-2">
                  <Textarea
                    placeholder="Write a reply..."
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleReply(comment.id);
                      }
                    }}
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => handleReply(comment.id)}
                      disabled={createComment.isPending || !replyText.trim()}
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

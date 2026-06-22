"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Calendar,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Flag,
  MessageSquare,
  Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatKarma } from "@/lib/utils";
import { MarkdownContent } from "@/components/markdown-content";
import {
  createCommentAction,
  deleteCommentAction,
  editCommentAction,
  reportCommentAction,
  saveCommentAction,
  voteCommentAction,
} from "@/actions/comments";
import { votePostAction } from "@/actions/posts";
import { rsvpEventAction } from "@/actions/events";

// ─── Types ─────────────────────────────────────────────────────────────────────

type EventInfo = {
  id: string;
  startTime: string;
  endTime: string;
  participantCount: number;
  isParticipating: boolean;
};

type PostData = {
  id: string;
  title: string;
  body: string | null;
  isPinned: boolean;
  upvotes: number;
  downvotes: number;
  myVote: 1 | -1 | null;
  createdAt: string;
  authorId: string;
  authorHandle: string;
  authorKarma: number;
  communityName: string;
  commentCount: number;
  event: EventInfo | null;
};

type CommentData = {
  id: string;
  body: string | null;
  isPinned: boolean;
  isDeleted: boolean;
  removedByMod: boolean;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  parentCommentId: string | null;
  authorId: string;
  authorHandle: string;
  authorKarma: number;
  myVote: number | null;
  isSaved: boolean;
  isHidden: boolean;
};

type CommentNode = CommentData & { replies: CommentNode[] };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildTree(comments: CommentData[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  for (const c of comments) map.set(c.id, { ...c, replies: [] });

  const roots: CommentNode[] = [];
  for (const c of comments) {
    const node = map.get(c.id)!;
    if (!c.parentCommentId) {
      roots.push(node);
    } else {
      const parent = map.get(c.parentCommentId);
      if (parent) parent.replies.push(node);
      else roots.push(node); // orphaned
    }
  }
  return roots;
}

// ─── Auth Modal ────────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-lg font-semibold">
          Join the conversation
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Log in or create an account to vote, comment, save, and more.
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild className="flex-1">
            <Link href="/login">Log in</Link>
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <Link href="/register">Sign up</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Comment Composer ──────────────────────────────────────────────────────────

function CommentComposer({
  postId,
  currentUserId,
  onGuestAction,
  parentCommentId,
  onSuccess,
  autoFocus,
}: {
  postId: string;
  currentUserId: string | null;
  onGuestAction: () => void;
  parentCommentId?: string;
  onSuccess?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!currentUserId) {
    return (
      <div
        className="cursor-pointer rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/40"
        onClick={onGuestAction}
      >
        Log in to comment…
      </div>
    );
  }

  function handleSubmit() {
    if (!body.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await createCommentAction(
        postId,
        body.trim(),
        parentCommentId
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setBody("");
      onSuccess?.();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentCommentId ? "Write a reply…" : "Add a comment…"}
        disabled={isPending}
        autoFocus={autoFocus}
        maxLength={10000}
        rows={parentCommentId ? 3 : 4}
        className="flex min-h-[72px] w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {parentCommentId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSuccess?.()}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isPending || !body.trim()}
        >
          {isPending ? "Posting…" : parentCommentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </div>
  );
}

// ─── Comment Thread ────────────────────────────────────────────────────────────

function CommentThread({
  node,
  depth,
  postId,
  currentUserId,
  onGuestAction,
}: {
  node: CommentNode;
  depth: number;
  postId: string;
  currentUserId: string | null;
  onGuestAction: () => void;
}) {
  const isOwn = currentUserId === node.authorId;

  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(node.body ?? "");
  const [isSaved, setIsSaved] = useState(node.isSaved);
  const [myVote, setMyVote] = useState<number | null>(node.myVote);
  const [upvotes, setUpvotes] = useState(node.upvotes);
  const [downvotes, setDownvotes] = useState(node.downvotes);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isVoting, startVoteTransition] = useTransition();
  const [isActing, startActTransition] = useTransition();

  if (node.isHidden) return null;

  const score = upvotes - downvotes;

  function handleVote(val: 1 | -1) {
    if (!currentUserId) {
      onGuestAction();
      return;
    }
    if (node.isDeleted) return;

    // Save state for revert
    const prevVote = myVote;
    const prevUp = upvotes;
    const prevDown = downvotes;

    // Optimistic update
    if (myVote === val) {
      setMyVote(null);
      if (val === 1) setUpvotes((v) => v - 1);
      else setDownvotes((v) => v - 1);
    } else {
      if (myVote !== null) {
        if (val === 1) {
          setUpvotes((v) => v + 1);
          setDownvotes((v) => v - 1);
        } else {
          setDownvotes((v) => v + 1);
          setUpvotes((v) => v - 1);
        }
      } else {
        if (val === 1) setUpvotes((v) => v + 1);
        else setDownvotes((v) => v + 1);
      }
      setMyVote(val);
    }

    startVoteTransition(async () => {
      const result = await voteCommentAction(node.id, val);
      if (result.error) {
        setMyVote(prevVote);
        setUpvotes(prevUp);
        setDownvotes(prevDown);
        setActionError(result.error);
      }
    });
  }

  function handleSave() {
    if (!currentUserId) {
      onGuestAction();
      return;
    }
    const prev = isSaved;
    setIsSaved(!prev);
    startActTransition(async () => {
      const result = await saveCommentAction(node.id);
      if (result.error) {
        setIsSaved(prev);
        setActionError(result.error);
      }
    });
  }

  function handleEditSubmit() {
    startActTransition(async () => {
      const result = await editCommentAction(node.id, editDraft.trim());
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setIsEditing(false);
    });
  }

  function handleDelete() {
    startActTransition(async () => {
      const result = await deleteCommentAction(node.id);
      if (result.error) setActionError(result.error);
    });
  }

  function handleReport() {
    if (!currentUserId) {
      onGuestAction();
      return;
    }
    setIsReporting(true);
  }

  function handleReportSubmit() {
    startActTransition(async () => {
      const result = await reportCommentAction(node.id, reportReason);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setIsReporting(false);
      setReportReason("");
    });
  }

  return (
    <div className={cn(depth > 0 && "ml-5 border-l border-border/50 pl-3")}>
      <div className="py-2.5">
        <div className="flex gap-2">
          {/* Vote column */}
          <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
            <button
              onClick={() => handleVote(1)}
              disabled={isVoting || node.isDeleted}
              aria-label="Upvote"
              className={cn(
                "rounded p-0.5 transition-colors",
                myVote === 1
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                (isVoting || node.isDeleted) && "pointer-events-none opacity-40"
              )}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                score > 0
                  ? "text-primary"
                  : score < 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {score}
            </span>
            <button
              onClick={() => handleVote(-1)}
              disabled={isVoting || node.isDeleted}
              aria-label="Downvote"
              className={cn(
                "rounded p-0.5 transition-colors",
                myVote === -1
                  ? "text-destructive"
                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                (isVoting || node.isDeleted) && "pointer-events-none opacity-40"
              )}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Comment content */}
          <div className="min-w-0 flex-1">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {node.isPinned && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Pin className="h-3 w-3" />
                  Pinned
                </span>
              )}
              {!node.isDeleted && (
                <Link
                  href={`/u/${node.authorHandle}`}
                  title={`${formatKarma(node.authorKarma)} karma`}
                  className="text-xs font-semibold text-foreground hover:underline"
                >
                  u/{node.authorHandle}
                </Link>
              )}
              <span className="text-xs text-muted-foreground">
                {formatRelativeDate(node.createdAt)}
              </span>
            </div>

            {/* Body */}
            {node.isDeleted ? (
              <p className="mt-1 text-sm italic text-muted-foreground">
                {node.removedByMod ? "Removed by moderation." : "This comment was deleted."}
              </p>
            ) : isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  autoFocus
                  disabled={isActing}
                  maxLength={10000}
                  rows={3}
                  className="flex min-h-[72px] w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleEditSubmit}
                    disabled={isActing || !editDraft.trim()}
                  >
                    {isActing ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setEditDraft(node.body ?? "");
                      setActionError(null);
                    }}
                    disabled={isActing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <MarkdownContent
                content={node.body ?? ""}
                className="mt-1"
              />
            )}

            {/* Report form */}
            {isReporting && (
              <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">
                  Report this comment
                </p>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue (optional)"
                  disabled={isActing}
                  rows={2}
                  className="flex w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleReportSubmit}
                    disabled={isActing}
                  >
                    {isActing ? "Submitting…" : "Submit report"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsReporting(false);
                      setReportReason("");
                    }}
                    disabled={isActing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {actionError && (
              <p className="mt-1 text-xs text-destructive">{actionError}</p>
            )}

            {/* Action row */}
            {!isEditing && !isReporting && !node.isDeleted && (
              <div className="mt-1.5 flex items-center gap-0.5">
                <button
                  onClick={() => {
                    if (!currentUserId) {
                      onGuestAction();
                      return;
                    }
                    setIsReplying((v) => !v);
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Reply
                </button>

                <button
                  onClick={handleSave}
                  disabled={isActing}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:bg-muted",
                    isSaved
                      ? "text-primary hover:text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isSaved ? (
                    <BookmarkCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                  )}
                  {isSaved ? "Saved" : "Save"}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <Ellipsis className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    <DropdownMenuItem onClick={handleReport}>
                      <Flag className="mr-2 h-3.5 w-3.5" />
                      Report
                    </DropdownMenuItem>
                    {isOwn && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setEditDraft(node.body ?? "");
                            setActionError(null);
                            setIsEditing(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleDelete}
                          disabled={isActing}
                          className="text-destructive focus:text-destructive"
                        >
                          {isActing ? "Deleting…" : "Delete"}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Reply composer */}
        {isReplying && (
          <div className="ml-9 mt-2">
            <CommentComposer
              postId={postId}
              currentUserId={currentUserId}
              onGuestAction={onGuestAction}
              parentCommentId={node.id}
              autoFocus
              onSuccess={() => setIsReplying(false)}
            />
          </div>
        )}
      </div>

      {/* Nested replies */}
      {node.replies.length > 0 &&
        node.replies.map((reply) => (
          <CommentThread
            key={reply.id}
            node={reply}
            depth={depth + 1}
            postId={postId}
            currentUserId={currentUserId}
            onGuestAction={onGuestAction}
          />
        ))}
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export function PostPageClient({
  post,
  comments,
  currentUserId,
}: {
  post: PostData;
  comments: CommentData[];
  currentUserId: string | null;
}) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [postMyVote, setPostMyVote] = useState<1 | -1 | null>(post.myVote);
  const [postUpvotes, setPostUpvotes] = useState(post.upvotes);
  const [postDownvotes, setPostDownvotes] = useState(post.downvotes);
  const [isPostVoting, startPostVoteTransition] = useTransition();
  const [eventState, setEventState] = useState(post.event);
  const [isRsvping, startRsvpTransition] = useTransition();

  const commentTree = buildTree(comments);
  const postScore = postUpvotes - postDownvotes;

  function onGuestAction() {
    setShowAuthModal(true);
  }

  function handleRsvp() {
    if (!currentUserId || !eventState) return;
    const prev = eventState;
    setEventState({
      ...eventState,
      isParticipating: !eventState.isParticipating,
      participantCount: eventState.isParticipating
        ? eventState.participantCount - 1
        : eventState.participantCount + 1,
    });
    startRsvpTransition(async () => {
      const result = await rsvpEventAction(eventState.id, post.communityName);
      if (result.error) setEventState(prev);
    });
  }

  function handlePostVote(val: 1 | -1) {
    if (!currentUserId) {
      onGuestAction();
      return;
    }

    const prevVote = postMyVote;
    const prevUp = postUpvotes;
    const prevDown = postDownvotes;

    // Optimistic update
    if (postMyVote === val) {
      setPostMyVote(null);
      if (val === 1) setPostUpvotes((v) => v - 1);
      else setPostDownvotes((v) => v - 1);
    } else {
      if (postMyVote !== null) {
        if (val === 1) {
          setPostUpvotes((v) => v + 1);
          setPostDownvotes((v) => v - 1);
        } else {
          setPostDownvotes((v) => v + 1);
          setPostUpvotes((v) => v - 1);
        }
      } else {
        if (val === 1) setPostUpvotes((v) => v + 1);
        else setPostDownvotes((v) => v + 1);
      }
      setPostMyVote(val);
    }

    startPostVoteTransition(async () => {
      const result = await votePostAction(post.id, val);
      if (result.error) {
        setPostMyVote(prevVote);
        setPostUpvotes(prevUp);
        setPostDownvotes(prevDown);
      }
    });
  }

  return (
    <>
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_28%),linear-gradient(to_bottom,_transparent,_rgba(148,163,184,0.06))]">
        <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
          {/* Back nav */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            asChild
          >
            <Link href={`/communities/${post.communityName}`}>
              <ArrowLeft className="h-4 w-4" />
              c/{post.communityName}
            </Link>
          </Button>

          {/* Post card */}
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex">
              {/* Vote column */}
              <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 bg-muted/30 py-3 px-1">
                <button
                  onClick={() => handlePostVote(1)}
                  disabled={isPostVoting}
                  aria-label="Upvote post"
                  className={cn(
                    "rounded p-0.5 transition-colors",
                    postMyVote === 1
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                    isPostVoting && "pointer-events-none opacity-40"
                  )}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    postScore > 0
                      ? "text-primary"
                      : postScore < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {postScore}
                </span>
                <button
                  onClick={() => handlePostVote(-1)}
                  disabled={isPostVoting}
                  aria-label="Downvote post"
                  className={cn(
                    "rounded p-0.5 transition-colors",
                    postMyVote === -1
                      ? "text-destructive"
                      : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                    isPostVoting && "pointer-events-none opacity-40"
                  )}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Post content */}
              <div className="min-w-0 flex-1 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {post.isPinned && (
                    <span className="flex items-center gap-1 font-medium text-primary">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </span>
                  )}
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                    c/{post.communityName}
                  </span>
                  <Link
                    href={`/u/${post.authorHandle}`}
                    title={`${formatKarma(post.authorKarma)} karma`}
                    className="hover:underline"
                  >
                    u/{post.authorHandle}
                  </Link>
                  <span>{formatRelativeDate(post.createdAt)}</span>
                </div>

                <h1 className="mt-2 text-xl font-bold leading-snug text-foreground">
                  {post.title}
                </h1>

                {post.body && (
                  <MarkdownContent
                    content={post.body}
                    className="mt-2 text-muted-foreground"
                  />
                )}

                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {post.commentCount}{" "}
                    {post.commentCount === 1 ? "comment" : "comments"}
                  </span>
                  {eventState && (
                    <button
                      onClick={handleRsvp}
                      disabled={isRsvping || !currentUserId}
                      className={cn(
                        "flex items-center gap-1 transition-colors disabled:pointer-events-none disabled:opacity-50",
                        eventState.isParticipating
                          ? "font-medium text-primary"
                          : "hover:text-foreground"
                      )}
                    >
                      {eventState.isParticipating
                        ? <CalendarCheck className="h-3.5 w-3.5" />
                        : <Calendar className="h-3.5 w-3.5" />
                      }
                      {eventState.isParticipating ? "Going" : "RSVP"}
                      {eventState.participantCount > 0 && (
                        <span>· {eventState.participantCount}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>

          {/* Comment composer card */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-semibold text-foreground">
              {post.commentCount > 0
                ? `${post.commentCount} ${post.commentCount === 1 ? "Comment" : "Comments"}`
                : "Comments"}
            </p>
            <CommentComposer
              postId={post.id}
              currentUserId={currentUserId}
              onGuestAction={onGuestAction}
            />
          </div>

          {/* Comment tree */}
          {commentTree.length > 0 ? (
            <div className="divide-y divide-border/50 rounded-xl border border-border bg-card px-4">
              {commentTree.map((node) => (
                <CommentThread
                  key={node.id}
                  node={node}
                  depth={0}
                  postId={post.id}
                  currentUserId={currentUserId}
                  onGuestAction={onGuestAction}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
              <MessageSquare className="h-6 w-6 opacity-30" />
              <p className="text-sm">No comments yet. Be the first!</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

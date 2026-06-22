"use client";

import { useTransition, useState } from "react";
import { removeCommentAction } from "@/actions/moderation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Comment = {
  id: string;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  user: { username: string | null; email: string | null };
  post: { title: string; id: string };
};

type CommentsTabProps = {
  communityId: string;
  comments: Comment[];
  canManagePosts: boolean;
};

export function CommentsTab({ communityId, comments: initial, canManagePosts }: CommentsTabProps) {
  const [comments, setComments] = useState(initial);
  const [filter, setFilter] = useState<"all" | "removed">("all");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [removalReasons, setRemovalReasons] = useState<Record<string, string>>({});

  const displayed = comments.filter((c) =>
    filter === "removed" ? c.isDeleted : true
  );

  function handleRemove(commentId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await removeCommentAction(commentId, communityId, removalReasons[commentId]);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, isDeleted: true } : c))
      );
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  if (!canManagePosts) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        You do not have post management permission.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["all", "removed"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "secondary" : "ghost"}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {message && (
        <p
          className={cn(
            "text-sm",
            message.type === "error" ? "text-destructive" : "text-green-600 dark:text-green-400"
          )}
        >
          {message.text}
        </p>
      )}

      {displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No comments to show.</p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {displayed.map((comment) => (
            <div key={comment.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm line-clamp-2">{comment.body}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    by {comment.user.username ?? comment.user.email ?? "unknown"} ·{" "}
                    {new Date(comment.createdAt).toLocaleDateString()} · on &ldquo;
                    {comment.post.title}&rdquo;
                    {comment.isDeleted && (
                      <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1 rounded">
                        Removed
                      </span>
                    )}
                  </p>
                </div>
                {!comment.isDeleted && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive shrink-0"
                    disabled={isPending}
                    onClick={() => handleRemove(comment.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {!comment.isDeleted && (
                <input
                  type="text"
                  placeholder="Optional removal reason…"
                  value={removalReasons[comment.id] ?? ""}
                  onChange={(e) =>
                    setRemovalReasons((prev) => ({ ...prev, [comment.id]: e.target.value }))
                  }
                  className="text-xs w-full max-w-xs rounded border border-input bg-transparent px-2 py-1 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

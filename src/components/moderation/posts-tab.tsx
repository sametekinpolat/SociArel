"use client";

import { useTransition, useState } from "react";
import { removePostAction, pinPostAction } from "@/actions/moderation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Post = {
  id: string;
  title: string;
  status: string;
  isPinned: boolean;
  isDeleted: boolean;
  createdAt: Date;
  user: { username: string | null; email: string | null };
};

type PostsTabProps = {
  communityId: string;
  posts: Post[];
  canManagePosts: boolean;
};

export function PostsTab({ communityId, posts: initial, canManagePosts }: PostsTabProps) {
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<"all" | "removed" | "pinned">("all");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [removalReasons, setRemovalReasons] = useState<Record<string, string>>({});

  const displayed = posts.filter((p) => {
    if (filter === "removed") return p.isDeleted || p.status === "REMOVED";
    if (filter === "pinned") return p.isPinned;
    return true;
  });

  function handleRemove(postId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await removePostAction(postId, communityId, removalReasons[postId]);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, status: "REMOVED", isDeleted: true } : p
        )
      );
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  function handlePin(postId: string, pin: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await pinPostAction(postId, communityId, pin);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isPinned: pin } : p))
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
        {(["all", "removed", "pinned"] as const).map((f) => (
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
        <p className="text-sm text-muted-foreground py-8 text-center">No posts to show.</p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {displayed.map((post) => (
            <div key={post.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{post.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    by {post.user.username ?? post.user.email ?? "unknown"} ·{" "}
                    {new Date(post.createdAt).toLocaleDateString()}
                    {post.isPinned && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-1 rounded">Pinned</span>
                    )}
                    {(post.isDeleted || post.status === "REMOVED") && (
                      <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1 rounded">
                        Removed
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 items-start">
                  {!post.isDeleted && post.status !== "REMOVED" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => handlePin(post.id, !post.isPinned)}
                      >
                        {post.isPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={isPending}
                        onClick={() => handleRemove(post.id)}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {!post.isDeleted && post.status !== "REMOVED" && (
                <input
                  type="text"
                  placeholder="Optional removal reason…"
                  value={removalReasons[post.id] ?? ""}
                  onChange={(e) =>
                    setRemovalReasons((prev) => ({ ...prev, [post.id]: e.target.value }))
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

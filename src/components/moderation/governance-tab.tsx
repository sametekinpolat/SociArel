"use client";

import { useTransition, useState } from "react";
import {
  assignModeratorAction,
  removeModeratorAction,
  updateModeratorPermissionsAction,
  closeCommunityAction,
  reopenCommunityAction,
  transferOwnershipAction,
  deleteCommunityAction,
} from "@/actions/moderation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Moderator = {
  userId: string;
  canManageSettings: boolean;
  canManagePosts: boolean;
  canRestrictUsers: boolean;
  user: { username: string | null; email: string | null };
};

type GovernanceTabProps = {
  community: { id: string; name: string; status: string; ownerId: string };
  moderators: Moderator[];
  ctx: {
    isGlobalModerator: boolean;
    isCommunityOwner: boolean;
    canGovernCommunity: boolean;
  };
};

export function GovernanceTab({ community, moderators: initial, ctx }: GovernanceTabProps) {
  const [moderators, setModerators] = useState(initial);
  const [communityStatus, setCommunityStatus] = useState(community.status);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Assign form
  const [assignUserId, setAssignUserId] = useState("");
  const [assignPerms, setAssignPerms] = useState({
    canManageSettings: false,
    canManagePosts: true,
    canRestrictUsers: false,
  });

  // Transfer form
  const [newOwnerId, setNewOwnerId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  if (!ctx.canGovernCommunity) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Only community owners and global moderators can access governance controls.
      </p>
    );
  }

  function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await assignModeratorAction(assignUserId.trim(), community.id, assignPerms);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: result.success ?? "Done. Refresh to see changes." });
      setAssignUserId("");
    });
  }

  function handleRemoveMod(userId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await removeModeratorAction(userId, community.id);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setModerators((prev) => prev.filter((m) => m.userId !== userId));
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  function handleUpdatePerms(
    userId: string,
    perms: { canManageSettings: boolean; canManagePosts: boolean; canRestrictUsers: boolean }
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateModeratorPermissionsAction(userId, community.id, perms);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setModerators((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, ...perms } : m))
      );
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  function handleCloseCommunity() {
    setMessage(null);
    startTransition(async () => {
      const result = await closeCommunityAction(community.id, closeReason || undefined);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setCommunityStatus("CLOSED");
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  function handleReopenCommunity() {
    setMessage(null);
    startTransition(async () => {
      const result = await reopenCommunityAction(community.id);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setCommunityStatus("ACTIVE");
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!newOwnerId.trim()) return;
    startTransition(async () => {
      const result = await transferOwnershipAction(community.id, newOwnerId.trim());
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: result.success ?? "Ownership transferred." });
      setNewOwnerId("");
    });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await deleteCommunityAction(community.id);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        setConfirmDelete(false);
        return;
      }
      // Redirect handled by revalidatePath in the action
      window.location.href = "/communities";
    });
  }

  return (
    <div className="space-y-8">
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

      {/* Moderator Roster */}
      <section>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground">
          Moderator Roster
        </h2>

        {moderators.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moderators assigned.</p>
        ) : (
          <div className="rounded-xl border border-border divide-y divide-border mb-4">
            {moderators.map((mod) => {
              const isOwner = mod.userId === community.ownerId;
              return (
                <div key={mod.userId} className="p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {mod.user.username ?? mod.user.email ?? mod.userId}
                        {isOwner && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            Owner
                          </span>
                        )}
                      </p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {(
                          [
                            ["canManagePosts", "Posts"],
                            ["canRestrictUsers", "Restrictions"],
                            ["canManageSettings", "Settings"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mod[key]}
                              disabled={isPending || isOwner}
                              onChange={(e) =>
                                handleUpdatePerms(mod.userId, {
                                  canManagePosts: mod.canManagePosts,
                                  canRestrictUsers: mod.canRestrictUsers,
                                  canManageSettings: mod.canManageSettings,
                                  [key]: e.target.checked,
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {!isOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive shrink-0"
                        disabled={isPending}
                        onClick={() => handleRemoveMod(mod.userId)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Assign new moderator */}
        <form onSubmit={handleAssign} className="rounded-xl border border-border p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Assign Moderator</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-user-id">User ID</Label>
            <Input
              id="assign-user-id"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              placeholder="Paste user UUID"
              required
            />
          </div>
          <div className="flex gap-4 text-xs">
            {(
              [
                ["canManagePosts", "Manage Posts"],
                ["canRestrictUsers", "Restrict Users"],
                ["canManageSettings", "Manage Settings"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignPerms[key]}
                  onChange={(e) => setAssignPerms((p) => ({ ...p, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={isPending || !assignUserId.trim()} className="self-start">
            {isPending ? "Assigning…" : "Assign"}
          </Button>
        </form>
      </section>

      {/* Community Lifecycle — owner only */}
      {ctx.isCommunityOwner && (
        <section>
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground">
            Community Lifecycle
          </h2>
          <div className="rounded-xl border border-border p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  Status:{" "}
                  <span
                    className={
                      communityStatus === "ACTIVE"
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }
                  >
                    {communityStatus}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Closed communities hide new posting and joining.
                </p>
              </div>
              {communityStatus === "ACTIVE" ? (
                <div className="flex flex-col items-end gap-2">
                  <Input
                    placeholder="Closure reason (optional)"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    className="w-56 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={handleCloseCommunity}
                  >
                    Close Community
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={handleReopenCommunity}
                >
                  Reopen Community
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Global mod can also close/reopen */}
      {ctx.isGlobalModerator && !ctx.isCommunityOwner && (
        <section>
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground">
            Platform Moderation
          </h2>
          <div className="rounded-xl border border-border p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  Status:{" "}
                  <span
                    className={
                      communityStatus === "ACTIVE"
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }
                  >
                    {communityStatus}
                  </span>
                </p>
              </div>
              {communityStatus === "ACTIVE" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={handleCloseCommunity}
                >
                  Close Community
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={handleReopenCommunity}
                >
                  Reopen Community
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Transfer + Delete — owner only */}
      {ctx.isCommunityOwner && (
        <section>
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground text-destructive">
            Danger Zone
          </h2>
          <div className="rounded-xl border border-destructive/30 p-4 flex flex-col gap-6">
            {/* Transfer ownership */}
            <form onSubmit={handleTransfer} className="flex flex-col gap-3">
              <p className="text-sm font-medium">Transfer Ownership</p>
              <p className="text-xs text-muted-foreground">
                This permanently transfers control to another user. You cannot undo this.
              </p>
              <div className="flex gap-2">
                <Input
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  placeholder="New owner's user UUID"
                  required
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="text-destructive hover:text-destructive shrink-0"
                  disabled={isPending || !newOwnerId.trim()}
                >
                  Transfer
                </Button>
              </div>
            </form>

            {/* Delete community */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Delete Community</p>
              <p className="text-xs text-muted-foreground">
                Permanently deletes this community and all its content. This cannot be undone.
              </p>
              <Button
                variant="outline"
                className="self-start text-destructive hover:text-destructive border-destructive/50 hover:border-destructive"
                disabled={isPending}
                onClick={handleDelete}
              >
                {confirmDelete ? "Confirm Delete — this is permanent" : "Delete Community"}
              </Button>
              {confirmDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

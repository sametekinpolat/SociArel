"use client";

import { useTransition, useState } from "react";
import { muteUserAction, banUserAction, revokeRestrictionAction } from "@/actions/moderation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Restriction = {
  id: string;
  type: string;
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  user: { id: string; username: string | null; email: string | null };
  moderator: { username: string | null; email: string | null };
};

type RestrictionsTabProps = {
  communityId: string;
  restrictions: Restriction[];
  canRestrictUsers: boolean;
};

export function RestrictionsTab({
  communityId,
  restrictions: initial,
  canRestrictUsers,
}: RestrictionsTabProps) {
  const [restrictions, setRestrictions] = useState(initial);
  const [filter, setFilter] = useState<"BAN" | "MUTE">("BAN");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [targetUsername, setTargetUsername] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [addType, setAddType] = useState<"BAN" | "MUTE">("BAN");

  const displayed = restrictions.filter((r) => r.type === filter);

  function handleRevoke(restrictionId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeRestrictionAction(restrictionId, communityId);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setRestrictions((prev) => prev.filter((r) => r.id !== restrictionId));
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // Look up the user ID from username — not ideal but avoids extra server round-trip pattern
    // We pass username and let the parent resolve, but for now we just use the input as userId
    // In a real implementation this form would use a user search / autocomplete
    const targetUserId = targetUsername.trim();
    if (!targetUserId) return;

    startTransition(async () => {
      const fn = addType === "BAN" ? banUserAction : muteUserAction;
      const result =
        addType === "BAN"
          ? await banUserAction(targetUserId, communityId, reason || undefined)
          : await muteUserAction(targetUserId, communityId, reason || undefined, expiresAt || undefined);

      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: result.success ?? "Done. Refresh to see new restriction." });
      setTargetUsername("");
      setReason("");
      setExpiresAt("");
    });
  }

  if (!canRestrictUsers) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        You do not have user restriction permission.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add restriction form */}
      <section className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground">
          Add Restriction
        </h2>
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(["BAN", "MUTE"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={addType === t ? "secondary" : "ghost"}
                onClick={() => setAddType(t)}
              >
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target-user-id">User ID</Label>
            <Input
              id="target-user-id"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              placeholder="Paste user UUID"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restriction-reason">Reason (optional)</Label>
            <Input
              id="restriction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Repeated rule violations"
            />
          </div>
          {addType === "MUTE" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expires-at">Expires at (optional)</Label>
              <Input
                id="expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" disabled={isPending || !targetUsername.trim()} className="self-start">
            {isPending ? "Saving…" : `Apply ${addType.charAt(0) + addType.slice(1).toLowerCase()}`}
          </Button>
        </form>
      </section>

      {/* Existing restrictions */}
      <div className="flex gap-2">
        {(["BAN", "MUTE"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "secondary" : "ghost"}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}s
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
        <p className="text-sm text-muted-foreground py-4 text-center">
          No active {filter.toLowerCase()}s.
        </p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {displayed.map((r) => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {r.user.username ?? r.user.email ?? r.user.id}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  by {r.moderator.username ?? r.moderator.email ?? "mod"} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                  {r.expiresAt && ` · expires ${new Date(r.expiresAt).toLocaleDateString()}`}
                </p>
                {r.reason && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">&ldquo;{r.reason}&rdquo;</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handleRevoke(r.id)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

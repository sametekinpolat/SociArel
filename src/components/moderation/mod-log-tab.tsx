"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ModLogEntry = {
  id: string;
  action: string;
  details: unknown;
  createdAt: Date;
  moderator: { username: string | null; email: string | null };
  targetUser: { username: string | null; email: string | null } | null;
  targetPost: { title: string } | null;
  targetComment: { body: string } | null;
};

type ModLogTabProps = {
  entries: ModLogEntry[];
};

const ACTION_LABELS: Record<string, string> = {
  REMOVE_POST: "Removed post",
  REMOVE_COMMENT: "Removed comment",
  BAN_USER: "Banned user",
  MUTE_USER: "Muted user",
  UNBAN_USER: "Unbanned user",
  UNMUTE_USER: "Unmuted user",
  UPDATE_SETTINGS: "Updated settings",
  PIN_POST: "Pinned post",
  UNPIN_POST: "Unpinned post",
  ASSIGN_MODERATOR: "Assigned moderator",
  REMOVE_MODERATOR: "Removed moderator",
  UPDATE_MODERATOR_PERMISSIONS: "Updated mod permissions",
  CLOSE_COMMUNITY: "Closed community",
  REOPEN_COMMUNITY: "Reopened community",
  DELETE_COMMUNITY: "Deleted community",
  TRANSFER_COMMUNITY_OWNERSHIP: "Transferred ownership",
  RESOLVE_REPORT: "Resolved report",
  DISMISS_REPORT: "Dismissed report",
};

export function ModLogTab({ entries }: ModLogTabProps) {
  const [actionFilter, setActionFilter] = useState<string>("all");

  const actionTypes = ["all", ...Array.from(new Set(entries.map((e) => e.action)))];
  const displayed = actionFilter === "all" ? entries : entries.filter((e) => e.action === actionFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {actionTypes.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={actionFilter === a ? "secondary" : "ghost"}
            onClick={() => setActionFilter(a)}
          >
            {a === "all" ? "All" : (ACTION_LABELS[a] ?? a)}
          </Button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No log entries.</p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {displayed.map((entry) => (
            <div key={entry.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    by {entry.moderator.username ?? entry.moderator.email ?? "mod"} ·{" "}
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                  {entry.targetUser && (
                    <p className="text-xs text-muted-foreground">
                      Target: {entry.targetUser.username ?? entry.targetUser.email}
                    </p>
                  )}
                  {entry.targetPost && (
                    <p className="text-xs text-muted-foreground truncate">
                      Post: {entry.targetPost.title}
                    </p>
                  )}
                  {entry.targetComment && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Comment: {entry.targetComment.body}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

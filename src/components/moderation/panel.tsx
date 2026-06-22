"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReportsTab } from "./reports-tab";
import { PostsTab } from "./posts-tab";
import { CommentsTab } from "./comments-tab";
import { RestrictionsTab } from "./restrictions-tab";
import { ModLogTab } from "./mod-log-tab";
import { SettingsTab } from "./settings-tab";
import { GovernanceTab } from "./governance-tab";
import type { ModerationContext } from "@/lib/moderation/permissions";

// ─── Types mirrored from server page queries ──────────────────────────────────

type Report = {
  id: string;
  status: string;
  customReason: string | null;
  createdAt: Date;
  reporter: { username: string | null; email: string | null };
  reportedUser: { username: string | null; email: string | null } | null;
  post: { title: string; id: string } | null;
  comment: { body: string; id: string } | null;
  rule: { title: string } | null;
};

type Post = {
  id: string;
  title: string;
  status: string;
  isPinned: boolean;
  isDeleted: boolean;
  createdAt: Date;
  user: { username: string | null; email: string | null };
};

type Comment = {
  id: string;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  user: { username: string | null; email: string | null };
  post: { title: string; id: string };
};

type Restriction = {
  id: string;
  type: string;
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  user: { id: string; username: string | null; email: string | null };
  moderator: { username: string | null; email: string | null };
};

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

type Rule = {
  id: string;
  title: string;
  description: string | null;
  displayOrder: number;
};

type Moderator = {
  userId: string;
  canManageSettings: boolean;
  canManagePosts: boolean;
  canRestrictUsers: boolean;
  user: { username: string | null; email: string | null };
};

type PanelProps = {
  community: { id: string; name: string; status: string; ownerId: string };
  ctx: ModerationContext;
  reports: Report[];
  posts: Post[];
  comments: Comment[];
  restrictions: Restriction[];
  modLogs: ModLogEntry[];
  rules: Rule[];
  moderators: Moderator[];
};

type Tab =
  | "reports"
  | "posts"
  | "comments"
  | "restrictions"
  | "log"
  | "settings"
  | "governance";

export function ModerationPanel({
  community,
  ctx,
  reports,
  posts,
  comments,
  restrictions,
  modLogs,
  rules,
  moderators,
}: PanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("reports");

  const tabs = (
    [
      { id: "reports" as Tab, label: "Reports", show: true },
      { id: "posts" as Tab, label: "Posts", show: ctx.canManagePosts },
      { id: "comments" as Tab, label: "Comments", show: ctx.canManagePosts },
      { id: "restrictions" as Tab, label: "Restrictions", show: ctx.canRestrictUsers },
      { id: "log" as Tab, label: "Mod Log", show: true },
      { id: "settings" as Tab, label: "Settings", show: ctx.canManageSettings },
      { id: "governance" as Tab, label: "Governance", show: ctx.canGovernCommunity },
    ] satisfies { id: Tab; label: string; show: boolean }[]
  ).filter((t) => t.show);

  const pendingReports = reports.filter((r) => r.status === "PENDING").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold">Moderation Panel</h1>
          {community.status === "CLOSED" && (
            <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
              Closed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>c/{community.name}</span>
          <span>·</span>
          {ctx.isGlobalModerator && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              Global Mod
            </span>
          )}
          {ctx.isCommunityOwner && (
            <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
              Owner
            </span>
          )}
          {ctx.isCommunityModerator && !ctx.isCommunityOwner && (
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              Moderator
            </span>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <nav className="flex flex-wrap gap-1 border-b border-border mb-6 pb-px">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-none border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            )}
          >
            {tab.label}
            {tab.id === "reports" && pendingReports > 0 && (
              <span className="ml-1.5 text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                {pendingReports}
              </span>
            )}
          </Button>
        ))}
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === "reports" && (
          <ReportsTab communityId={community.id} reports={reports} />
        )}
        {activeTab === "posts" && (
          <PostsTab
            communityId={community.id}
            posts={posts}
            canManagePosts={ctx.canManagePosts}
          />
        )}
        {activeTab === "comments" && (
          <CommentsTab
            communityId={community.id}
            comments={comments}
            canManagePosts={ctx.canManagePosts}
          />
        )}
        {activeTab === "restrictions" && (
          <RestrictionsTab
            communityId={community.id}
            restrictions={restrictions}
            canRestrictUsers={ctx.canRestrictUsers}
          />
        )}
        {activeTab === "log" && <ModLogTab entries={modLogs} />}
        {activeTab === "settings" && (
          <SettingsTab
            community={community}
            rules={rules}
            canManageSettings={ctx.canManageSettings}
          />
        )}
        {activeTab === "governance" && (
          <GovernanceTab
            community={community}
            moderators={moderators}
            ctx={{
              isGlobalModerator: ctx.isGlobalModerator,
              isCommunityOwner: ctx.isCommunityOwner,
              canGovernCommunity: ctx.canGovernCommunity,
            }}
          />
        )}
      </div>
    </div>
  );
}

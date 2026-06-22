"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { Bell, Calendar, Check, Mail, MessageSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  markAllReadAction,
  markReadAction,
  type SerializedNotification,
} from "@/actions/notifications";
import { cn } from "@/lib/utils";

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getNotificationMessage(n: SerializedNotification): string {
  const actor = n.actorHandle ? `u/${n.actorHandle}` : "Someone";
  switch (n.type) {
    case "REPLY":
      return n.commentId
        ? `${actor} replied to your comment`
        : `${actor} commented on your post`;
    case "MENTION":
      return `${actor} mentioned you${n.postTitle ? ` in "${n.postTitle}"` : ""}`;
    case "COMMUNITY_INVITE":
      return `${actor} invited you to join c/${n.inviteCommunityName ?? "a community"}`;
    case "COMMUNITY_EVENT":
      return `New event in c/${n.communityName ?? "a community"}${n.postTitle ? `: ${n.postTitle}` : ""}`;
    case "DIRECT_MESSAGE":
      return `${actor} sent you a message`;
    default:
      return "New notification";
  }
}

function getIcon(type: SerializedNotification["type"]) {
  switch (type) {
    case "REPLY":
    case "MENTION":
      return MessageSquare;
    case "COMMUNITY_INVITE":
      return Users;
    case "COMMUNITY_EVENT":
      return Calendar;
    case "DIRECT_MESSAGE":
      return Mail;
    default:
      return Bell;
  }
}

type Props = { notifications: SerializedNotification[] };

export function NotificationsClient({ notifications: initial }: Props) {
  const [notifications, setNotifications] = useState(initial);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    startTransition(() => markReadAction(id));
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    startTransition(() => markAllReadAction());
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
            <Check className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Bell className="h-12 w-12 opacity-20" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {notifications.map((n) => {
            const Icon = getIcon(n.type);
            const item = (
              <div
                className={cn(
                  "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors relative",
                  !n.isRead && "bg-primary/5"
                )}
              >
                {!n.isRead && (
                  <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
                <div className="mt-0.5 shrink-0 rounded-full bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm">{getNotificationMessage(n)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeDate(n.createdAt)}
                  </p>
                </div>
              </div>
            );

            if (n.href) {
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => handleMarkRead(n.id)}
                  className="block"
                >
                  {item}
                </Link>
              );
            }

            return (
              <button
                key={n.id}
                className="block w-full text-left"
                onClick={() => handleMarkRead(n.id)}
              >
                {item}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

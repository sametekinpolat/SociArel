"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export type SerializedNotification = {
  id: string;
  type: "REPLY" | "MENTION" | "DIRECT_MESSAGE" | "COMMUNITY_INVITE" | "COMMUNITY_EVENT";
  isRead: boolean;
  createdAt: string;
  actorHandle: string | null;
  postId: string | null;
  postTitle: string | null;
  communityName: string | null;
  commentId: string | null;
  inviteCommunityName: string | null;
  href: string | null;
};

export async function getNotificationsAction(): Promise<SerializedNotification[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: { select: { username: true, name: true } },
      post: {
        select: {
          id: true,
          title: true,
          community: { select: { name: true } },
        },
      },
      comment: { select: { id: true } },
      invite: {
        select: { community: { select: { name: true } } },
      },
    },
  });

  return notifications.map((n) => {
    const actorHandle = n.actor?.username || n.actor?.name || null;
    const postId = n.post?.id ?? null;
    const postTitle = n.post?.title ?? null;
    const communityName = n.post?.community?.name ?? null;
    const commentId = n.comment?.id ?? null;
    const inviteCommunityName = n.invite?.community?.name ?? null;

    let href: string | null = null;
    if (postId && postTitle && communityName) {
      href = `/communities/${communityName}/comments/${postId}/${slugify(postTitle)}`;
      if (commentId) href += `#comment-${commentId}`;
    } else if (inviteCommunityName) {
      href = `/communities/${inviteCommunityName}`;
    }

    return {
      id: n.id,
      type: n.type as SerializedNotification["type"],
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      actorHandle,
      postId,
      postTitle,
      communityName,
      commentId,
      inviteCommunityName,
      href,
    };
  });
}

export async function markReadAction(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { isRead: true },
  });

  revalidatePath("/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/notifications");
}

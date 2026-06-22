import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PostStatus } from "@/generated/prisma/client";
import { PostPageClient } from "@/components/post-page-client";

export const dynamic = "force-dynamic";

type Params = Promise<{ name: string; id: string; slug: string }>;

export default async function PostPage({ params }: { params: Params }) {
  // Only `id` is used for the DB lookup.
  // `name` and `slug` are in the URL for SEO — the slug is never validated.
  const { id } = await params;
  const session = await auth();
  const currentUserId = session?.user?.id ?? "";

  const [post, blockedUserIds] = await Promise.all([
    prisma.post.findUnique({
      where: { id, isDeleted: false, status: PostStatus.PUBLISHED },
      select: {
        id: true,
        title: true,
        body: true,
        isPinned: true,
        upvotes: true,
        downvotes: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            image: true,
            postKarma: true,
            commentKarma: true,
          },
        },
        community: { select: { id: true, name: true } },
        votes: {
          where: {
            userId: currentUserId || "00000000-0000-0000-0000-000000000000",
          },
          select: { voteValue: true },
        },
        _count: {
          select: { comments: { where: { isDeleted: false } } },
        },
        event: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            _count: { select: { participants: true } },
            participants: {
              where: { userId: currentUserId || "00000000-0000-0000-0000-000000000000" },
              select: { userId: true },
            },
          },
        },
      },
    }),
    currentUserId
      ? prisma.userBlock
          .findMany({
            where: { blockerId: currentUserId },
            select: { blockedId: true },
          })
          .then((rows) => rows.map((r) => r.blockedId))
      : Promise.resolve([] as string[]),
  ]);

  if (!post) notFound();

  const rawComments = await prisma.comment.findMany({
    where: { postId: post.id },
    select: {
      id: true,
      body: true,
      isPinned: true,
      isDeleted: true,
      removedByMod: true,
      upvotes: true,
      downvotes: true,
      createdAt: true,
      parentCommentId: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          image: true,
          postKarma: true,
          commentKarma: true,
        },
      },
      votes: {
        where: {
          userId: currentUserId || "00000000-0000-0000-0000-000000000000",
        },
        select: { voteValue: true },
      },
      saves: {
        where: {
          userId: currentUserId || "00000000-0000-0000-0000-000000000000",
        },
        select: { savedAt: true },
      },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "asc" }],
  });

  const serializedPost = {
    id: post.id,
    title: post.title,
    body: post.body,
    isPinned: post.isPinned,
    upvotes: post.upvotes,
    downvotes: post.downvotes,
    myVote: (post.votes[0]?.voteValue ?? null) as 1 | -1 | null,
    createdAt: post.createdAt.toISOString(),
    authorId: post.userId,
    authorHandle: post.user.username ?? post.user.name ?? "deleted",
    authorKarma: post.user.postKarma + post.user.commentKarma,
    communityName: post.community.name,
    commentCount: post._count.comments,
    event: post.event
      ? {
          id: post.event.id,
          startTime: post.event.startTime.toISOString(),
          endTime: post.event.endTime.toISOString(),
          participantCount: post.event._count.participants,
          isParticipating: post.event.participants.length > 0,
        }
      : null,
  };

  const serializedComments = rawComments.map((c) => ({
    id: c.id,
    body: c.isDeleted ? null : c.body,
    isPinned: c.isPinned,
    isDeleted: c.isDeleted,
    removedByMod: c.removedByMod,
    upvotes: c.upvotes,
    downvotes: c.downvotes,
    createdAt: c.createdAt.toISOString(),
    parentCommentId: c.parentCommentId,
    authorId: c.userId,
    authorHandle: c.user.username ?? c.user.name ?? "deleted",
    authorKarma: c.user.postKarma + c.user.commentKarma,
    myVote: c.votes[0]?.voteValue ?? null,
    isSaved: c.saves.length > 0,
    isHidden: blockedUserIds.includes(c.userId),
  }));

  return (
    <PostPageClient
      post={serializedPost}
      comments={serializedComments}
      currentUserId={currentUserId || null}
    />
  );
}

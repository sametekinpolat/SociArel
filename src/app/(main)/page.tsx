import { auth } from "@/auth";
import { PostStatus } from "@/generated/prisma/client";
import { HomePageClient } from "@/components/home-page-client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();

  let joinedCommunities: { id: string; name: string }[] = [];
  if (session?.user?.id) {
    const memberships = await prisma.communityMember.findMany({
      where: { userId: session.user.id, community: { isUserProfile: false } },
      include: { community: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "desc" },
    });
    joinedCommunities = memberships.map((m) => ({
      id: m.community.id,
      name: m.community.name,
    }));
  }

  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      isDeleted: false,
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: {
      user: {
        select: {
          name: true,
          username: true,
          email: true,
        },
      },
      community: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
      event: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          _count: { select: { participants: true } },
          participants: {
            where: { userId: session?.user?.id ?? "00000000-0000-0000-0000-000000000000" },
            select: { userId: true },
          },
        },
      },
    },
    take: 25,
  });

  let myVoteMap: Record<string, 1 | -1> = {};
  if (session?.user?.id && posts.length > 0) {
    const votes = await prisma.postVote.findMany({
      where: { userId: session.user.id, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true, voteValue: true },
    });
    votes.forEach((v) => {
      myVoteMap[v.postId] = v.voteValue as 1 | -1;
    });
  }

  const feedPosts = posts.map((post) => ({
    id: post.id,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt.toISOString(),
    upvotes: post.upvotes,
    downvotes: post.downvotes,
    myVote: (myVoteMap[post.id] ?? null) as 1 | -1 | null,
    commentCount: post._count.comments,
    communityName: post.community.name,
    authorName:
      post.user.name || post.user.username || post.user.email || "Anonymous",
    authorHandle:
      post.user.username || post.user.email?.split("@")[0] || "anonymous",
    authorId: post.userId,
    event: post.event
      ? {
          id: post.event.id,
          startTime: post.event.startTime.toISOString(),
          endTime: post.event.endTime.toISOString(),
          participantCount: post.event._count.participants,
          isParticipating: post.event.participants.length > 0,
        }
      : null,
  }));

  return <HomePageClient posts={feedPosts} joinedCommunities={joinedCommunities} />;
}

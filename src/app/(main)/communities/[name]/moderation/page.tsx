import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getModerationContext } from "@/lib/moderation/permissions";
import { ModerationPanel } from "@/components/moderation/panel";

export const dynamic = "force-dynamic";

type Params = Promise<{ name: string }>;

export default async function CommunityModerationPage({ params }: { params: Params }) {
  const { name } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const community = await prisma.community.findUnique({
    where: { name },
    select: { id: true, name: true, ownerId: true, status: true },
  });
  if (!community) notFound();

  const ctx = await getModerationContext(session.user.id, community.id);
  if (!ctx.hasAnyAccess) redirect(`/communities/${name}`);

  // Fetch all panel data in parallel
  const [reports, posts, comments, restrictions, modLogs, rules, moderators] =
    await Promise.all([
      prisma.report.findMany({
        where: { communityId: community.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          status: true,
          customReason: true,
          createdAt: true,
          reporter: { select: { username: true, email: true } },
          reportedUser: { select: { username: true, email: true } },
          post: { select: { id: true, title: true } },
          comment: { select: { id: true, body: true } },
          rule: { select: { title: true } },
        },
      }),
      prisma.post.findMany({
        where: { communityId: community.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          status: true,
          isPinned: true,
          isDeleted: true,
          createdAt: true,
          user: { select: { username: true, email: true } },
        },
      }),
      prisma.comment.findMany({
        where: { post: { communityId: community.id } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          body: true,
          isDeleted: true,
          createdAt: true,
          user: { select: { username: true, email: true } },
          post: { select: { id: true, title: true } },
        },
      }),
      prisma.communityRestriction.findMany({
        where: {
          communityId: community.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
          user: { select: { id: true, username: true, email: true } },
          moderator: { select: { username: true, email: true } },
        },
      }),
      prisma.modLog.findMany({
        where: { communityId: community.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          moderator: { select: { username: true, email: true } },
          targetUser: { select: { username: true, email: true } },
          targetPost: { select: { title: true } },
          targetComment: { select: { body: true } },
        },
      }),
      prisma.communityRule.findMany({
        where: { communityId: community.id },
        orderBy: { displayOrder: "asc" },
        select: { id: true, title: true, description: true, displayOrder: true },
      }),
      prisma.communityModerator.findMany({
        where: { communityId: community.id },
        select: {
          userId: true,
          canManageSettings: true,
          canManagePosts: true,
          canRestrictUsers: true,
          user: { select: { username: true, email: true } },
        },
      }),
    ]);

  return (
    <ModerationPanel
      community={{ ...community, status: community.status as string }}
      ctx={ctx}
      reports={reports.map((r) => ({ ...r, status: r.status as string }))}
      posts={posts.map((p) => ({ ...p, status: p.status as string }))}
      comments={comments}
      restrictions={restrictions.map((r) => ({ ...r, type: r.type as string }))}
      modLogs={modLogs.map((l) => ({ ...l, action: l.action as string }))}
      rules={rules}
      moderators={moderators}
    />
  );
}

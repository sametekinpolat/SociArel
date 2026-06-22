"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getModerationContext } from "@/lib/moderation/permissions";
import {
  ModActionType,
  ReportStatus,
  RestrictionType,
  PostStatus,
  CommunityStatus,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

type ModerationResult = {
  error?: string;
  success?: string;
};

// ─── Internal helper: write audit log ────────────────────────────────────────

async function writeModLog(
  tx: Prisma.TransactionClient,
  data: {
    communityId: string;
    moderatorId: string;
    action: ModActionType;
    targetUserId?: string;
    targetPostId?: string;
    targetCommentId?: string;
    details?: Record<string, unknown>;
  }
) {
  return tx.modLog.create({
    data: {
      communityId: data.communityId,
      moderatorId: data.moderatorId,
      action: data.action,
      targetUserId: data.targetUserId ?? null,
      targetPostId: data.targetPostId ?? null,
      targetCommentId: data.targetCommentId ?? null,
      details: data.details ? (data.details as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function resolveReportAction(
  reportId: string,
  communityId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.hasAnyAccess) return { error: "Unauthorized." };

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true, communityId: true },
  });

  if (!report) return { error: "Report not found." };
  if (report.communityId !== communityId)
    return { error: "Report does not belong to this community." };
  if (report.status !== ReportStatus.PENDING)
    return { error: "This report has already been reviewed." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.RESOLVED },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.RESOLVE_REPORT,
        details: { reportId },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Report resolved." };
  } catch (error) {
    console.error("resolveReportAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function dismissReportAction(
  reportId: string,
  communityId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.hasAnyAccess) return { error: "Unauthorized." };

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true, communityId: true },
  });

  if (!report) return { error: "Report not found." };
  if (report.communityId !== communityId)
    return { error: "Report does not belong to this community." };
  if (report.status !== ReportStatus.PENDING)
    return { error: "This report has already been reviewed." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.DISMISSED },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.DISMISS_REPORT,
        details: { reportId },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Report dismissed." };
  } catch (error) {
    console.error("dismissReportAction failed", error);
    return { error: "Something went wrong." };
  }
}

export type ReportUserAction = "none" | "mute_1d" | "mute_2d" | "mute_7d" | "ban";

export async function resolveReportWithActionAction(
  reportId: string,
  communityId: string,
  userAction: ReportUserAction,
  reason?: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.hasAnyAccess) return { error: "Unauthorized." };
  if (userAction !== "none" && !ctx.canRestrictUsers)
    return { error: "You don't have permission to restrict users." };

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true, communityId: true, reportedUserId: true, commentId: true },
  });

  if (!report) return { error: "Report not found." };
  if (report.communityId !== communityId)
    return { error: "Report does not belong to this community." };
  if (report.status !== ReportStatus.PENDING)
    return { error: "This report has already been reviewed." };

  if (userAction !== "none" && !report.reportedUserId)
    return { error: "No user associated with this report to restrict." };

  if (userAction !== "none" && report.reportedUserId) {
    if (report.reportedUserId === session.user.id)
      return { error: "You cannot restrict yourself." };

    const restrictionType =
      userAction === "ban" ? RestrictionType.BAN : RestrictionType.MUTE;
    const existing = await prisma.communityRestriction.findFirst({
      where: {
        communityId,
        userId: report.reportedUserId,
        type: restrictionType,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (existing)
      return {
        error: `User already has an active ${userAction === "ban" ? "ban" : "mute"} in this community.`,
      };
  }

  const durationDays =
    userAction === "mute_1d" ? 1 : userAction === "mute_2d" ? 2 : userAction === "mute_7d" ? 7 : null;
  const expiresAt = durationDays
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.RESOLVED },
      });

      if (report.commentId) {
        await tx.comment.update({
          where: { id: report.commentId },
          data: { isDeleted: true, removedByMod: true },
        });
        await writeModLog(tx, {
          communityId,
          moderatorId: session.user.id,
          action: ModActionType.REMOVE_COMMENT,
          targetCommentId: report.commentId,
          details: { reason: reason ?? null, via: "report_resolve" },
        });
      }

      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.RESOLVE_REPORT,
        details: { reportId, userAction },
      });

      if (userAction !== "none" && report.reportedUserId) {
        const restrictionType =
          userAction === "ban" ? RestrictionType.BAN : RestrictionType.MUTE;
        const restriction = await tx.communityRestriction.create({
          data: {
            communityId,
            userId: report.reportedUserId,
            moderatorId: session.user.id,
            type: restrictionType,
            reason: reason ?? null,
            expiresAt: userAction === "ban" ? null : expiresAt,
          },
          select: { id: true },
        });
        await writeModLog(tx, {
          communityId,
          moderatorId: session.user.id,
          action: userAction === "ban" ? ModActionType.BAN_USER : ModActionType.MUTE_USER,
          targetUserId: report.reportedUserId,
          details: {
            reason: reason ?? null,
            restrictionId: restriction.id,
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        });
      }
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    const label =
      userAction === "none"
        ? "Report resolved."
        : userAction === "ban"
        ? "Report resolved and user permanently banned."
        : `Report resolved and user muted for ${durationDays} day${durationDays === 1 ? "" : "s"}.`;
    return { success: label };
  } catch (error) {
    console.error("resolveReportWithActionAction failed", error);
    return { error: "Something went wrong." };
  }
}

// ─── Post Moderation ──────────────────────────────────────────────────────────

export async function removePostAction(
  postId: string,
  communityId: string,
  reason?: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canManagePosts)
    return { error: "Unauthorized: post management permission required." };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { status: true, isDeleted: true, communityId: true },
  });

  if (!post || post.isDeleted) return { error: "Post not found." };
  if (post.communityId !== communityId)
    return { error: "Post does not belong to this community." };
  if (post.status === PostStatus.REMOVED)
    return { error: "Post has already been removed." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: postId },
        data: { status: PostStatus.REMOVED, isDeleted: true },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.REMOVE_POST,
        targetPostId: postId,
        details: { reason: reason ?? null },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Post removed." };
  } catch (error) {
    console.error("removePostAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function removeCommentAction(
  commentId: string,
  communityId: string,
  reason?: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canManagePosts) return { error: "Unauthorized." };

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { isDeleted: true, post: { select: { communityId: true } } },
  });

  if (!comment || comment.isDeleted) return { error: "Comment not found." };
  if (comment.post.communityId !== communityId)
    return { error: "Comment does not belong to this community." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { isDeleted: true, removedByMod: true },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.REMOVE_COMMENT,
        targetCommentId: commentId,
        details: { reason: reason ?? null },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Comment removed." };
  } catch (error) {
    console.error("removeCommentAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function pinPostAction(
  postId: string,
  communityId: string,
  pin: boolean
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canManagePosts) return { error: "Unauthorized." };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { isDeleted: true, communityId: true, community: { select: { name: true } } },
  });

  if (!post || post.isDeleted) return { error: "Post not found." };
  if (post.communityId !== communityId)
    return { error: "Post does not belong to this community." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: postId }, data: { isPinned: pin } });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: pin ? ModActionType.PIN_POST : ModActionType.UNPIN_POST,
        targetPostId: postId,
      });
    });

    revalidatePath(`/communities/${post.community.name}`);
    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: pin ? "Post pinned." : "Post unpinned." };
  } catch (error) {
    console.error("pinPostAction failed", error);
    return { error: "Something went wrong." };
  }
}

// ─── User Restrictions ────────────────────────────────────────────────────────

export async function muteUserAction(
  targetUsername: string, // Changed to username
  communityId: string,
  reason?: string,
  expiresAt?: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canRestrictUsers)
    return { error: "Unauthorized: user restriction permission required." };

  // 1. Resolve the username to a UUID
  const targetUser = await prisma.user.findUnique({
    where: { username: targetUsername },
    select: { id: true },
  });

  if (!targetUser) return { error: "User not found." };
  
  const targetUserId = targetUser.id;

  // 2. Check if restricting self
  if (targetUserId === session.user.id)
    return { error: "You cannot restrict yourself." };;

  const existing = await prisma.communityRestriction.findFirst({
    where: {
      communityId,
      userId: targetUserId,
      type: RestrictionType.MUTE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (existing)
    return { error: "This user already has an active mute in this community." };

  try {
    await prisma.$transaction(async (tx) => {
      const restriction = await tx.communityRestriction.create({
        data: {
          communityId,
          userId: targetUserId,
          moderatorId: session.user.id,
          type: RestrictionType.MUTE,
          reason: reason ?? null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: { id: true },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.MUTE_USER,
        targetUserId,
        details: { reason: reason ?? null, restrictionId: restriction.id, expiresAt: expiresAt ?? null },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "User muted." };
  } catch (error) {
    console.error("muteUserAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function banUserAction(
  targetUsername: string, // Changed to username
  communityId: string,
  reason?: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canRestrictUsers) return { error: "Unauthorized." };

  // 1. Resolve the username to a UUID
  const targetUser = await prisma.user.findUnique({
    where: { username: targetUsername },
    select: { id: true },
  });

  if (!targetUser) return { error: "User not found." };
  
  const targetUserId = targetUser.id;

  // 2. Check if restricting self
  if (targetUserId === session.user.id)
  return { error: "You cannot restrict yourself." };
  const existing = await prisma.communityRestriction.findFirst({
    where: {
      communityId,
      userId: targetUserId,
      type: RestrictionType.BAN,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (existing)
    return { error: "This user is already banned from this community." };

  try {
    await prisma.$transaction(async (tx) => {
      const restriction = await tx.communityRestriction.create({
        data: {
          communityId,
          userId: targetUserId,
          moderatorId: session.user.id,
          type: RestrictionType.BAN,
          reason: reason ?? null,
        },
        select: { id: true },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.BAN_USER,
        targetUserId,
        details: { reason: reason ?? null, restrictionId: restriction.id },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "User banned." };
  } catch (error) {
    console.error("banUserAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function revokeRestrictionAction(
  restrictionId: string,
  communityId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canRestrictUsers) return { error: "Unauthorized." };

  const restriction = await prisma.communityRestriction.findUnique({
    where: { id: restrictionId },
    select: { communityId: true, userId: true, type: true },
  });

  if (!restriction) return { error: "Restriction not found." };
  if (restriction.communityId !== communityId)
    return { error: "Restriction does not belong to this community." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityRestriction.delete({ where: { id: restrictionId } });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action:
          restriction.type === RestrictionType.BAN
            ? ModActionType.UNBAN_USER
            : ModActionType.UNMUTE_USER,
        targetUserId: restriction.userId,
        details: { restrictionId },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Restriction revoked." };
  } catch (error) {
    console.error("revokeRestrictionAction failed", error);
    return { error: "Something went wrong." };
  }
}

// ─── Community Settings ───────────────────────────────────────────────────────

export async function deleteRuleAction(
  ruleId: string,
  communityId: string,
  communityName: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canManageSettings) return { error: "Unauthorized." };

  const rule = await prisma.communityRule.findUnique({
    where: { id: ruleId },
    select: { communityId: true },
  });
  if (!rule) return { error: "Rule not found." };
  if (rule.communityId !== communityId)
    return { error: "Rule does not belong to this community." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityRule.delete({ where: { id: ruleId } });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.UPDATE_SETTINGS,
        details: { ruleDeleted: ruleId },
      });
    });

    revalidatePath(`/communities/${communityName}/moderation`);
    revalidatePath(`/communities/${communityName}`);
    return { success: "Rule deleted." };
  } catch (error) {
    console.error("deleteRuleAction failed", error);
    return { error: "Something went wrong." };
  }
}

// ─── Governance: Moderator Roster ─────────────────────────────────────────────

export async function assignModeratorAction(
  targetUserId: string,
  communityId: string,
  permissions: {
    canManageSettings: boolean;
    canManagePosts: boolean;
    canRestrictUsers: boolean;
  }
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canGovernCommunity)
    return {
      error:
        "Unauthorized: only owners and global moderators can manage the moderator roster.",
    };
  if (targetUserId === session.user.id)
    return { error: "You cannot reassign your own moderator record this way." };

  const member = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: targetUserId, communityId } },
    select: { userId: true },
  });
  if (!member)
    return { error: "User must be a community member to be assigned as moderator." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityModerator.upsert({
        where: { userId_communityId: { userId: targetUserId, communityId } },
        update: permissions,
        create: { userId: targetUserId, communityId, ...permissions },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.ASSIGN_MODERATOR,
        targetUserId,
        details: { permissions },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Moderator assigned." };
  } catch (error) {
    console.error("assignModeratorAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function removeModeratorAction(
  targetUserId: string,
  communityId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canGovernCommunity) return { error: "Unauthorized." };

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { ownerId: true },
  });
  if (community?.ownerId === targetUserId)
    return { error: "You cannot remove the community owner from the moderator roster." };

  const modRecord = await prisma.communityModerator.findUnique({
    where: { userId_communityId: { userId: targetUserId, communityId } },
    select: { userId: true },
  });
  if (!modRecord) return { error: "User is not a moderator of this community." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityModerator.delete({
        where: { userId_communityId: { userId: targetUserId, communityId } },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.REMOVE_MODERATOR,
        targetUserId,
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Moderator removed." };
  } catch (error) {
    console.error("removeModeratorAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function updateModeratorPermissionsAction(
  targetUserId: string,
  communityId: string,
  permissions: {
    canManageSettings: boolean;
    canManagePosts: boolean;
    canRestrictUsers: boolean;
  }
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canGovernCommunity) return { error: "Unauthorized." };

  const modRecord = await prisma.communityModerator.findUnique({
    where: { userId_communityId: { userId: targetUserId, communityId } },
    select: { userId: true },
  });
  if (!modRecord) return { error: "User is not a moderator of this community." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityModerator.update({
        where: { userId_communityId: { userId: targetUserId, communityId } },
        data: permissions,
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.UPDATE_MODERATOR_PERMISSIONS,
        targetUserId,
        details: { permissions },
      });
    });

    revalidatePath(`/communities/${communityId}/moderation`);
    return { success: "Moderator permissions updated." };
  } catch (error) {
    console.error("updateModeratorPermissionsAction failed", error);
    return { error: "Something went wrong." };
  }
}

// ─── Governance: Community Lifecycle ─────────────────────────────────────────

export async function closeCommunityAction(
  communityId: string,
  reason?: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canGovernCommunity)
    return {
      error: "Unauthorized: only owners and global moderators can close communities.",
    };

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { status: true, name: true },
  });
  if (!community) return { error: "Community not found." };
  if (community.status === CommunityStatus.CLOSED)
    return { error: "Community is already closed." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.community.update({
        where: { id: communityId },
        data: { status: CommunityStatus.CLOSED },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.CLOSE_COMMUNITY,
        details: { reason: reason ?? null },
      });
    });

    revalidatePath(`/communities/${community.name}`);
    revalidatePath(`/communities/${community.name}/moderation`);
    return { success: "Community closed." };
  } catch (error) {
    console.error("closeCommunityAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function reopenCommunityAction(
  communityId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  const ctx = await getModerationContext(session.user.id, communityId);
  if (!ctx.canGovernCommunity) return { error: "Unauthorized." };

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { status: true, name: true },
  });
  if (!community) return { error: "Community not found." };
  if (community.status === CommunityStatus.ACTIVE)
    return { error: "Community is already active." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.community.update({
        where: { id: communityId },
        data: { status: CommunityStatus.ACTIVE },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.REOPEN_COMMUNITY,
      });
    });

    revalidatePath(`/communities/${community.name}`);
    return { success: "Community reopened." };
  } catch (error) {
    console.error("reopenCommunityAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function transferOwnershipAction(
  communityId: string,
  newOwnerId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  // Only the current owner can transfer — global mods cannot override this
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { ownerId: true, name: true },
  });
  if (!community) return { error: "Community not found." };
  if (community.ownerId !== session.user.id)
    return { error: "Only the current owner can transfer ownership." };
  if (newOwnerId === session.user.id)
    return { error: "You are already the owner." };

  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerId },
    select: { id: true },
  });
  if (!newOwner) return { error: "Target user not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.community.update({
        where: { id: communityId },
        data: { ownerId: newOwnerId },
      });
      // Ensure new owner has full moderator permissions
      await tx.communityModerator.upsert({
        where: { userId_communityId: { userId: newOwnerId, communityId } },
        update: { canManageSettings: true, canManagePosts: true, canRestrictUsers: true },
        create: {
          userId: newOwnerId,
          communityId,
          canManageSettings: true,
          canManagePosts: true,
          canRestrictUsers: true,
        },
      });
      await writeModLog(tx, {
        communityId,
        moderatorId: session.user.id,
        action: ModActionType.TRANSFER_COMMUNITY_OWNERSHIP,
        targetUserId: newOwnerId,
      });
    });

    revalidatePath(`/communities/${community.name}`);
    revalidatePath(`/communities/${community.name}/moderation`);
    return { success: "Ownership transferred." };
  } catch (error) {
    console.error("transferOwnershipAction failed", error);
    return { error: "Something went wrong." };
  }
}

export async function deleteCommunityAction(
  communityId: string
): Promise<ModerationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please log in." };

  // Only the current owner can delete
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { ownerId: true, name: true },
  });
  if (!community) return { error: "Community not found." };
  if (community.ownerId !== session.user.id)
    return { error: "Only the owner can delete this community." };

  try {
    // Cascade deletes handle related records (posts, members, etc.)
    await prisma.community.delete({ where: { id: communityId } });
    revalidatePath("/communities");
    return { success: "Community deleted." };
  } catch (error) {
    console.error("deleteCommunityAction failed", error);
    return { error: "Something went wrong." };
  }
}

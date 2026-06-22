import { prisma } from "@/lib/prisma";

export type ModerationContext = {
  isGlobalModerator: boolean;
  isCommunityOwner: boolean;
  isCommunityModerator: boolean;
  canManagePosts: boolean;
  canRestrictUsers: boolean;
  canManageSettings: boolean;
  /** Owner or global moderator — can perform lifecycle governance */
  canGovernCommunity: boolean;
  hasAnyAccess: boolean;
};

/**
 * Fetch all moderation permissions for a user in a specific community in one
 * round-trip. Use this inside server actions and page guards instead of
 * issuing separate per-permission queries.
 */
export async function getModerationContext(
  userId: string,
  communityId: string
): Promise<ModerationContext> {
  const [globalMod, community, modRecord] = await Promise.all([
    prisma.globalModerator.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.community.findUnique({ where: { id: communityId }, select: { ownerId: true } }),
    prisma.communityModerator.findUnique({
      where: { userId_communityId: { userId, communityId } },
      select: { canManagePosts: true, canRestrictUsers: true, canManageSettings: true },
    }),
  ]);

  const isGlobal = globalMod !== null;
  const isOwner = community?.ownerId === userId;
  const isMod = modRecord !== null;

  return {
    isGlobalModerator: isGlobal,
    isCommunityOwner: isOwner,
    isCommunityModerator: isMod,
    canManagePosts: isGlobal || isOwner || (modRecord?.canManagePosts ?? false),
    canRestrictUsers: isGlobal || isOwner || (modRecord?.canRestrictUsers ?? false),
    canManageSettings: isGlobal || isOwner || (modRecord?.canManageSettings ?? false),
    canGovernCommunity: isGlobal || isOwner,
    hasAnyAccess: isGlobal || isOwner || isMod,
  };
}

/**
 * Returns the set of community IDs a user can moderate:
 * - Global mods get an empty array here (callers treat them as all-communities)
 * - Community mods get their assigned community IDs
 */
export async function getModeratorScope(userId: string): Promise<{
  isGlobalModerator: boolean;
  assignedCommunityIds: string[];
}> {
  const [globalMod, modRecords] = await Promise.all([
    prisma.globalModerator.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.communityModerator.findMany({
      where: { userId },
      select: { communityId: true },
    }),
  ]);

  return {
    isGlobalModerator: globalMod !== null,
    assignedCommunityIds: modRecords.map((r) => r.communityId),
  };
}

-- AlterEnum: extend ModActionType with governance and audit action types
ALTER TYPE "ModActionType" ADD VALUE 'UNBAN_USER';
ALTER TYPE "ModActionType" ADD VALUE 'UNMUTE_USER';
ALTER TYPE "ModActionType" ADD VALUE 'PIN_POST';
ALTER TYPE "ModActionType" ADD VALUE 'UNPIN_POST';
ALTER TYPE "ModActionType" ADD VALUE 'ASSIGN_MODERATOR';
ALTER TYPE "ModActionType" ADD VALUE 'REMOVE_MODERATOR';
ALTER TYPE "ModActionType" ADD VALUE 'UPDATE_MODERATOR_PERMISSIONS';
ALTER TYPE "ModActionType" ADD VALUE 'CLOSE_COMMUNITY';
ALTER TYPE "ModActionType" ADD VALUE 'REOPEN_COMMUNITY';
ALTER TYPE "ModActionType" ADD VALUE 'DELETE_COMMUNITY';
ALTER TYPE "ModActionType" ADD VALUE 'TRANSFER_COMMUNITY_OWNERSHIP';
ALTER TYPE "ModActionType" ADD VALUE 'RESOLVE_REPORT';
ALTER TYPE "ModActionType" ADD VALUE 'DISMISS_REPORT';

-- CreateEnum: community lifecycle status
CREATE TYPE "CommunityStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterTable: add status column to Community
ALTER TABLE "Community" ADD COLUMN "status" "CommunityStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex: Report indexes for efficient queue queries
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "Report_communityId_idx" ON "Report"("communityId");

-- CreateIndex: CommunityRestriction indexes for restriction lookups
CREATE INDEX "CommunityRestriction_communityId_idx" ON "CommunityRestriction"("communityId");
CREATE INDEX "CommunityRestriction_userId_idx" ON "CommunityRestriction"("userId");

-- CreateIndex: ModLog indexes for audit trail queries
CREATE INDEX "ModLog_communityId_idx" ON "ModLog"("communityId");
CREATE INDEX "ModLog_moderatorId_idx" ON "ModLog"("moderatorId");

-- CreateIndex: Post composite index for moderation panel queries
CREATE INDEX "Post_communityId_status_isDeleted_idx" ON "Post"("communityId", "status", "isDeleted");

-- CreateIndex: Comment index for parent post queries
CREATE INDEX "Comment_postId_isDeleted_idx" ON "Comment"("postId", "isDeleted");

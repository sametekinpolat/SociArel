"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NotificationType, PostStatus } from "@/generated/prisma/client";
import { slugify } from "@/lib/utils";

const CommentBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(10000, "Comment is too long."),
});

export type CommentActionResult = {
  error?: string;
  success?: string;
};

export async function createCommentAction(
  postId: string,
  body: string,
  parentCommentId?: string
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in to comment." };

  const validated = CommentBodySchema.safeParse({ body });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid comment." };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId, isDeleted: false, status: PostStatus.PUBLISHED },
    select: { id: true, title: true, userId: true, community: { select: { id: true, name: true } } },
  });
  if (!post) return { error: "Post not found." };

  const restriction = await prisma.communityRestriction.findFirst({
    where: {
      communityId: post.community.id,
      userId: session.user.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { type: true },
  });
  if (restriction) {
    return {
      error:
        restriction.type === "BAN"
          ? "You are banned from this community."
          : "You are muted in this community and cannot comment.",
    };
  }

  let parentAuthorId: string | null = null;
  if (parentCommentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentCommentId, postId },
      select: { id: true, userId: true },
    });
    if (!parent) return { error: "Parent comment not found." };
    parentAuthorId = parent.userId;
  }

  try {
    // Use interactive transaction so we can reference the new comment's id for self-vote.
    // Self-vote does NOT count toward comment karma (see AC #58).
    await prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          postId,
          userId: session.user.id,
          body: validated.data.body,
          parentCommentId: parentCommentId ?? null,
          upvotes: 1, // author self-vote
        },
        select: { id: true },
      });

      await tx.commentVote.create({
        data: {
          userId: session.user.id,
          commentId: comment.id,
          voteValue: 1,
        },
      });

      const notifyUserId = parentCommentId
        ? (parentAuthorId !== session.user.id ? parentAuthorId : null)
        : (post.userId !== session.user.id ? post.userId : null);

      if (notifyUserId) {
        await tx.notification.create({
          data: {
            userId: notifyUserId,
            actorId: session.user.id,
            type: NotificationType.REPLY,
            postId,
            commentId: comment.id,
          },
        });
      }
    });

    revalidatePath(
      `/communities/${post.community.name}/comments/${postId}/${slugify(post.title)}`
    );
    return { success: "Comment posted." };
  } catch {
    return { error: "Something went wrong." };
  }
}

export async function editCommentAction(
  commentId: string,
  body: string
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in." };

  const validated = CommentBodySchema.safeParse({ body });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid comment." };
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, isDeleted: false },
    select: {
      userId: true,
      body: true,
      postId: true,
      post: { select: { title: true, community: { select: { name: true } } } },
    },
  });

  if (!comment) return { error: "Comment not found." };
  if (comment.userId !== session.user.id)
    return { error: "You cannot edit this comment." };

  try {
    await prisma.$transaction([
      prisma.commentEditHistory.create({
        data: { commentId, previousBody: comment.body },
      }),
      prisma.comment.update({
        where: { id: commentId },
        data: { body: validated.data.body },
      }),
    ]);

    revalidatePath(
      `/communities/${comment.post.community.name}/comments/${comment.postId}/${slugify(comment.post.title)}`
    );
    return { success: "Comment updated." };
  } catch {
    return { error: "Something went wrong." };
  }
}

export async function deleteCommentAction(
  commentId: string
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in." };

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, isDeleted: false },
    select: {
      userId: true,
      postId: true,
      post: { select: { title: true, community: { select: { name: true } } } },
    },
  });

  if (!comment) return { error: "Comment not found." };
  if (comment.userId !== session.user.id)
    return { error: "You cannot delete this comment." };

  try {
    await prisma.comment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });

    revalidatePath(
      `/communities/${comment.post.community.name}/comments/${comment.postId}/${slugify(comment.post.title)}`
    );
    return { success: "Comment deleted." };
  } catch {
    return { error: "Something went wrong." };
  }
}

export async function voteCommentAction(
  commentId: string,
  voteValue: 1 | -1
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in to vote." };

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, isDeleted: false },
    select: {
      id: true,
      userId: true,
      postId: true,
      post: { select: { title: true, community: { select: { name: true } } } },
    },
  });
  if (!comment) return { error: "Comment not found." };

  // Self-votes never affect karma (AC #58)
  const isSelfVote = comment.userId === session.user.id;

  const existing = await prisma.commentVote.findUnique({
    where: { userId_commentId: { userId: session.user.id, commentId } },
  });

  try {
    if (existing) {
      if (existing.voteValue === voteValue) {
        // Toggle off — remove vote
        if (isSelfVote) {
          await prisma.$transaction([
            prisma.commentVote.delete({
              where: {
                userId_commentId: { userId: session.user.id, commentId },
              },
            }),
            prisma.comment.update({
              where: { id: commentId },
              data: {
                upvotes: voteValue === 1 ? { decrement: 1 } : undefined,
                downvotes: voteValue === -1 ? { decrement: 1 } : undefined,
              },
            }),
          ]);
        } else {
          await prisma.$transaction([
            prisma.commentVote.delete({
              where: {
                userId_commentId: { userId: session.user.id, commentId },
              },
            }),
            prisma.comment.update({
              where: { id: commentId },
              data: {
                upvotes: voteValue === 1 ? { decrement: 1 } : undefined,
                downvotes: voteValue === -1 ? { decrement: 1 } : undefined,
              },
            }),
            prisma.user.update({
              where: { id: comment.userId },
              data: {
                commentKarma: voteValue === 1 ? { decrement: 1 } : { increment: 1 },
              },
            }),
          ]);
        }
      } else {
        // Change vote direction (e.g. upvote → downvote)
        // Net karma delta = newValue - oldValue (±2)
        if (isSelfVote) {
          await prisma.$transaction([
            prisma.commentVote.update({
              where: {
                userId_commentId: { userId: session.user.id, commentId },
              },
              data: { voteValue },
            }),
            prisma.comment.update({
              where: { id: commentId },
              data: {
                upvotes: voteValue === 1 ? { increment: 1 } : { decrement: 1 },
                downvotes: voteValue === -1 ? { increment: 1 } : { decrement: 1 },
              },
            }),
          ]);
        } else {
          await prisma.$transaction([
            prisma.commentVote.update({
              where: {
                userId_commentId: { userId: session.user.id, commentId },
              },
              data: { voteValue },
            }),
            prisma.comment.update({
              where: { id: commentId },
              data: {
                upvotes: voteValue === 1 ? { increment: 1 } : { decrement: 1 },
                downvotes: voteValue === -1 ? { increment: 1 } : { decrement: 1 },
              },
            }),
            prisma.user.update({
              where: { id: comment.userId },
              data: {
                // Was -1 → now +1: delta +2  |  Was +1 → now -1: delta -2
                commentKarma: voteValue === 1 ? { increment: 2 } : { decrement: 2 },
              },
            }),
          ]);
        }
      }
    } else {
      // New vote
      if (isSelfVote) {
        await prisma.$transaction([
          prisma.commentVote.create({
            data: { userId: session.user.id, commentId, voteValue },
          }),
          prisma.comment.update({
            where: { id: commentId },
            data: {
              upvotes: voteValue === 1 ? { increment: 1 } : undefined,
              downvotes: voteValue === -1 ? { increment: 1 } : undefined,
            },
          }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.commentVote.create({
            data: { userId: session.user.id, commentId, voteValue },
          }),
          prisma.comment.update({
            where: { id: commentId },
            data: {
              upvotes: voteValue === 1 ? { increment: 1 } : undefined,
              downvotes: voteValue === -1 ? { increment: 1 } : undefined,
            },
          }),
          prisma.user.update({
            where: { id: comment.userId },
            data: {
              commentKarma: voteValue === 1 ? { increment: 1 } : { decrement: 1 },
            },
          }),
        ]);
      }
    }

    revalidatePath(
      `/communities/${comment.post.community.name}/comments/${comment.postId}/${slugify(comment.post.title)}`
    );
    return { success: "Vote recorded." };
  } catch {
    return { error: "Something went wrong." };
  }
}

export async function saveCommentAction(
  commentId: string
): Promise<CommentActionResult & { saved?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in to save." };

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, isDeleted: false },
    select: { id: true, postId: true },
  });
  if (!comment) return { error: "Comment not found." };

  const existing = await prisma.savedComment.findUnique({
    where: { userId_commentId: { userId: session.user.id, commentId } },
  });

  try {
    if (existing) {
      await prisma.savedComment.delete({
        where: { userId_commentId: { userId: session.user.id, commentId } },
      });
      return { success: "Comment unsaved.", saved: false };
    } else {
      await prisma.savedComment.create({
        data: { userId: session.user.id, commentId },
      });
      return { success: "Comment saved.", saved: true };
    }
  } catch {
    return { error: "Something went wrong." };
  }
}

export async function reportCommentAction(
  commentId: string,
  reason: string
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in to report." };

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, isDeleted: false },
    select: {
      id: true,
      userId: true,
      postId: true,
      post: { select: { communityId: true } },
    },
  });
  if (!comment) return { error: "Comment not found." };

  try {
    await prisma.report.create({
      data: {
        reporterId: session.user.id,
        communityId: comment.post.communityId,
        commentId,
        reportedUserId: comment.userId,
        customReason: reason.trim() || null,
      },
    });
    return { success: "Report submitted. Thank you." };
  } catch {
    return { error: "Something went wrong." };
  }
}

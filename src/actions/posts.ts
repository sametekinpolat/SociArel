"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PostStatus } from "@/generated/prisma/client";
import { slugify } from "@/lib/utils";

const CreatePostSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120, "Title is too long."),
  body: z
    .string()
    .trim()
    .max(2000, "Post content is too long.")
    .optional()
    .transform((value) => value || ""),
  communityId: z.string().optional(),
});

export type CreatePostState = {
  error?: string;
  success?: string;
};

export type PostActionResult = {
  error?: string;
  success?: string;
};

async function getOrCreateDemoCommunity(userId: string) {
  const existingCommunity = await prisma.community.findFirst({
    where: { isUserProfile: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existingCommunity) {
    return existingCommunity;
  }

  return prisma.community.create({
    data: {
      name: "demo-feed",
      description: "Temporary community used for initial posting.",
      ownerId: userId,
    },
    select: { id: true },
  });
}

export async function createPostAction(
  _prevState: CreatePostState,
  formData: FormData
): Promise<CreatePostState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Please log in before creating a post." };
  }

  const validated = CreatePostSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    communityId: formData.get("communityId") || undefined,
  });

  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Post could not be created." };
  }

  const { title, body, communityId } = validated.data;

  try {
    let community: { id: string };

    if (communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: session.user.id, communityId } },
        select: { communityId: true },
      });
      if (!membership) {
        return { error: "You are not a member of that community." };
      }
      community = { id: communityId };
    } else {
      community = await getOrCreateDemoCommunity(session.user.id);
    }

    const ban = await prisma.communityRestriction.findFirst({
      where: {
        communityId: community.id,
        userId: session.user.id,
        type: "BAN",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (ban) return { error: "You are banned from this community." };

    // Use interactive transaction so we can reference the new post's id for self-vote.
    // Self-vote does NOT count toward post karma (see AC #58).
    await prisma.$transaction(async (tx) => {
      await tx.communityMember.upsert({
        where: {
          userId_communityId: {
            userId: session.user.id,
            communityId: community.id,
          },
        },
        update: {},
        create: {
          userId: session.user.id,
          communityId: community.id,
        },
      });

      const post = await tx.post.create({
        data: {
          title,
          body: body || null,
          status: PostStatus.PUBLISHED,
          communityId: community.id,
          userId: session.user.id,
          upvotes: 1, // author self-vote
        },
        select: { id: true },
      });

      await tx.postVote.create({
        data: {
          userId: session.user.id,
          postId: post.id,
          voteValue: 1,
        },
      });
    });

    revalidatePath("/");

    return { success: "Your post is now live in the feed." };
  } catch (error) {
    console.error("createPostAction failed", error);
    return { error: "Something went wrong while saving the post." };
  }
}

export async function updatePostAction(formData: FormData): Promise<PostActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Please log in before editing a post." };
  }

  const postId = String(formData.get("postId") || "");
  const validated = CreatePostSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });

  if (!postId) {
    return { error: "Post could not be found." };
  }

  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Post could not be updated." };
  }

  const existingPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true, isDeleted: true },
  });

  if (!existingPost || existingPost.isDeleted) {
    return { error: "Post could not be found." };
  }

  if (existingPost.userId !== session.user.id) {
    return { error: "You are not allowed to edit this post." };
  }

  const { title, body } = validated.data;

  try {
    await prisma.post.update({
      where: { id: postId },
      data: {
        title,
        body: body || null,
      },
    });

    revalidatePath("/");

    return { success: "Post updated." };
  } catch (error) {
    console.error("updatePostAction failed", error);
    return { error: "Something went wrong while updating the post." };
  }
}

export async function deletePostAction(formData: FormData): Promise<PostActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Please log in before deleting a post." };
  }

  const postId = String(formData.get("postId") || "");

  if (!postId) {
    return { error: "Post could not be found." };
  }

  const existingPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true, isDeleted: true, status: true },
  });

  if (!existingPost || existingPost.isDeleted) {
    return { error: "Post could not be found." };
  }

  if (existingPost.userId !== session.user.id) {
    return { error: "You are not allowed to delete this post." };
  }

  try {
    await prisma.post.update({
      where: { id: postId },
      data: {
        isDeleted: true,
        status: PostStatus.REMOVED,
      },
    });

    revalidatePath("/");

    return { success: "Post deleted." };
  } catch (error) {
    console.error("deletePostAction failed", error);
    return { error: "Something went wrong while deleting the post." };
  }
}

export async function votePostAction(
  postId: string,
  voteValue: 1 | -1
): Promise<PostActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in to vote." };

  const post = await prisma.post.findUnique({
    where: { id: postId, isDeleted: false, status: PostStatus.PUBLISHED },
    select: {
      id: true,
      userId: true,
      title: true,
      community: { select: { name: true } },
    },
  });
  if (!post) return { error: "Post not found." };

  // Self-votes never affect karma (AC #58)
  const isSelfVote = post.userId === session.user.id;

  const existing = await prisma.postVote.findUnique({
    where: { userId_postId: { userId: session.user.id, postId } },
  });

  try {
    if (existing) {
      if (existing.voteValue === voteValue) {
        // Toggle off — remove vote
        if (isSelfVote) {
          await prisma.$transaction([
            prisma.postVote.delete({
              where: { userId_postId: { userId: session.user.id, postId } },
            }),
            prisma.post.update({
              where: { id: postId },
              data: {
                upvotes: voteValue === 1 ? { decrement: 1 } : undefined,
                downvotes: voteValue === -1 ? { decrement: 1 } : undefined,
              },
            }),
          ]);
        } else {
          await prisma.$transaction([
            prisma.postVote.delete({
              where: { userId_postId: { userId: session.user.id, postId } },
            }),
            prisma.post.update({
              where: { id: postId },
              data: {
                upvotes: voteValue === 1 ? { decrement: 1 } : undefined,
                downvotes: voteValue === -1 ? { decrement: 1 } : undefined,
              },
            }),
            prisma.user.update({
              where: { id: post.userId },
              data: {
                postKarma: voteValue === 1 ? { decrement: 1 } : { increment: 1 },
              },
            }),
          ]);
        }
      } else {
        // Change direction (e.g. upvote → downvote)
        // Net karma delta = newValue - oldValue (±2)
        if (isSelfVote) {
          await prisma.$transaction([
            prisma.postVote.update({
              where: { userId_postId: { userId: session.user.id, postId } },
              data: { voteValue },
            }),
            prisma.post.update({
              where: { id: postId },
              data: {
                upvotes: voteValue === 1 ? { increment: 1 } : { decrement: 1 },
                downvotes: voteValue === -1 ? { increment: 1 } : { decrement: 1 },
              },
            }),
          ]);
        } else {
          await prisma.$transaction([
            prisma.postVote.update({
              where: { userId_postId: { userId: session.user.id, postId } },
              data: { voteValue },
            }),
            prisma.post.update({
              where: { id: postId },
              data: {
                upvotes: voteValue === 1 ? { increment: 1 } : { decrement: 1 },
                downvotes: voteValue === -1 ? { increment: 1 } : { decrement: 1 },
              },
            }),
            prisma.user.update({
              where: { id: post.userId },
              data: {
                // Was -1 → now +1: delta +2  |  Was +1 → now -1: delta -2
                postKarma: voteValue === 1 ? { increment: 2 } : { decrement: 2 },
              },
            }),
          ]);
        }
      }
    } else {
      // New vote
      if (isSelfVote) {
        await prisma.$transaction([
          prisma.postVote.create({
            data: { userId: session.user.id, postId, voteValue },
          }),
          prisma.post.update({
            where: { id: postId },
            data: {
              upvotes: voteValue === 1 ? { increment: 1 } : undefined,
              downvotes: voteValue === -1 ? { increment: 1 } : undefined,
            },
          }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.postVote.create({
            data: { userId: session.user.id, postId, voteValue },
          }),
          prisma.post.update({
            where: { id: postId },
            data: {
              upvotes: voteValue === 1 ? { increment: 1 } : undefined,
              downvotes: voteValue === -1 ? { increment: 1 } : undefined,
            },
          }),
          prisma.user.update({
            where: { id: post.userId },
            data: {
              postKarma: voteValue === 1 ? { increment: 1 } : { decrement: 1 },
            },
          }),
        ]);
      }
    }

    revalidatePath(`/communities/${post.community.name}`);
    revalidatePath(
      `/communities/${post.community.name}/comments/${postId}/${slugify(post.title)}`
    );
    return { success: "Vote recorded." };
  } catch (error) {
    console.error("votePostAction failed", error);
    return { error: "Something went wrong." };
  }
}

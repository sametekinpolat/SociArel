import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function GlobalModerationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Only global moderators can access this page
  const globalMod = await prisma.globalModerator.findUnique({
    where: { userId: session.user.id },
    select: { userId: true },
  });
  if (!globalMod) redirect("/");

  // Fetch communities the global mod needs to oversee — all of them
  const communities = await prisma.community.findMany({
    where: { isUserProfile: false },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      _count: {
        select: {
          reports: { where: { status: "PENDING" } },
          members: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1">Global Moderation Panel</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide view. Select a community to open its moderation panel.
        </p>
      </div>

      {communities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No communities found.</p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {communities.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  c/{c.name}
                  {c.status === "CLOSED" && (
                    <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1 rounded">
                      Closed
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c._count.members} members
                  {c._count.reports > 0 && (
                    <span className="ml-2 text-destructive font-medium">
                      {c._count.reports} pending report{c._count.reports !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/communities/${c.name}/moderation`}>Open Panel</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

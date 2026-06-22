import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getNotificationsAction } from "@/actions/notifications";
import { NotificationsClient } from "@/components/notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const notifications = await getNotificationsAction();

  return <NotificationsClient notifications={notifications} />;
}

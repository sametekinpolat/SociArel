"use client";

import { useTransition, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, XCircle } from "lucide-react";
import { setPasswordAction } from "@/actions/auth";

export default function SetPasswordPage() {
  const router = useRouter();
  const { update } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await setPasswordAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Clear mustSetPassword from the JWT. If the update call fails for any
      // reason, fall back to a full sign-out so the next sign-in gets a fresh
      // token from DB (which now has mustSetPassword = false). Without this,
      // a silent update() failure would leave the user in an infinite redirect loop.
      try {
        await update({ mustSetPassword: false });
        router.replace("/");
      } catch {
        await signOut({ callbackUrl: "/login" });
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Set your password
          </CardTitle>
          <CardDescription>
            Your account was provisioned with a temporary password. Set a
            permanent one before continuing.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center p-3 text-sm rounded bg-destructive/15 text-destructive border border-destructive/20 animate-in fade-in slide-in-from-top-2 duration-300">
                <XCircle className="h-4 w-4 mr-2 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="At least 12 characters"
                required
                minLength={12}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                placeholder="Repeat your password"
                required
                disabled={isPending}
              />
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full text-md h-10 mt-4"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Set password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

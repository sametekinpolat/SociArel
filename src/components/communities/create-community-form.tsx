"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCommunityAction } from "@/actions/communities";

export function CreateCommunityForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isNsfw, setIsNsfw] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    if (isNsfw) formData.set("isNsfw", "on");

    startTransition(async () => {
      const result = await createCommunityAction(formData);
      if (result.error) {
        setStatusMessage({ type: "error", text: result.error });
        return;
      }
      // success contains the community name
      onSuccess?.();
      router.push(`/communities/${result.success}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="community-name">Name</Label>
          <span className="text-xs text-muted-foreground">{name.length}/21</span>
        </div>
        <Input
          id="community-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 21))}
          placeholder="community_name"
          disabled={isPending}
          required
        />
        <p className="text-xs text-muted-foreground">Letters, numbers, and underscores only.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="community-description">Description <span className="text-muted-foreground">(optional)</span></Label>
          <span className="text-xs text-muted-foreground">{description.length}/500</span>
        </div>
        <textarea
          id="community-description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          placeholder="What is this community about?"
          disabled={isPending}
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="community-nsfw"
          type="checkbox"
          checked={isNsfw}
          onChange={(e) => setIsNsfw(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 rounded border-input accent-primary"
          hidden
        />
        <Label htmlFor="community-nsfw" className="cursor-pointer" hidden>
          Mark as NSFW
        </Label>
      </div>

      {statusMessage && (
        <p className={`text-sm ${statusMessage.type === "error" ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
          {statusMessage.text}
        </p>
      )}

      <Button type="submit" disabled={isPending || name.trim().length < 3}>
        {isPending ? "Creating…" : "Create Community"}
      </Button>
    </form>
  );
}

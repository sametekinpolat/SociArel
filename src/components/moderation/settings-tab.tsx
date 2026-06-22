"use client";

import { useTransition, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { addRuleAction, reorderRulesAction } from "@/actions/communities";
import { deleteRuleAction } from "@/actions/moderation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Rule = {
  id: string;
  title: string;
  description: string | null;
  displayOrder: number;
};

type SettingsTabProps = {
  community: { id: string; name: string };
  rules: Rule[];
  canManageSettings: boolean;
};

export function SettingsTab({ community, rules: initialRules, canManageSettings }: SettingsTabProps) {
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isAddPending, startAdd] = useTransition();
  const [isReorderPending, startReorder] = useTransition();
  const [isDeletePending, startDelete] = useTransition();

  if (!canManageSettings) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        You do not have settings management permission.
      </p>
    );
  }

  function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const fd = new FormData();
    fd.set("communityId", community.id);
    fd.set("communityName", community.name);
    fd.set("title", newTitle);
    fd.set("description", newDescription);
    startAdd(async () => {
      const result = await addRuleAction(fd);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: "Rule added." });
      setNewTitle("");
      setNewDescription("");
    });
  }

  function moveRule(index: number, direction: "up" | "down") {
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= rules.length) return;
    const updated = [...rules];
    [updated[index], updated[swap]] = [updated[swap], updated[index]];
    setRules(updated);
    startReorder(async () => {
      const result = await reorderRulesAction(
        updated.map((r) => r.id),
        community.id,
        community.name
      );
      if (result.error) setRules(rules);
    });
  }

  function handleDeleteRule(ruleId: string) {
    setMessage(null);
    startDelete(async () => {
      const result = await deleteRuleAction(ruleId, community.id, community.name);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setMessage({ type: "success", text: "Rule deleted." });
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground">
          Add a Rule
        </h2>
        <form onSubmit={handleAddRule} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-title">Title *</Label>
            <Input
              id="rule-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value.slice(0, 100))}
              placeholder="e.g. Be respectful"
              disabled={isAddPending}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-desc">Description (optional)</Label>
            <textarea
              id="rule-desc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value.slice(0, 500))}
              placeholder="Elaborate on the rule…"
              disabled={isAddPending}
              rows={2}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
            />
          </div>
          {message && (
            <p
              className={cn(
                "text-sm",
                message.type === "error"
                  ? "text-destructive"
                  : "text-green-600 dark:text-green-400"
              )}
            >
              {message.text}
            </p>
          )}
          <Button
            type="submit"
            disabled={isAddPending || !newTitle.trim()}
            className="self-start"
          >
            {isAddPending ? "Adding…" : "Add Rule"}
          </Button>
        </form>
      </section>

      {rules.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-muted-foreground">
            Current Rules
          </h2>
          <div className="rounded-xl border border-border divide-y divide-border">
            {rules.map((rule, index) => (
              <div key={rule.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveRule(index, "up")}
                    disabled={index === 0 || isReorderPending}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveRule(index, "down")}
                    disabled={index === rules.length - 1 || isReorderPending}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {index + 1}. {rule.title}
                  </p>
                  {rule.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive shrink-0"
                  disabled={isDeletePending}
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

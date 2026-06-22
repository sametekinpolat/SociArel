"use client";

import { useTransition, useState } from "react";
import {
  dismissReportAction,
  resolveReportWithActionAction,
  type ReportUserAction,
} from "@/actions/moderation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Report = {
  id: string;
  status: string;
  customReason: string | null;
  createdAt: Date;
  reporter: { username: string | null; email: string | null };
  reportedUser: { username: string | null; email: string | null } | null;
  post: { title: string; id: string } | null;
  comment: { body: string; id: string } | null;
  rule: { title: string } | null;
};

type ResolvingState = {
  reportId: string;
  action: ReportUserAction;
  reason: string;
};

type ReportsTabProps = {
  communityId: string;
  reports: Report[];
};

const USER_ACTIONS: { value: ReportUserAction; label: string; danger?: boolean }[] = [
  { value: "none", label: "Resolve only (no action)" },
  { value: "mute_1d", label: "Mute 1 day" },
  { value: "mute_2d", label: "Mute 2 days" },
  { value: "mute_7d", label: "Mute 7 days" },
  { value: "ban", label: "Permanent ban", danger: true },
];

export function ReportsTab({ communityId, reports: initial }: ReportsTabProps) {
  const [reports, setReports] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "RESOLVED" | "DISMISSED">("PENDING");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [resolving, setResolving] = useState<ResolvingState | null>(null);
  const [isPending, startTransition] = useTransition();

  const displayed = reports.filter((r) => r.status === statusFilter);

  function openResolve(reportId: string) {
    setMessage(null);
    setResolving({ reportId, action: "none", reason: "" });
  }

  function confirmResolve() {
    if (!resolving) return;
    const { reportId, action, reason } = resolving;
    setMessage(null);
    startTransition(async () => {
      const result = await resolveReportWithActionAction(
        reportId,
        communityId,
        action,
        reason.trim() || undefined
      );
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: "RESOLVED" } : r))
      );
      setResolving(null);
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  function dismiss(reportId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await dismissReportAction(reportId, communityId);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: "DISMISSED" } : r))
      );
      setMessage({ type: "success", text: result.success ?? "Done." });
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        {(["PENDING", "RESOLVED", "DISMISSED"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "secondary" : "ghost"}
            onClick={() => {
              setStatusFilter(s);
              setResolving(null);
              setMessage(null);
            }}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
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

      {displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No {statusFilter.toLowerCase()} reports.
        </p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {displayed.map((report) => {
            const isExpanded = resolving?.reportId === report.id;
            const reportedName =
              report.reportedUser?.username ??
              report.reportedUser?.email ??
              "Unknown user";

            return (
              <div key={report.id} className="p-4 flex flex-col gap-3">
                {/* Report summary row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {report.post
                        ? `Post: ${report.post.title}`
                        : report.comment
                        ? `Comment by ${reportedName}`
                        : report.reportedUser
                        ? `User: ${reportedName}`
                        : "Unknown target"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reported by{" "}
                      {report.reporter.username ??
                        report.reporter.email ??
                        "unknown"}{" "}
                      · {new Date(report.createdAt).toLocaleDateString()}
                      {report.rule && ` · Rule: ${report.rule.title}`}
                    </p>
                    {report.customReason && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        &ldquo;{report.customReason}&rdquo;
                      </p>
                    )}
                  </div>

                  {report.status === "PENDING" && !isExpanded && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => openResolve(report.id)}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => dismiss(report.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                  {report.status !== "PENDING" && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {report.status.charAt(0) + report.status.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>

                {/* Full content preview (always shown for comments/posts) */}
                {report.comment && (
                  <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">
                      Full comment
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {report.comment.body}
                    </p>
                  </div>
                )}
                {report.post && !report.comment && (
                  <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">
                      Post title
                    </p>
                    <p className="text-sm font-medium">{report.post.title}</p>
                  </div>
                )}

                {/* Inline resolve panel */}
                {isExpanded && resolving && (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                    <p className="text-sm font-semibold">
                      Choose action against{" "}
                      <span className="text-foreground">{reportedName}</span>
                    </p>

                    <div className="flex flex-col gap-2">
                      {USER_ACTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                            resolving.action === opt.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50",
                            opt.danger &&
                              resolving.action === opt.value &&
                              "border-destructive bg-destructive/5"
                          )}
                        >
                          <input
                            type="radio"
                            name={`action-${report.id}`}
                            value={opt.value}
                            checked={resolving.action === opt.value}
                            onChange={() =>
                              setResolving((prev) =>
                                prev ? { ...prev, action: opt.value } : prev
                              )
                            }
                            className="accent-primary"
                          />
                          <span
                            className={cn(
                              "text-sm",
                              opt.danger && "text-destructive font-medium"
                            )}
                          >
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>

                    {resolving.action !== "none" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Reason (optional)
                        </label>
                        <input
                          type="text"
                          value={resolving.reason}
                          onChange={(e) =>
                            setResolving((prev) =>
                              prev ? { ...prev, reason: e.target.value } : prev
                            )
                          }
                          placeholder="e.g. Repeated rule violations"
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={isPending}
                        variant={
                          resolving.action === "ban" ? "destructive" : "default"
                        }
                        onClick={confirmResolve}
                      >
                        {isPending ? "Confirming…" : "Confirm"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setResolving(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

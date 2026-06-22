"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold mt-3 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold mt-2 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
  pre: ({ children }) => (
    <pre className="bg-muted rounded-md p-3 overflow-x-auto my-2 text-xs font-mono [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    return (
      <code
        className={cn("font-mono text-xs", !isBlock && "bg-muted px-1 py-0.5 rounded")}
        {...props}
      >
        {children}
      </code>
    );
  },
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-border pl-3 my-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-border my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1.5 bg-muted font-semibold text-left">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1.5">{children}</td>
  ),
};

// Preview mode: everything renders as inline spans so line-clamp works correctly.
const previewComponents: Components = {
  h1: ({ children }) => <span className="font-bold">{children} </span>,
  h2: ({ children }) => <span className="font-bold">{children} </span>,
  h3: ({ children }) => <span className="font-semibold">{children} </span>,
  p: ({ children }) => <span>{children} </span>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
  pre: ({ children }) => <span className="font-mono">{children}</span>,
  code: ({ children }) => (
    <code className="font-mono bg-muted px-0.5 rounded">{children}</code>
  ),
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span>{children} </span>,
  blockquote: ({ children }) => <span className="italic opacity-80">{children}</span>,
  a: ({ children }) => <span className="text-primary underline">{children}</span>,
  hr: () => <span> — </span>,
  table: ({ children }) => <span>{children}</span>,
  th: ({ children }) => <span className="font-semibold">{children} </span>,
  td: ({ children }) => <span>{children} </span>,
};

type Props = {
  content: string;
  className?: string;
  preview?: boolean;
};

export function MarkdownContent({ content, className, preview = false }: Props) {
  if (preview) {
    return (
      <p className={cn("leading-relaxed break-words", className)}>
        <Markdown remarkPlugins={[remarkGfm]} components={previewComponents}>
          {content}
        </Markdown>
      </p>
    );
  }

  return (
    <div className={cn("text-sm leading-relaxed break-words", className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}

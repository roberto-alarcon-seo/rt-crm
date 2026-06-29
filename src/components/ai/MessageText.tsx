import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  className?: string;
}

export function MessageText({ text, className }: Props) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-p:leading-relaxed prose-p:my-1",
        "prose-ul:my-1 prose-li:my-0.5",
        "prose-headings:text-foreground prose-headings:font-semibold",
        "prose-strong:text-foreground",
        "prose-code:text-violet-400 prose-code:bg-violet-500/10 prose-code:px-1 prose-code:rounded prose-code:text-xs",
        className
      )}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

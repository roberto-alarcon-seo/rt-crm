import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface ListItem {
  label: string;
  description?: string;
  meta?: string;
  severity?: "normal" | "warning" | "danger";
  href?: string;
}

interface Props {
  items: ListItem[];
  title?: string;
}

const severityDot = {
  normal:  "bg-muted-foreground/40",
  warning: "bg-amber-400",
  danger:  "bg-red-400",
};

function ItemContent({ item }: { item: ListItem }) {
  return (
    <>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${severityDot[item.severity ?? "normal"]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{item.label}</p>
        {item.description && (
          <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      {item.meta && (
        <span className="text-[10px] text-muted-foreground shrink-0">{item.meta}</span>
      )}
      {item.href && (
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </>
  );
}

export function MessageList({ items, title }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((item, i) =>
          item.href ? (
            <Link
              key={i}
              to={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-muted/30 hover:bg-muted/60 transition-colors group cursor-pointer"
            >
              <ItemContent item={item} />
            </Link>
          ) : (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-muted/30 transition-colors"
            >
              <ItemContent item={item} />
            </li>
          )
        )}
      </ul>
    </div>
  );
}

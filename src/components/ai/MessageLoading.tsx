import { Skeleton } from "@/components/ui/skeleton";

export function MessageLoading() {
  return (
    <div className="flex flex-col gap-2.5 py-1">
      <Skeleton className="h-3.5 w-3/4 rounded" />
      <Skeleton className="h-3.5 w-full rounded" />
      <Skeleton className="h-3.5 w-5/6 rounded" />
      <Skeleton className="h-3.5 w-2/3 rounded" />
    </div>
  );
}

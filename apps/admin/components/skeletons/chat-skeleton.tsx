import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The WhatsApp transcript on a lead's detail page. */
export function ChatSkeleton({ messages = 6 }: { messages?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: messages }).map((_, index) => (
        <div
          key={index}
          className={cn("flex", index % 2 === 0 ? "justify-start" : "justify-end")}
        >
          <Skeleton className="h-9 w-2/3 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

import { PageHeader } from "@/components/shell/page-header";
import { DetailSkeleton } from "@/components/skeletons/detail-skeleton";
import { ChatSkeleton } from "@/components/skeletons/chat-skeleton";

export default function LeadDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Leads" title="Detalle" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <DetailSkeleton fields={6} />
        </div>
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <ChatSkeleton />
        </div>
      </div>
    </div>
  );
}

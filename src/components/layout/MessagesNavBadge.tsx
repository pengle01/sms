"use client";

import { trpc } from "@/trpc/client";

// Live unread-thread count for the Messages nav item.
export function MessagesNavBadge() {
  const { data } = trpc.messages.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  if (!data) return null;
  return (
    <span className="ml-auto text-xs font-semibold bg-amber-400 text-amber-900 rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
      {data}
    </span>
  );
}

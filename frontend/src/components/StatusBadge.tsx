import { cn } from "@/lib/utils";
import type { Album } from "@/lib/types";

interface StatusBadgeProps {
  status: Album["status"];
  className?: string;
}

const statusConfig = {
  pending: {
    label: "Pending",
    className: "status-pending",
  },
  processing: {
    label: "Processing",
    className: "status-processing",
  },
  done: {
    label: "Done",
    className: "status-done",
  },
  error: {
    label: "Error",
    className: "status-error",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {status === "processing" && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {config.label}
    </span>
  );
}

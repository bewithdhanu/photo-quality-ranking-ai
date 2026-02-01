import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

export function LoadingSpinner({
  className,
  size = "md",
  text,
}: LoadingSpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <Loader2 className={cn("animate-spin text-primary", sizeClasses[size])} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function PageLoader({ text }: { text?: string }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="h-32 w-full animate-pulse rounded-md bg-muted" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="photo-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

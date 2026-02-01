import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Camera } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Camera className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Photo Ranking
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

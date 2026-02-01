import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Images } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Album } from "@/lib/types";

interface AlbumCardProps {
  album: Album;
  index: number;
}

export function AlbumCard({ album, index }: AlbumCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        to={`/album/${album.id}`}
        className="group block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
      >
        <div className="flex h-32 items-center justify-center bg-muted/50 transition-colors group-hover:bg-muted">
          <Images className="h-12 w-12 text-muted-foreground/50 transition-colors group-hover:text-primary/50" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-semibold leading-tight text-card-foreground line-clamp-2">
              {album.name}
            </h3>
            <StatusBadge status={album.status} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Images, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Album } from "@/lib/types";

interface AlbumCardProps {
  album: Album;
  index: number;
  onRename?: (album: Album) => void;
  onDelete?: (album: Album) => void;
}

export function AlbumCard({ album, index, onRename, onDelete }: AlbumCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
    >
      <Link
        to={`/album/${album.id}`}
        className="block"
      >
        <div className="flex h-32 items-center justify-center bg-muted/50 transition-colors hover:bg-muted">
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
      {(onRename || onDelete) && (
        <div className="absolute right-2 top-2" onClick={(e) => e.preventDefault()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onRename && (
                <DropdownMenuItem onClick={() => onRename(album)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(album)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </motion.div>
  );
}

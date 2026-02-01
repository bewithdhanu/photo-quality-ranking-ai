import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";
import { ImageOff, Star } from "lucide-react";
import { photoUrl, API_BASE } from "@/lib/api";
import type { RankedPhoto } from "@/lib/types";

interface PhotoCardProps {
  photo: RankedPhoto;
  albumId: string;
  index: number;
  showScore?: boolean;
}

export function PhotoCard({
  photo,
  albumId,
  index,
  showScore = true,
}: PhotoCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageUrl = photo.url_path
    ? `${API_BASE}${photo.url_path}`
    : photoUrl(albumId, photo.path);

  const filename = photo.path.split("/").pop() || photo.path;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
    >
      <Link
        to={`/album/${albumId}/photo/${encodeURIComponent(filename)}`}
        className="group relative block aspect-square overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
      >
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}
        {imageError ? (
          <div className="flex h-full items-center justify-center bg-muted">
            <ImageOff className="h-10 w-10 text-muted-foreground/30" />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`Photo ${index + 1}`}
            className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}

        {showScore && imageLoaded && !imageError && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur-sm">
            <Star className="h-3 w-3 text-primary" />
            {(photo.score * 100).toFixed(0)}
          </div>
        )}

        {index < 3 && imageLoaded && !imageError && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {index + 1}
          </div>
        )}
      </Link>
    </motion.div>
  );
}

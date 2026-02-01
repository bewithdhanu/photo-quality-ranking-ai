import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";
import { User } from "lucide-react";
import { faceCropUrl } from "@/lib/api";
import type { Person } from "@/lib/types";

interface PersonCardProps {
  person: Person;
  albumId: string;
  index: number;
}

export function PersonCard({ person, albumId, index }: PersonCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const displayName = person.name || `Person ${person.index}`;
  const imageUrl = faceCropUrl(albumId, person.crop_url_path);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03 }}
    >
      <Link
        to={`/album/${albumId}/person/${person.index}`}
        className="group block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          )}
          {imageError ? (
            <div className="flex h-full items-center justify-center">
              <User className="h-16 w-16 text-muted-foreground/30" />
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={displayName}
              className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
        </div>
        <div className="p-3">
          <h3 className="font-display font-semibold text-card-foreground truncate">
            {displayName}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {person.count} {person.count === 1 ? "photo" : "photos"}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

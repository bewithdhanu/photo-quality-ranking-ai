import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ImageOff, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoCard } from "@/components/PhotoCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonGrid } from "@/components/LoadingStates";
import { faceCropUrl } from "@/lib/api";
import { getAlbum, getPeople, getPersonPhotos } from "@/lib/api";

export default function PersonPhotos() {
  const { albumId, personIndex } = useParams<{
    albumId: string;
    personIndex: string;
  }>();

  const personIdx = parseInt(personIndex || "0", 10);

  const { data: album } = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => getAlbum(albumId!),
    enabled: !!albumId,
  });

  const { data: people } = useQuery({
    queryKey: ["people", albumId],
    queryFn: () => getPeople(albumId!),
    enabled: !!albumId,
  });

  const {
    data: photos,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["personPhotos", albumId, personIdx],
    queryFn: () => getPersonPhotos(albumId!, personIdx),
    enabled: !!albumId,
  });

  const person = people?.find((p) => p.index === personIdx);
  const displayName = person?.name || `Person ${personIdx}`;
  const cropUrl = person ? faceCropUrl(albumId!, person.crop_url_path) : null;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
        <SkeletonGrid count={12} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<ImageOff className="h-8 w-8" />}
        title="Failed to load photos"
        description={
          error instanceof Error ? error.message : "Could not load photos"
        }
        action={
          <Link to={`/album/${albumId}`}>
            <Button>Back to album</Button>
          </Link>
        }
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      {/* Header */}
      <div>
        <Link
          to={`/album/${albumId}`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to album
        </Link>

        <div className="flex items-center gap-4">
          {cropUrl && (
            <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-primary/30">
              <img
                src={cropUrl}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div>
            <h1 className="font-display text-3xl font-bold">{displayName}</h1>
            <p className="mt-1 text-muted-foreground">
              {album?.name} · Ranked by quality
            </p>
          </div>
        </div>
      </div>

      {/* Photos Grid */}
      {photos && photos.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {photos.length} {photos.length === 1 ? "photo" : "photos"} •
            Showing best quality first
          </p>
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <PhotoCard
                key={photo.path}
                photo={photo}
                albumId={albumId!}
                index={index}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<User className="h-8 w-8" />}
          title="No photos found"
          description="No photos were found for this person."
          action={
            <Link to={`/album/${albumId}`}>
              <Button>Back to album</Button>
            </Link>
          }
        />
      )}
    </motion.div>
  );
}

import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Upload,
  Loader2,
  AlertCircle,
  Users,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonCard } from "@/components/PersonCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonGrid } from "@/components/LoadingStates";
import { getAlbum, getAlbumStatus, getPeople } from "@/lib/api";

export default function AlbumView() {
  const { albumId } = useParams<{ albumId: string }>();
  const queryClient = useQueryClient();

  const { data: album, isLoading: albumLoading } = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => getAlbum(albumId!),
    enabled: !!albumId,
  });

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["albumStatus", albumId],
    queryFn: () => getAlbumStatus(albumId!),
    enabled: !!albumId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "processing" ? 3000 : false;
    },
  });

  const { data: people, isLoading: peopleLoading } = useQuery({
    queryKey: ["people", albumId],
    queryFn: () => getPeople(albumId!),
    enabled: !!albumId && status?.status === "done",
  });

  // Refetch people when status changes to done
  useEffect(() => {
    if (status?.status === "done") {
      queryClient.invalidateQueries({ queryKey: ["people", albumId] });
    }
  }, [status?.status, albumId, queryClient]);

  if (albumLoading || statusLoading) {
    return (
      <div className="space-y-8">
        <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
        <SkeletonGrid count={6} />
      </div>
    );
  }

  if (!album) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Album not found"
        description="The album you're looking for doesn't exist or has been removed."
        action={
          <Link to="/">
            <Button>Back to albums</Button>
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
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All albums
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">{album.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {status?.status === "done" && people
                ? `${people.length} ${
                    people.length === 1 ? "person" : "people"
                  } detected`
                : "Select a person to see their best photos"}
            </p>
          </div>
          <Link to={`/album/${albumId}/upload`}>
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Photos
            </Button>
          </Link>
        </div>
      </div>

      {/* Status: Processing */}
      {status?.status === "processing" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-xl border border-info/20 bg-info/5 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
            <Loader2 className="h-8 w-8 animate-spin text-info" />
          </div>
          <h3 className="font-display text-lg font-semibold">
            Processing album...
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Detecting faces and building metadata. This may take a few minutes
            depending on the number of photos.
          </p>
        </motion.div>
      )}

      {/* Status: Pending */}
      {status?.status === "pending" && (
        <EmptyState
          icon={<Upload className="h-8 w-8" />}
          title="No photos processed yet"
          description="Upload some photos and start processing to detect faces and calculate quality rankings."
          action={
            <Link to={`/album/${albumId}/upload`}>
              <Button size="lg" className="gap-2">
                <Upload className="h-5 w-5" />
                Upload Photos & Process
              </Button>
            </Link>
          }
        />
      )}

      {/* Status: Error */}
      {status?.status === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="font-display text-lg font-semibold">
            Processing failed
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {status.error || "An error occurred while processing the album."}
          </p>
          <Link to={`/album/${albumId}/upload`} className="mt-6">
            <Button className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Status: Done - People Grid */}
      {status?.status === "done" && (
        <>
          {peopleLoading ? (
            <SkeletonGrid count={6} />
          ) : people && people.length > 0 ? (
            <div className="photo-grid-sm">
              {people.map((person, index) => (
                <PersonCard
                  key={person.index}
                  person={person}
                  albumId={albumId!}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No faces detected"
              description="We couldn't detect any faces in the uploaded photos. Try uploading more photos with visible faces."
              action={
                <Link to={`/album/${albumId}/upload`}>
                  <Button className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload More Photos
                  </Button>
                </Link>
              }
            />
          )}
        </>
      )}
    </motion.div>
  );
}

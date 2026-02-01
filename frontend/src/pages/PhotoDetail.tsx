import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Check, X, Pencil, User, ImageOff, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/LoadingStates";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getAlbum,
  getPeople,
  getPhotoFaces,
  listAlbumPhotos,
  photoUrl,
  updatePersonName,
  faceCropUrl,
  deletePhoto,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { FaceInPhoto, Person } from "@/lib/types";

interface FaceOverlayProps {
  face: FaceInPhoto;
  imageRect: DOMRect;
  naturalWidth: number;
  naturalHeight: number;
}

function FaceOverlay({
  face,
  imageRect,
  naturalWidth,
  naturalHeight,
}: FaceOverlayProps) {
  const [x1, y1, x2, y2] = face.bbox;

  // Calculate scale factors
  const scaleX = imageRect.width / naturalWidth;
  const scaleY = imageRect.height / naturalHeight;

  const style = {
    left: x1 * scaleX,
    top: y1 * scaleY,
    width: (x2 - x1) * scaleX,
    height: (y2 - y1) * scaleY,
  };

  return (
    <div className="face-overlay" style={style}>
      <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
        {face.name || (face.person_index !== null ? `Person ${face.person_index}` : "Unknown")}
      </span>
    </div>
  );
}

interface FaceListItemProps {
  face: FaceInPhoto;
  person: Person | undefined;
  albumId: string;
  onNameUpdated: () => void;
}

function FaceListItem({
  face,
  person,
  albumId,
  onNameUpdated,
}: FaceListItemProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(face.name || person?.name || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const displayName =
    face.name || person?.name || (face.person_index !== null ? `Person ${face.person_index}` : "Unknown");

  const cropUrl = person ? faceCropUrl(albumId, person.crop_url_path) : null;

  const handleSave = async () => {
    if (face.person_index === null) {
      toast({
        title: "Cannot name unknown face",
        description: "This face is not linked to a person",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await updatePersonName(albumId, face.person_index, name);
      setEditing(false);
      onNameUpdated();
      toast({ title: "Name updated" });
    } catch (err) {
      toast({
        title: "Failed to update name",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(face.name || person?.name || "");
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="h-12 w-12 overflow-hidden rounded-full bg-muted">
        {cropUrl ? (
          <img
            src={cropUrl}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleSave}
              disabled={saving}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">Face {face.face_index + 1}</p>
            </div>
            {face.person_index !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Name
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PhotoDetail() {
  const { albumId, filename } = useParams<{
    albumId: string;
    filename: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const decodedFilename = decodeURIComponent(filename || "");

  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageRect, setImageRect] = useState<DOMRect | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const { data: albumPhotos = [] } = useQuery({
    queryKey: ["albumPhotos", albumId],
    queryFn: () => listAlbumPhotos(albumId!),
    enabled: !!albumId,
  });

  const currentIndex = albumPhotos.findIndex((p) => p.filename === decodedFilename);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < albumPhotos.length - 1;
  const prevFilename = hasPrev ? albumPhotos[currentIndex - 1].filename : null;
  const nextFilename = hasNext ? albumPhotos[currentIndex + 1].filename : null;

  const {
    data: faces,
    isLoading,
    refetch: refetchFaces,
  } = useQuery({
    queryKey: ["photoFaces", albumId, decodedFilename],
    queryFn: () => getPhotoFaces(albumId!, decodedFilename),
    enabled: !!albumId && !!decodedFilename,
  });

  const handleNameUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["people", albumId] });
    refetchFaces();
  };

  const handleDeletePhoto = async () => {
    if (!albumId || !decodedFilename) return;
    setDeleting(true);
    try {
      await deletePhoto(albumId, decodedFilename);
      queryClient.invalidateQueries({ queryKey: ["albumPhotos", albumId] });
      setDeleteOpen(false);
      toast({ title: "Photo removed" });
      navigate(`/album/${albumId}`);
    } catch (err) {
      toast({
        title: "Failed to remove photo",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageLoaded(true);
      setImageRect(imageRef.current.getBoundingClientRect());
      setNaturalSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
    }
  };

  // Update rect on resize
  useEffect(() => {
    const updateRect = () => {
      if (imageRef.current && imageLoaded) {
        setImageRect(imageRef.current.getBoundingClientRect());
      }
    };

    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [imageLoaded]);

  const imageUrl = photoUrl(albumId!, decodedFilename);

  if (isLoading) {
    return <PageLoader text="Loading photo..." />;
  }

  if (imageError) {
    return (
      <EmptyState
        icon={<ImageOff className="h-8 w-8" />}
        title="Photo not found"
        description="The photo you're looking for doesn't exist or couldn't be loaded."
        action={
          <Button onClick={() => navigate(-1)}>Go back</Button>
        }
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-[calc(100dvh-8rem)] min-h-0 max-h-[calc(100vh-8rem)] flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 pb-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="font-display text-2xl font-bold">Photo Details</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {album?.name} · {decodedFilename}
          </p>
        </div>
        <Button
          variant="destructive"
          className="gap-2 shrink-0"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete photo
        </Button>
      </div>

      {/* Content row: image + faces list - takes remaining space only */}
      <div className="flex min-h-0 flex-1 gap-4 lg:gap-6">
        {/* Image area: fills available space, never overflows */}
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
            {/* Left arrow */}
            {hasPrev && prevFilename && (
              <Link
                to={`/album/${albumId}/photo/${encodeURIComponent(prevFilename)}`}
                className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md transition hover:bg-background"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
            )}
            <div className="relative flex h-full w-full items-center justify-center bg-black">
              {!imageLoaded && !imageError && (
                <div className="absolute inset-0 animate-pulse bg-muted" />
              )}
              {/* Wrapper fills container so img is constrained; object-contain letterboxes (black on sides for vertical, top/bottom for horizontal) */}
              <div className="relative flex h-full w-full items-center justify-center">
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={decodedFilename}
                  className={`max-h-full max-w-full object-contain transition-opacity ${
                    imageLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={handleImageLoad}
                  onError={() => setImageError(true)}
                />
                {/* Face overlays - same size as img; positioned over the img via a sibling that matches img dimensions */}
                {imageLoaded && imageRect && faces && imageRef.current && (
                  <div
                    className="pointer-events-none absolute flex items-center justify-center"
                    style={{
                      inset: 0,
                    }}
                  >
                    <div
                      className="relative"
                      style={{
                        width: imageRef.current.offsetWidth,
                        height: imageRef.current.offsetHeight,
                      }}
                    >
                      {faces.map((face) => (
                        <FaceOverlay
                          key={face.face_index}
                          face={face}
                          imageRect={imageRect}
                          naturalWidth={naturalSize.width}
                          naturalHeight={naturalSize.height}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Right arrow */}
            {hasNext && nextFilename && (
              <Link
                to={`/album/${albumId}/photo/${encodeURIComponent(nextFilename)}`}
                className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md transition hover:bg-background"
                aria-label="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>

        {/* Faces list - scrollable if needed */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden lg:w-72">
          <h2 className="font-display text-lg font-semibold shrink-0">
            People in this photo
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto pt-2">
            {faces && faces.length > 0 ? (
              <div className="space-y-3">
                {faces.map((face) => {
                  const person = people?.find(
                    (p) => p.index === face.person_index
                  );
                  return (
                    <FaceListItem
                      key={face.face_index}
                      face={face}
                      person={person}
                      albumId={albumId!}
                      onNameUpdated={handleNameUpdated}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No faces detected in this photo.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnails - always at bottom, using remaining space */}
      {albumPhotos.length > 1 && (
        <div className="mt-2 shrink-0 overflow-x-auto border-t border-border pt-2">
          <div className="flex gap-2 pb-1">
            {albumPhotos.map((p) => {
              const isCurrent = p.filename === decodedFilename;
              return (
                <Link
                  key={p.filename}
                  to={`/album/${albumId}/photo/${encodeURIComponent(p.filename)}`}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    isCurrent
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <img
                    src={photoUrl(albumId!, p.filename)}
                    alt={p.filename}
                    className="h-full w-full object-cover"
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{decodedFilename}" from the album. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDeletePhoto()}>
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

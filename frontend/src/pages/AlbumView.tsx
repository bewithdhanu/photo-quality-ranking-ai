import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Upload,
  Loader2,
  AlertCircle,
  Users,
  RefreshCw,
  Pencil,
  Trash2,
  ImageIcon,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonCard } from "@/components/PersonCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonGrid } from "@/components/LoadingStates";
import {
  getAlbum,
  getAlbumStatus,
  getPeople,
  renameAlbum,
  deleteAlbum,
  listAlbumPhotos,
  deletePhoto,
  deletePersonFromAlbum,
  photoUrl,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export default function AlbumView() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteAlbumOpen, setDeleteAlbumOpen] = useState(false);
  const [deletingAlbum, setDeletingAlbum] = useState(false);
  const [deletePhotoOpen, setDeletePhotoOpen] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<number | null>(null);
  const [deletingPerson, setDeletingPerson] = useState(false);
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

  const { data: photos = [], refetch: refetchPhotos } = useQuery({
    queryKey: ["albumPhotos", albumId],
    queryFn: () => listAlbumPhotos(albumId!),
    enabled: !!albumId,
  });

  const handleRenameOpen = () => {
    if (album) setRenameValue(album.name);
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!albumId) return;
    setRenaming(true);
    try {
      await renameAlbum(albumId, renameValue);
      queryClient.invalidateQueries({ queryKey: ["album", albumId] });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setRenameOpen(false);
      toast({ title: "Album renamed" });
    } catch (err) {
      toast({
        title: "Failed to rename album",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!albumId) return;
    setDeletingAlbum(true);
    try {
      await deleteAlbum(albumId);
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setDeleteAlbumOpen(false);
      toast({ title: "Album deleted" });
      navigate("/");
    } catch (err) {
      toast({
        title: "Failed to delete album",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingAlbum(false);
    }
  };

  const handleDeletePhotoOpen = (filename: string) => {
    setPhotoToDelete(filename);
    setDeletePhotoOpen(true);
  };

  const handleDeletePhoto = async () => {
    if (!albumId || !photoToDelete) return;
    setDeletingPhoto(true);
    try {
      await deletePhoto(albumId, photoToDelete);
      queryClient.invalidateQueries({ queryKey: ["albumPhotos", albumId] });
      refetchPhotos();
      setDeletePhotoOpen(false);
      setPhotoToDelete(null);
      toast({ title: "Photo removed" });
    } catch (err) {
      toast({
        title: "Failed to remove photo",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingPhoto(false);
    }
  };

  const handleDeletePersonOpen = (personIndex: number) => {
    setPersonToDelete(personIndex);
    setDeletePersonOpen(true);
  };

  const handleDeletePerson = async () => {
    if (!albumId || personToDelete === null) return;
    setDeletingPerson(true);
    try {
      await deletePersonFromAlbum(albumId, personToDelete);
      queryClient.invalidateQueries({ queryKey: ["people", albumId] });
      setDeletePersonOpen(false);
      setPersonToDelete(null);
      toast({ title: "Person removed from album" });
    } catch (err) {
      toast({
        title: "Failed to remove person",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingPerson(false);
    }
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/album/${albumId}/upload`}>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Photos
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleRenameOpen}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename album
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteAlbumOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete album
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

      {/* Photos & People in tabs (show when we have album) */}
      {albumId && (
        <section>
          <Tabs defaultValue="photos" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="photos" className="gap-2">
                <ImageIcon className="h-4 w-4" />
                Photos ({photos.length})
              </TabsTrigger>
              <TabsTrigger value="people" className="gap-2">
                <Users className="h-4 w-4" />
                People ({status?.status === "done" && people ? people.length : 0})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="photos">
              {photos.length > 0 ? (
                <>
                  <div className="photo-grid">
                    {photos.map((p) => (
                      <div
                        key={p.filename}
                        className="group relative overflow-hidden rounded-lg border border-border bg-card"
                      >
                        <Link
                          to={`/album/${albumId}/photo/${encodeURIComponent(p.filename)}`}
                          className="block aspect-[4/3] overflow-hidden bg-muted"
                        >
                          <img
                            src={photoUrl(albumId, p.filename)}
                            alt={p.filename}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                        </Link>
                        {status?.status === "done" && (
                          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition">
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDeletePhotoOpen(p.filename);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        <p className="p-2 text-xs text-muted-foreground truncate">{p.filename}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No photos in this album yet.</p>
              )}
            </TabsContent>
            <TabsContent value="people">
              {status?.status !== "done" ? (
                <p className="text-sm text-muted-foreground py-4">
                  {status?.status === "processing"
                    ? "Processing... People will appear here when done."
                    : "Upload and process photos to detect people."}
                </p>
              ) : peopleLoading ? (
                <SkeletonGrid count={6} />
              ) : people && people.length > 0 ? (
                <div className="photo-grid-sm">
                  {people.map((person, index) => (
                    <PersonCard
                      key={person.index}
                      person={person}
                      albumId={albumId!}
                      index={index}
                      onDelete={handleDeletePersonOpen}
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
            </TabsContent>
          </Tabs>
        </section>
      )}

      {/* Rename album dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename album</DialogTitle>
            <DialogDescription>Enter a new name for this album.</DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Album name"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleRename()} disabled={renaming}>
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete album confirm */}
      <AlertDialog open={deleteAlbumOpen} onOpenChange={setDeleteAlbumOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete album?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this album and all its photos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAlbum}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deletingAlbum} onClick={() => void handleDeleteAlbum()}>
              {deletingAlbum ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete photo confirm */}
      <AlertDialog open={deletePhotoOpen} onOpenChange={setDeletePhotoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{photoToDelete}" from the album. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPhoto}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deletingPhoto} onClick={() => void handleDeletePhoto()}>
              {deletingPhoto ? "Removing..." : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete person confirm */}
      <AlertDialog open={deletePersonOpen} onOpenChange={setDeletePersonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove person from album?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this person from the album list. Their name stays in your global list for other albums.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPerson}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deletingPerson} onClick={() => void handleDeletePerson()}>
              {deletingPerson ? "Removing..." : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

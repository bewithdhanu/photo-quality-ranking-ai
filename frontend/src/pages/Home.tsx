import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Images, UserSearch, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { AlbumCard } from "@/components/AlbumCard";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader, SkeletonGrid } from "@/components/LoadingStates";
import { getAlbums, createAlbum, renameAlbum, deleteAlbum, findPersonByPhoto } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { Album } from "@/lib/types";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [albumToRename, setAlbumToRename] = useState<Album | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<Album | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [findPersonOpen, setFindPersonOpen] = useState(false);
  const [findFile, setFindFile] = useState<File | null>(null);
  const [findLoading, setFindLoading] = useState(false);
  const [findDragActive, setFindDragActive] = useState(false);

  const {
    data: albums,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["albums"],
    queryFn: getAlbums,
  });

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const album = await createAlbum(albumName || undefined);
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setDialogOpen(false);
      setAlbumName("");
      navigate(`/album/${album.id}/upload`);
    } catch (err) {
      toast({
        title: "Failed to create album",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRenameOpen = (album: Album) => {
    setAlbumToRename(album);
    setRenameValue(album.name);
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!albumToRename) return;
    setRenaming(true);
    try {
      await renameAlbum(albumToRename.id, renameValue);
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["album", albumToRename.id] });
      setRenameOpen(false);
      setAlbumToRename(null);
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

  const handleDeleteOpen = (album: Album) => {
    setAlbumToDelete(album);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!albumToDelete) return;
    setDeleting(true);
    try {
      await deleteAlbum(albumToDelete.id);
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setDeleteOpen(false);
      setAlbumToDelete(null);
      toast({ title: "Album deleted" });
      navigate("/");
    } catch (err) {
      toast({
        title: "Failed to delete album",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleFindPerson = async () => {
    if (!findFile) return;
    setFindLoading(true);
    try {
      const result = await findPersonByPhoto(findFile);
      setFindPersonOpen(false);
      setFindFile(null);
      navigate("/find-person/result", { state: { findResult: result } });
      if (result.matched && result.person) {
        toast({ title: `Found: ${result.person.name}` });
      } else if (result.candidates?.length) {
        toast({ title: "Pick a possible match on the result page", variant: "default" });
      }
    } catch (err) {
      toast({
        title: "Find failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setFindLoading(false);
    }
  };

  const handleFindPersonClose = (open: boolean) => {
    setFindPersonOpen(open);
    if (!open) setFindFile(null);
  };

  const handleFindDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setFindDragActive(true);
    } else if (e.type === "dragleave") {
      setFindDragActive(false);
    }
  }, []);

  const handleFindDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFindDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ACCEPTED_IMAGE_TYPES.includes(f.type)
    );
    if (files.length > 0) setFindFile(files[0]);
  }, []);

  const handleFindFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files).filter((f) =>
      ACCEPTED_IMAGE_TYPES.includes(f.type)
    ) : [];
    if (files.length > 0) setFindFile(files[0]);
    e.target.value = "";
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <SkeletonGrid count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Images className="h-8 w-8" />}
        title="Failed to load albums"
        description={
          error instanceof Error
            ? error.message
            : "Could not connect to the server"
        }
        action={
          <Button onClick={() => window.location.reload()}>Try again</Button>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Albums</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your photo collections
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                New Album
              </Button>
            </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateAlbum}>
              <DialogHeader>
                <DialogTitle className="font-display">
                  Create New Album
                </DialogTitle>
                <DialogDescription>
                  Give your album a name, or leave blank for a generated one.
                </DialogDescription>
              </DialogHeader>
              <div className="my-6">
                <Input
                  placeholder="Album name (optional)"
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Album"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
          <Button
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={() => setFindPersonOpen(true)}
          >
            <UserSearch className="h-5 w-5" />
            Find person by photo
          </Button>
        </div>
      </div>

      {/* Find person by photo popup */}
      <Dialog open={findPersonOpen} onOpenChange={handleFindPersonClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <UserSearch className="h-5 w-5" />
              Find person by photo
            </DialogTitle>
            <DialogDescription>
              Upload a photo of someone to see all albums and photos they appear in (matches against your named people).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Drag-and-drop: single photo only */}
            <div
              className={`relative rounded-xl border-2 border-dashed transition-all ${
                findDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragEnter={handleFindDrag}
              onDragLeave={handleFindDrag}
              onDragOver={handleFindDrag}
              onDrop={handleFindDrop}
            >
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                onChange={handleFindFileSelect}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <div className="flex flex-col items-center justify-center px-6 py-10">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Upload className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-display font-semibold">
                  {findFile
                    ? findFile.name
                    : "Drop one photo here"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  or click to browse (JPEG, PNG, WebP, BMP)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleFindPerson}
                disabled={findLoading || !findFile}
                className="gap-2"
              >
                {findLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserSearch className="h-4 w-4" />
                )}
                {findLoading ? "Matching..." : "Find"}
              </Button>
              {findFile && (
                <Button variant="ghost" size="sm" onClick={() => setFindFile(null)} className="gap-1.5">
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            {findLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Albums Grid */}
      {albums && albums.length > 0 ? (
        <div className="photo-grid">
          {albums.map((album, index) => (
            <AlbumCard
              key={album.id}
              album={album}
              index={index}
              onRename={handleRenameOpen}
              onDelete={handleDeleteOpen}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Images className="h-8 w-8" />}
          title="No albums yet"
          description="Create your first album to start uploading and ranking photos."
          action={
            <Button onClick={() => setDialogOpen(true)} size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Create Album
            </Button>
          }
        />
      )}

      {/* Rename album dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename album</DialogTitle>
            <DialogDescription>
              Enter a new name for this album.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Album name"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={renaming}>
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete album confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete album?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{albumToDelete?.name}" and all its
              photos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

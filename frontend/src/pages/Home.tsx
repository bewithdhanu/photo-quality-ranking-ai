import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Images } from "lucide-react";
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
import { getAlbums, createAlbum, renameAlbum, deleteAlbum } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { Album } from "@/lib/types";

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
      </div>

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

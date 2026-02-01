import { useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, X, ImageIcon, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingStates";
import { uploadPhotos, processAlbum, getAlbum } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

export default function UploadPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const { data: album } = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => getAlbum(albumId!),
    enabled: !!albumId,
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      ACCEPTED_TYPES.includes(file.type)
    );
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((file) =>
        ACCEPTED_TYPES.includes(file.type)
      );
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!albumId || files.length === 0) return;

    setUploading(true);
    try {
      const response = await uploadPhotos(albumId, files);
      setUploadedCount((prev) => prev + response.saved.length);
      setFiles([]);
      toast({
        title: "Upload successful",
        description: `${response.saved.length} photos uploaded`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!albumId) return;

    setProcessing(true);
    try {
      await processAlbum(albumId);
      navigate(`/album/${albumId}`);
    } catch (error) {
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
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
          <h1 className="font-display text-3xl font-bold">Upload Photos</h1>
          {album && (
            <p className="mt-1 text-muted-foreground">
              Add photos to <span className="font-medium">{album.name}</span>
            </p>
          )}
        </div>

        {/* Drop Zone */}
        <div
          className={`relative rounded-xl border-2 border-dashed transition-all ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileSelect}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-display text-lg font-semibold">
              Drop photos here
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse (JPEG, PNG, WebP, BMP)
            </p>
          </div>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">
                {files.length} {files.length === 1 ? "file" : "files"} selected
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiles([])}
                className="text-muted-foreground"
              >
                Clear all
              </Button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto scrollbar-thin">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {files.length} {files.length === 1 ? "file" : "files"}
                </>
              )}
            </Button>
          </motion.div>
        )}

        {/* Uploaded Count */}
        {uploadedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-success"
          >
            <Check className="h-5 w-5" />
            <span className="font-medium">
              {uploadedCount} photos uploaded to album
            </span>
          </motion.div>
        )}

        {/* Process Button */}
        <div className="border-t border-border pt-8">
          <Button
            onClick={handleProcess}
            disabled={processing || uploadedCount === 0}
            size="lg"
            className="w-full"
          >
            {processing ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Starting processing...
              </>
            ) : (
              "Finish & Process Album"
            )}
          </Button>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Processing will detect faces and calculate quality rankings
          </p>
        </div>
      </motion.div>
    </div>
  );
}

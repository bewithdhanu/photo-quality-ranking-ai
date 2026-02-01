import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { UserSearch, FolderOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPersonAlbumsPhotos, photoUrl } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { FindPersonResult as FindPersonResultType, PersonAlbumsPhotosResult } from "@/lib/types";

export default function FindPersonResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const findResult = location.state?.findResult as FindPersonResultType | undefined;

  const [findDisplay, setFindDisplay] = useState<PersonAlbumsPhotosResult | null>(() => {
    if (findResult?.matched && findResult.person && findResult.albums && findResult.photos) {
      return { person: findResult.person, albums: findResult.albums, photos: findResult.photos };
    }
    return null;
  });
  const [candidateLoading, setCandidateLoading] = useState<string | null>(null);

  const handlePickCandidate = async (personId: string) => {
    setCandidateLoading(personId);
    try {
      const data = await getPersonAlbumsPhotos(personId);
      setFindDisplay(data);
      toast({ title: `Showing: ${data.person.name}` });
    } catch (err) {
      toast({
        title: "Failed to load",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCandidateLoading(null);
    }
  };

  if (!findResult) {
    return (
      <div className="container max-w-2xl space-y-6 py-8">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <UserSearch className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 font-display text-lg font-semibold">No find result</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload a photo on the home page and tap Find to see results here.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/")}>
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Button>

      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <UserSearch className="h-5 w-5" />
          <span className="font-display text-sm font-medium">Find person result</span>
        </div>

        {!findResult.matched && (
          <p className="text-muted-foreground">
            No confident match in your albums.
            {findResult.best_similarity != null && (
              <span className="block mt-1 text-sm">
                Closest: {(findResult.best_similarity * 100).toFixed(1)}% similarity
              </span>
            )}
            {findResult.error && (
              <span className="block mt-1 text-sm text-destructive">{findResult.error}</span>
            )}
          </p>
        )}

        {!findResult.matched && findResult.candidates && findResult.candidates.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Possible matches — pick one</h4>
            <ul className="flex flex-col gap-2">
              {findResult.candidates.map((c) => (
                <li key={c.id}>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => void handlePickCandidate(c.id)}
                    disabled={candidateLoading === c.id}
                  >
                    <span>{c.name}</span>
                    <span className="text-muted-foreground font-normal">
                      {candidateLoading === c.id ? "Loading…" : `${(c.similarity * 100).toFixed(1)}%`}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {findDisplay && (
          <>
            <div>
              <h3 className="font-display text-xl font-semibold">{findDisplay.person.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                In {findDisplay.albums.length} album(s), {findDisplay.photos.length} photo(s)
              </p>
            </div>

            {findDisplay.albums.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <FolderOpen className="h-4 w-4" />
                  Albums
                </h4>
                <ul className="flex flex-wrap gap-2">
                  {findDisplay.albums.map((a) => (
                    <li key={a.id}>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/album/${a.id}`}>{a.name}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {findDisplay.photos.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Photos</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {findDisplay.photos.slice(0, 24).map((p, i) => (
                    <Link
                      key={`${p.album_id}-${p.filename}-${i}`}
                      to={`/album/${p.album_id}/photo/${encodeURIComponent(p.filename)}`}
                      className="block overflow-hidden rounded-lg border bg-muted transition hover:border-primary/30"
                    >
                      <div className="aspect-square overflow-hidden">
                        <img
                          src={photoUrl(p.album_id, p.filename)}
                          alt={p.filename}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="p-1.5 text-xs text-muted-foreground truncate" title={p.filename}>
                        {p.filename}
                      </p>
                    </Link>
                  ))}
                </div>
                {findDisplay.photos.length > 24 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing 24 of {findDisplay.photos.length} photos. Open an album to see all.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

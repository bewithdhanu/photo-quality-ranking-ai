#!/usr/bin/env python3
"""
CLI: rank photos where a given person appears.
Usage:
  python run_rank.py --ref path/to/person.jpg --photos path/to/folder/ [--top 20] [--output ranked.txt]
"""

import argparse
import os
import sys

# Ensure project root is on path so config and photo_ranker resolve when run from any cwd
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

from photo_ranker.person_finder import PersonFinder
from photo_ranker.quality import QualityScorer
from photo_ranker.ranker import rank_photos, rank_photos_from_metadata
from photo_ranker import metadata as meta
from photo_ranker import unique_faces as uf
import config as cfg

# Common image extensions
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def collect_image_paths(folder: str) -> list[str]:
    """Collect image paths from a folder (no recursion)."""
    paths = []
    if not os.path.isdir(folder):
        return paths
    for name in os.listdir(folder):
        ext = os.path.splitext(name)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            paths.append(os.path.join(folder, name))
    return paths


def main():
    parser = argparse.ArgumentParser(
        description="Rank photos containing a given person by quality (smile, facing camera, sharpness)."
    )
    parser.add_argument(
        "--ref", "--rf",
        dest="ref",
        default=None,
        help="Path to one reference photo of the person (required unless using --list-faces or --select)",
    )
    parser.add_argument(
        "--photos",
        required=True,
        help="Path to folder containing candidate photos (or a single image path)",
    )
    parser.add_argument(
        "--list-faces",
        action="store_true",
        help="Discover unique faces in album, save crops, and print indices (use --photos folder)",
    )
    parser.add_argument(
        "--select",
        type=int,
        default=None,
        metavar="N",
        help="Rank photos for the person at index N from --list-faces (use with --photos folder)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=20,
        help="Return only top N ranked photos (default: 20)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional path to write ranked list (path and score per line)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Return all photos where person appears (no top limit)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print max similarity per image (for debugging)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Ignore metadata cache and score all images live (slower)",
    )
    args = parser.parse_args()

    list_faces = args.list_faces
    select_idx = args.select

    if list_faces or select_idx is not None:
        if not os.path.isdir(args.photos):
            print("Error: --list-faces and --select require --photos to be a folder.", file=sys.stderr)
            sys.exit(1)
    elif args.ref is None:
        print("Error: provide --ref (reference photo) or use --list-faces / --select.", file=sys.stderr)
        sys.exit(1)
    elif not os.path.isfile(args.ref):
        print(f"Error: reference image not found: {args.ref}", file=sys.stderr)
        sys.exit(1)

    # Allow --photos to be a folder or a single image
    if os.path.isfile(args.photos):
        photo_paths = [args.photos]
    else:
        photo_paths = collect_image_paths(args.photos)
        if not photo_paths:
            print(f"Error: no images found in {args.photos}", file=sys.stderr)
            sys.exit(1)

    top_k = None if args.all else max(1, args.top)

    use_metadata = (
        not args.no_cache
        and os.path.isdir(args.photos)
        and len(photo_paths) > 0
    )

    def make_progress(desc: str):
        pbar = [None]

        def progress(processed: int, total: int):
            if tqdm is not None and pbar[0] is None:
                pbar[0] = tqdm(total=total, desc=desc, unit="img")
            if pbar[0] is not None:
                pbar[0].n = min(processed, pbar[0].total)
                pbar[0].refresh()

        def close():
            if pbar[0] is not None:
                pbar[0].close()

        return progress, close

    # --- Mode: list unique faces ---
    if list_faces:
        finder = PersonFinder()
        quality = QualityScorer()
        progress_sync, close_sync = make_progress("Syncing")
        sync_meta = meta.sync_metadata(
            args.photos,
            finder,
            quality,
            IMAGE_EXTENSIONS,
            progress_callback=progress_sync,
        )
        close_sync()
        unique = uf.get_unique_faces(sync_meta, args.photos)
        if not unique:
            print("No faces found in album.", file=sys.stderr)
            return
        crop_dir = os.path.join(args.photos, cfg.FACE_CROP_DIR)
        saved = uf.save_face_crops(unique, crop_dir, size=cfg.FACE_CROP_SIZE)
        print(f"Unique persons: {len(unique)}", file=sys.stderr)
        print(f"Face crops saved to: {crop_dir}", file=sys.stderr)
        for i, rec in enumerate(unique):
            print(f"  [{i}] {rec['name']} (face {rec['face_index']}) — appears in {rec['count']} photo(s)")
        print("", file=sys.stderr)
        print("To rank photos for a person, run:", file=sys.stderr)
        print(f"  python run_rank.py --photos {args.photos!r} --select 0 --top 20", file=sys.stderr)
        print("  (use --select 1, --select 2, ... for other persons)", file=sys.stderr)
        return

    # --- Mode: rank by selected face index ---
    if select_idx is not None:
        finder = PersonFinder()
        quality = QualityScorer()
        progress_sync, close_sync = make_progress("Syncing")
        sync_meta = meta.sync_metadata(
            args.photos,
            finder,
            quality,
            IMAGE_EXTENSIONS,
            progress_callback=progress_sync,
        )
        close_sync()
        unique = uf.get_unique_faces(sync_meta, args.photos)
        if not unique:
            print("No faces found in album.", file=sys.stderr)
            sys.exit(1)
        if select_idx < 0 or select_idx >= len(unique):
            print(f"Error: --select {select_idx} is out of range (0..{len(unique) - 1}). Run --list-faces to see indices.", file=sys.stderr)
            sys.exit(1)
        ref_emb = unique[select_idx]["embedding"]
        progress_rank, close_rank = make_progress("Ranking")
        ranked = rank_photos_from_metadata(
            args.photos,
            sync_meta,
            finder,
            ref_img_path=None,
            ref_embedding=ref_emb,
            top_k=top_k,
            progress_callback=progress_rank,
            verbose=args.verbose,
        )
        close_rank()
    else:
        try:
            finder = PersonFinder()
            if use_metadata:
                quality = QualityScorer()
                progress_sync, close_sync = make_progress("Syncing")
                sync_meta = meta.sync_metadata(
                    args.photos,
                    finder,
                    quality,
                    IMAGE_EXTENSIONS,
                    progress_callback=progress_sync,
                )
                close_sync()
                progress_rank, close_rank = make_progress("Ranking")
                ranked = rank_photos_from_metadata(
                    args.photos,
                    sync_meta,
                    finder,
                    ref_img_path=args.ref,
                    ref_embedding=None,
                    top_k=top_k,
                    progress_callback=progress_rank,
                    verbose=args.verbose,
                )
                close_rank()
            else:
                if not finder.set_reference(args.ref):
                    print("Error: no face detected in reference image.", file=sys.stderr)
                    sys.exit(1)
                progress_score, close_score = make_progress("Scoring")
                ranked = rank_photos(
                    args.ref,
                    photo_paths,
                    finder=finder,
                    top_k=top_k,
                    progress_callback=progress_score,
                    verbose=args.verbose,
                )
                close_score()
        finally:
            pass

    if not ranked:
        print("No photos found containing the reference person (or all were filtered out).")
        if args.output:
            with open(args.output, "w") as f:
                f.write("")
        return

    for path, score in ranked:
        print(f"{score:.4f}\t{path}")

    if args.output:
        with open(args.output, "w") as f:
            for path, score in ranked:
                f.write(f"{score:.4f}\t{path}\n")
        print(f"\nWrote {len(ranked)} results to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()

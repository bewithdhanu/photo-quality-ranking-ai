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
from photo_ranker.ranker import rank_photos

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
        required=True,
        help="Path to one reference photo of the person",
    )
    parser.add_argument(
        "--photos",
        required=True,
        help="Path to folder containing candidate photos (or a single image path)",
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
    args = parser.parse_args()

    if not os.path.isfile(args.ref):
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

    pbar = None
    def progress(processed: int, total: int):
        nonlocal pbar
        if tqdm is not None and pbar is None:
            pbar = tqdm(total=total, desc="Scoring", unit="img")
        if pbar is not None:
            pbar.n = min(processed, pbar.total)
            pbar.refresh()

    try:
        finder = PersonFinder()
        if not finder.set_reference(args.ref):
            print("Error: no face detected in reference image.", file=sys.stderr)
            sys.exit(1)
        ranked = rank_photos(
            args.ref,
            photo_paths,
            finder=finder,
            top_k=top_k,
            progress_callback=progress,
            verbose=args.verbose,
        )
    finally:
        if pbar is not None:
            pbar.close()

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

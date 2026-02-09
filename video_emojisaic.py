#!/usr/bin/env python3
import argparse
import math
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image
import numpy as np


def ffmpeg_path(repo_root: Path) -> str:
    local = repo_root / "bin" / "ffmpeg"
    if local.exists():
        return str(local)
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    return "ffmpeg"


def run(cmd, label):
    print(f"{label}...")
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed: {' '.join(cmd)}")


def average_color(img: Image.Image) -> np.ndarray:
    arr = np.array(img)
    if arr.shape[-1] == 4:
        rgb = arr[..., :3]
        alpha = arr[..., 3] / 255.0
        mask = alpha > 0
        if not np.any(mask):
            return np.array([0, 0, 0], dtype=np.float32)
        rgb = rgb[mask]
        return rgb.mean(axis=0)
    return arr.reshape(-1, 3).mean(axis=0)


def build_emoji_palette(emojis_dir: Path, size: int):
    colors = []
    images = []
    for path in sorted(emojis_dir.glob("*.png")):
        img = Image.open(path).convert("RGBA")
        color = average_color(img)
        resized = img.resize((size, size), Image.LANCZOS)
        colors.append(color)
        images.append(resized)
    return np.array(colors, dtype=np.float32), images


def nearest_emoji_index(color, palette_colors):
    # Vectorized nearest-neighbor match against palette average colors.
    distances = np.sum((palette_colors - color) ** 2, axis=1)
    return int(np.argmin(distances))


def build_emoji_grid(img: Image.Image, size: int, palette_colors):
    width, height = img.size
    cols = math.ceil(width / size)
    rows = math.ceil(height / size)
    pixels = np.array(img, dtype=np.float32)
    grid = np.empty((rows, cols), dtype=np.int32)

    for y in range(rows):
        top = y * size
        bottom = min(top + size, height)
        for x in range(cols):
            left = x * size
            right = min(left + size, width)
            tile_pixels = pixels[top:bottom, left:right]
            color = tile_pixels.reshape(-1, 3).mean(axis=0)
            grid[y, x] = nearest_emoji_index(color, palette_colors)

    return grid


def largest_uniform_square(grid, covered, row, col, emoji_index, max_side):
    max_possible = min(max_side, grid.shape[0] - row, grid.shape[1] - col)
    for side in range(max_possible, 0, -1):
        block = grid[row : row + side, col : col + side]
        if np.all(block == emoji_index) and not np.any(covered[row : row + side, col : col + side]):
            return side
    return 1


def mosaic_image(img: Image.Image, palette_colors, palette_images, size: int, zoom: int, max_emoji_block: int):
    grid = build_emoji_grid(img, size, palette_colors)
    rows, cols = grid.shape
    out = Image.new("RGB", (cols * size * zoom, rows * size * zoom))
    covered = np.zeros((rows, cols), dtype=bool)

    for row in range(rows):
        col = 0
        while col < cols:
            if covered[row, col]:
                col += 1
                continue

            emoji_index = grid[row, col]
            side = largest_uniform_square(grid, covered, row, col, emoji_index, max_emoji_block)
            covered[row : row + side, col : col + side] = True

            emoji = palette_images[emoji_index]
            target_size = side * size * zoom
            if side != 1 or zoom != 1:
                emoji = emoji.resize((target_size, target_size), Image.LANCZOS)
            out.paste(emoji, (col * size * zoom, row * size * zoom), emoji)
            col += side

    return out


def mosaic_frame(frame_path: Path, palette_colors, palette_images, size: int, zoom: int, max_emoji_block: int, out_path: Path):
    img = Image.open(frame_path).convert("RGB")
    out = mosaic_image(img, palette_colors, palette_images, size, zoom, max_emoji_block)
    out.save(out_path)


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--video")
    source.add_argument("--image")
    parser.add_argument("--fps", type=int, default=10)
    parser.add_argument("--size", type=int, default=8)
    parser.add_argument("--zoom", type=int, default=1)
    parser.add_argument("--max-emoji-block", type=int, default=10)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent
    emojis_dir = repo_root / "emojis"
    tmp_dir = repo_root / "tmp_py"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    palette_colors, palette_images = build_emoji_palette(emojis_dir, args.size)
    max_emoji_block = max(1, args.max_emoji_block)

    if args.image:
        image_path = Path(args.image).resolve()
        out_path = args.out or str(image_path.with_name(f"{image_path.stem}-mosaic.png"))
        mosaic_frame(
            image_path,
            palette_colors,
            palette_images,
            args.size,
            args.zoom,
            max_emoji_block,
            Path(out_path),
        )
        print(f"Done: {out_path}")
        return

    video_path = Path(args.video).resolve()
    base = video_path.stem
    frame_pattern = tmp_dir / f"{base}-%05d.png"
    mosaic_pattern = tmp_dir / f"{base}-%05d-mosaic.png"

    run(
        [ffmpeg_path(repo_root), "-y", "-i", str(video_path), "-vf", f"fps={args.fps}", str(frame_pattern)],
        "Extracting frames",
    )

    frames = sorted(tmp_dir.glob(f"{base}-*.png"))
    frames = [f for f in frames if not f.name.endswith("-mosaic.png")]
    total = len(frames)
    for i, frame in enumerate(frames, start=1):
        print(f"Frame {i}/{total}")
        mosaic_out = tmp_dir / f"{frame.stem}-mosaic.png"
        mosaic_frame(frame, palette_colors, palette_images, args.size, args.zoom, max_emoji_block, mosaic_out)

    out_path = args.out
    if out_path is None:
        out_path = str(video_path.with_name(f"{base}-mosaic.mp4"))

    run(
        [
            ffmpeg_path(repo_root),
            "-y",
            "-framerate",
            str(args.fps),
            "-i",
            str(mosaic_pattern),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(args.fps),
            out_path,
        ],
        "Encoding video",
    )
    print(f"Done: {out_path}")


if __name__ == "__main__":
    main()

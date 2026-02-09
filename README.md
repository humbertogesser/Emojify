# Emojify
Turn any image, GIF, or video into a mosaic made entirely of emojis. Includes a local web app with drag-and-drop upload, real-time webcam preview, and support for multiple output formats.

## Usage
Still image:
`ruby emojisaic.rb --image path/to/image.png`

GIF:
`ruby emojisaic.rb --gif path/to/anim.gif`

Video (MP4):
`ruby emojisaic.rb --video path/to/video.mp4 --fps 10`

Video support requires `ffmpeg` on your PATH.

## Local Web App (Drag & Drop)
1. Install Python deps:
`python3 -m pip install --user -r webapp/requirements.txt`

2. Run the app:
`python3 webapp/app.py`

3. Open:
`http://127.0.0.1:5050`

Web app supports:
- Video upload (`<=15s`, `<=20MB`) with MP4/GIF output
- Image upload (`<=20MB`) with PNG/JPG output
- Live webcam mosaic preview (local only)

## Variable Emoji Size
`video_emojisaic.py` now merges repeated emoji regions into larger square emojis.
Example:
`python3 video_emojisaic.py --video path/to/video.mov --size 8 --max-emoji-block 10`

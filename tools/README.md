# 36247 Upload Tool

CLI tool for uploading audio files to the 36247 tracks S3 bucket.

## Setup

```bash
cd tools
pip install -r requirements.txt
```

## Usage

Upload a single file:
```bash
python upload.py /path/to/track.mp3
```

Upload a directory (recursive):
```bash
python upload.py /path/to/music/folder
```

Upload multiple paths:
```bash
python upload.py track1.mp3 track2.mp3 /folder/with/music
```

### Options

- `--dry-run`: Show what would be uploaded without actually uploading
- `--bucket`: Override S3 bucket name (default: `36247-tracks.rmzi.world`)
- `--profile`: AWS profile to use (default: `personal`)

### Examples

Preview uploads (dry run):
```bash
python upload.py --dry-run /path/to/music
```

Upload to a different bucket:
```bash
python upload.py --bucket my-test-bucket /path/to/track.mp3
```

## Supported Formats

- MP3 (`.mp3`)
- M4A/AAC (`.m4a`)
- OGG Vorbis (`.ogg`)
- FLAC (`.flac`)
- WAV (`.wav`)

## Metadata Extraction

The tool automatically extracts metadata from audio files:
- Artist
- Album
- Title
- Year
- Duration

Files are assigned a unique ID based on their content hash, preventing duplicates.

## Environment Variables

- `AWS_PROFILE`: AWS profile to use (default: `personal`)
- `AWS_REGION`: AWS region (default: `us-east-1`)
- `TRACKS_BUCKET`: S3 bucket name (default: `36247-tracks.rmzi.world`)

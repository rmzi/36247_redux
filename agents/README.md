# 36247 Metadata Agent

Scans the tracks bucket for untagged files and attempts to identify them using external music databases.

## Setup

```bash
cd agents
pip install -r requirements.txt
```

## Usage

Scan and update untagged tracks:
```bash
python metadata-agent.py
```

### Options

- `--dry-run`: Show what would be updated without actually updating
- `--all`: Process all tracks, not just untagged ones
- `--limit N`: Limit processing to N tracks
- `--bucket`: Override S3 bucket name
- `--profile`: AWS profile to use

### Examples

Preview what would be updated:
```bash
python metadata-agent.py --dry-run
```

Process only 5 tracks:
```bash
python metadata-agent.py --limit 5
```

Reprocess all tracks (including already tagged):
```bash
python metadata-agent.py --all
```

## How It Works

1. Fetches the manifest from S3
2. Identifies tracks that are missing metadata (`tagged: false`)
3. For each untagged track:
   - Extracts hints from the original filename
   - Searches MusicBrainz for matching recordings
   - Updates the track entry with found metadata
4. Saves the updated manifest back to S3

## External APIs

### MusicBrainz
- Free, open music database
- Rate limited to 1 request per second
- Good coverage for commercial releases

### Future Enhancements

- **Discogs API**: Better for hip-hop, underground, vinyl releases
- **AcoustID**: Audio fingerprinting for truly unknown files
- **Last.fm**: Additional metadata and genre information

## Environment Variables

- `AWS_PROFILE`: AWS profile to use (default: `personal`)
- `AWS_REGION`: AWS region (default: `us-east-1`)
- `TRACKS_BUCKET`: S3 bucket name (default: `36247-tracks.rmzi.world`)

## Running as a Scheduled Job

The agent can be run on a schedule (daily/weekly) to process newly uploaded tracks:

```bash
# Crontab example - run daily at 3am
0 3 * * * cd /path/to/agents && python metadata-agent.py >> /var/log/metadata-agent.log 2>&1
```

Or deploy as an AWS Lambda function triggered by S3 events or CloudWatch Events.

#!/usr/bin/env python3
"""
36247 Metadata Agent

Scans the tracks bucket for untagged files and attempts to identify them
using external music databases (MusicBrainz, Discogs).
"""

import argparse
import hashlib
import io
import json
import os
import sys
import time
from datetime import datetime

import boto3
import musicbrainzngs
from mutagen import File as MutagenFile

# Configuration
AWS_PROFILE = os.environ.get('AWS_PROFILE', 'personal')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
TRACKS_BUCKET = os.environ.get('TRACKS_BUCKET', '36247-tracks.rmzi.world')
MANIFEST_KEY = 'manifest.json'

# MusicBrainz configuration
MB_APP_NAME = '36247-metadata-agent'
MB_APP_VERSION = '1.0'
MB_CONTACT = 'metadata@rmzi.world'

# Rate limiting for external APIs
API_DELAY_SECONDS = 1.0


def setup_musicbrainz():
    """Configure MusicBrainz client."""
    musicbrainzngs.set_useragent(MB_APP_NAME, MB_APP_VERSION, MB_CONTACT)


def get_s3_client():
    """Get boto3 S3 client using the configured profile."""
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return session.client('s3')


def get_manifest(s3_client) -> dict:
    """Fetch current manifest from S3."""
    try:
        response = s3_client.get_object(Bucket=TRACKS_BUCKET, Key=MANIFEST_KEY)
        return json.loads(response['Body'].read().decode('utf-8'))
    except s3_client.exceptions.NoSuchKey:
        return {
            'version': 1,
            'generated': datetime.utcnow().isoformat() + 'Z',
            'tracks': []
        }
    except Exception as e:
        print(f"Error fetching manifest: {e}", file=sys.stderr)
        sys.exit(1)


def save_manifest(s3_client, manifest: dict):
    """Save manifest to S3."""
    manifest['generated'] = datetime.utcnow().isoformat() + 'Z'
    body = json.dumps(manifest, indent=2)

    s3_client.put_object(
        Bucket=TRACKS_BUCKET,
        Key=MANIFEST_KEY,
        Body=body.encode('utf-8'),
        ContentType='application/json'
    )


def compute_acoustid_fingerprint(audio_data: bytes) -> tuple:
    """
    Compute AcoustID fingerprint from audio data.

    Note: This requires chromaprint/fpcalc to be installed.
    For simplicity, we'll skip fingerprinting and rely on text-based search.
    """
    # TODO: Implement AcoustID fingerprinting if needed
    return None, None


def search_musicbrainz(artist: str = None, title: str = None, album: str = None) -> dict:
    """
    Search MusicBrainz for track metadata.

    Returns dict with artist, album, title, year if found.
    """
    result = {}

    try:
        if artist and title:
            # Search by artist + title
            query = f'artist:"{artist}" AND recording:"{title}"'
            recordings = musicbrainzngs.search_recordings(query=query, limit=5)

            if recordings.get('recording-list'):
                rec = recordings['recording-list'][0]
                result['title'] = rec.get('title')

                if rec.get('artist-credit'):
                    result['artist'] = rec['artist-credit'][0].get('name')

                if rec.get('release-list'):
                    release = rec['release-list'][0]
                    result['album'] = release.get('title')
                    if release.get('date'):
                        try:
                            result['year'] = int(release['date'][:4])
                        except (ValueError, IndexError):
                            pass

        elif title:
            # Search by title only
            recordings = musicbrainzngs.search_recordings(recording=title, limit=5)

            if recordings.get('recording-list'):
                rec = recordings['recording-list'][0]
                result['title'] = rec.get('title')

                if rec.get('artist-credit'):
                    result['artist'] = rec['artist-credit'][0].get('name')

                if rec.get('release-list'):
                    release = rec['release-list'][0]
                    result['album'] = release.get('title')
                    if release.get('date'):
                        try:
                            result['year'] = int(release['date'][:4])
                        except (ValueError, IndexError):
                            pass

    except musicbrainzngs.WebServiceError as e:
        print(f"  MusicBrainz error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"  Unexpected error searching MusicBrainz: {e}", file=sys.stderr)

    return result


def guess_metadata_from_filename(filename: str) -> dict:
    """
    Attempt to extract artist/title from filename patterns.

    Common patterns:
    - "Artist - Title.mp3"
    - "Artist - Album - Title.mp3"
    - "01 - Title.mp3"
    - "01. Title.mp3"
    """
    result = {}

    # Remove extension
    name = os.path.splitext(filename)[0]

    # Try "Artist - Title" pattern
    if ' - ' in name:
        parts = name.split(' - ')
        if len(parts) == 2:
            result['artist'] = parts[0].strip()
            result['title'] = parts[1].strip()
        elif len(parts) == 3:
            result['artist'] = parts[0].strip()
            result['album'] = parts[1].strip()
            result['title'] = parts[2].strip()
        elif len(parts) > 3:
            result['artist'] = parts[0].strip()
            result['title'] = parts[-1].strip()

    # Try "## - Title" or "##. Title" pattern (track number prefix)
    elif name[:2].isdigit():
        title = name[2:].lstrip(' .-').strip()
        if title:
            result['title'] = title

    # Fallback to filename as title
    if not result.get('title'):
        result['title'] = name

    return result


def process_untagged_track(track: dict, s3_client, dry_run: bool = False) -> dict:
    """
    Process a single untagged track and attempt to find metadata.

    Returns updated track dict with new metadata.
    """
    print(f"\nProcessing: {track.get('original_filename', track['id'])}")

    updates = {}

    # Start with filename-based guesses
    original_filename = track.get('original_filename', f"{track['id']}.mp3")
    filename_meta = guess_metadata_from_filename(original_filename)

    # Get current metadata
    current_artist = track.get('artist')
    current_title = track.get('title')
    current_album = track.get('album')

    # Use filename guesses if we have nothing
    search_artist = current_artist or filename_meta.get('artist')
    search_title = current_title or filename_meta.get('title')

    print(f"  Current: {current_artist or '???'} - {current_title or '???'}")
    print(f"  Searching with: {search_artist or '???'} - {search_title or '???'}")

    # Search MusicBrainz
    time.sleep(API_DELAY_SECONDS)  # Rate limiting
    mb_result = search_musicbrainz(
        artist=search_artist,
        title=search_title,
        album=current_album
    )

    if mb_result:
        print(f"  MusicBrainz found: {mb_result.get('artist', '???')} - {mb_result.get('title', '???')}")

        # Update only missing fields
        if not current_artist and mb_result.get('artist'):
            updates['artist'] = mb_result['artist']

        if not track.get('album') and mb_result.get('album'):
            updates['album'] = mb_result['album']

        if not current_title and mb_result.get('title'):
            updates['title'] = mb_result['title']

        if not track.get('year') and mb_result.get('year'):
            updates['year'] = mb_result['year']

    else:
        print("  MusicBrainz: No results")

        # Fall back to filename metadata
        if not current_artist and filename_meta.get('artist'):
            updates['artist'] = filename_meta['artist']

        if not current_title and filename_meta.get('title'):
            updates['title'] = filename_meta['title']

        if not track.get('album') and filename_meta.get('album'):
            updates['album'] = filename_meta['album']

    if updates:
        print(f"  Updates: {updates}")

        if not dry_run:
            # Apply updates to track
            for key, value in updates.items():
                track[key] = value

            # Mark as tagged if we now have artist or title
            track['tagged'] = bool(track.get('artist') or track.get('title'))
            track['metadata_updated'] = datetime.utcnow().isoformat() + 'Z'

    else:
        print("  No updates found")

    return track


def main():
    parser = argparse.ArgumentParser(
        description='Scan for untagged tracks and fetch metadata'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be updated without actually updating'
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Process all tracks, not just untagged ones'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=0,
        help='Limit number of tracks to process (0 = no limit)'
    )
    parser.add_argument(
        '--bucket',
        default=TRACKS_BUCKET,
        help=f'S3 bucket name (default: {TRACKS_BUCKET})'
    )
    parser.add_argument(
        '--profile',
        default=AWS_PROFILE,
        help=f'AWS profile (default: {AWS_PROFILE})'
    )

    args = parser.parse_args()

    # Update globals from args
    global TRACKS_BUCKET, AWS_PROFILE
    TRACKS_BUCKET = args.bucket
    AWS_PROFILE = args.profile

    # Setup MusicBrainz
    setup_musicbrainz()

    # Initialize S3 client
    s3_client = get_s3_client()

    # Get manifest
    manifest = get_manifest(s3_client)
    print(f"Manifest has {len(manifest['tracks'])} track(s)")

    # Find tracks to process
    if args.all:
        tracks_to_process = manifest['tracks']
    else:
        tracks_to_process = [
            t for t in manifest['tracks']
            if not t.get('tagged') or not t.get('artist') or not t.get('title')
        ]

    print(f"Found {len(tracks_to_process)} track(s) to process")

    if args.limit > 0:
        tracks_to_process = tracks_to_process[:args.limit]
        print(f"Limiting to {args.limit} track(s)")

    if not tracks_to_process:
        print("No tracks to process.")
        return 0

    # Process tracks
    updated_count = 0
    for track in tracks_to_process:
        original_tagged = track.get('tagged', False)
        process_untagged_track(track, s3_client, args.dry_run)

        if track.get('tagged') != original_tagged or track.get('metadata_updated'):
            updated_count += 1

    # Save updated manifest
    if updated_count > 0 and not args.dry_run:
        save_manifest(s3_client, manifest)
        print(f"\nUpdated {updated_count} track(s)")
    elif args.dry_run and updated_count > 0:
        print(f"\nWould update {updated_count} track(s)")
    else:
        print("\nNo updates made")

    return 0


if __name__ == '__main__':
    sys.exit(main())

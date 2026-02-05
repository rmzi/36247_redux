# 36247 Redux - Music Streaming Site

## Project Overview
A secure, minimal music streaming site with F.A.T. (fffff.at) aesthetic.

## AWS Configuration
- **Profile**: `personal`
- **Region**: `us-east-1` (required for CloudFront)
- **Domain**: `36247.rmzi.world`

## Architecture
- **Site Bucket**: `36247-site.rmzi.world` - Static frontend (public via CloudFront)
- **Tracks Bucket**: `36247-tracks.rmzi.world` - Audio files (private, signed cookies required)
- **CloudFront**: CDN with Origin Access Control (OAC) for both buckets
- **Signed Cookies**: Required for `/audio/*` paths, generated client-side

## Key Commands

### Terraform
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Deploy Frontend
```bash
./scripts/deploy.sh
```

### Upload Audio
```bash
cd tools
python upload.py <file_or_directory>
```

### Run Metadata Agent
```bash
cd agents
python metadata-agent.py
```

## Security Model
- Tracks bucket has no public access
- CloudFront OAC is the only way to access audio files
- Signed cookies (24h TTL) required for audio streaming
- No public manifest = track list not crawlable

## Development Notes
- Uses existing wildcard certificate from rmzi.world infrastructure
- Frontend uses localStorage to track heard tracks
- MP3 files support native byte-range requests (no transcoding needed)

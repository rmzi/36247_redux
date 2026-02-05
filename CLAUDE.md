# 36247 Redux - Music Streaming Site

> Information is power.

## Project Overview
A secure, minimal music streaming site with F.A.T. (fffff.at) aesthetic.

## AWS Configuration
- **Region**: `us-east-1` (required for CloudFront)
- **Domain**: `36247.rmzi.world`

## Architecture
- **Site Bucket**: Static frontend (public via CloudFront)
- **Tracks Bucket**: Audio files (private, signed cookies required)
- **CloudFront**: CDN with Origin Access Control (OAC) for both buckets
- **Signed Cookies**: Required for `/audio/*` paths

## Key Commands

### Deploy
```bash
npm run deploy           # Deploy site files
npm run deploy:cookies   # Refresh auth cookies (weekly)
```

### Terraform
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

## Security Model
- Tracks bucket has no public access
- CloudFront OAC is the only way to access audio files
- Signed cookies required for audio streaming
- No public manifest = track list not crawlable

## Analytics
- GA4 tracking for usage insights (song plays, skips, downloads, searches)

## Development
- On localhost, ENTER grants full permissions (secret mode)
- See `docs/README.md` for detailed setup instructions

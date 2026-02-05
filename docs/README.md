# 36247 Technical Documentation

## Architecture

```
                    CloudFront (36247.rmzi.world)
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────▼─────────┐         ┌──────────▼──────────┐
    │  Site Bucket      │         │  Tracks Bucket      │
    │  (public via CF)  │         │  (private, signed)  │
    │                   │         │                     │
    │  - index.html     │         │  - /audio/*.mp3     │
    │  - main.js        │         │  - /artwork/*       │
    │  - main.css       │         │  - manifest.json    │
    └───────────────────┘         └─────────────────────┘
```

- **Site bucket**: Public static files served via CloudFront
- **Tracks bucket**: Private, requires CloudFront signed cookies
- **CloudFront**: Single distribution with OAC, signed cookies for `/audio/*` and `/manifest.json`

## Player Modes

| Mode | Access | Features |
|------|--------|----------|
| Regular | Password | Random playback, skip tracks |
| Secret | Konami code | Browse/search 2,091 tracks, download |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| N | Next track |
| D | Download (secret mode) |
| / | Focus search (secret mode) |
| ← → | Seek ±10 seconds |

## Development

### Prerequisites

- AWS CLI configured with `personal` profile
- Python 3.11+ with venv
- Node.js 18+

### Setup

```bash
# Install Python dependencies
cd tools
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Install Node dependencies
cd ..
npm install
```

### Local Development

On localhost, press ENTER for full access (secret mode, no password needed).

```bash
cd www && python3 -m http.server 8080
# Open http://localhost:8080
```

### Deploy

```bash
npm run deploy           # Deploy site files
npm run deploy:cookies   # Refresh auth cookies (weekly)

# Or manually sync to your site bucket
```

### Refresh Cookies

Cookies expire after 1 week:

```bash
source tools/.venv/bin/activate
python tools/deploy-cookies.py --hours 168
```

### Generate Cookies for Testing

```bash
python tools/sign-cookies.py --format js    # Browser console
python tools/sign-cookies.py --format curl  # curl
python tools/sign-cookies.py --format json  # JSON
```

### Run Tests

```bash
npm test                    # Run all tests
npm run test:chromium       # Chromium only
npm run test:headed         # Watch in browser
npm run test:ui             # Interactive UI
```

## Infrastructure (Terraform)

All AWS resources managed via Terraform in `/terraform`:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Resources

- S3 buckets (site + tracks)
- CloudFront distribution with OAC
- CloudFront key pair for signing
- Secrets Manager secret (signing key)
- Route53 DNS records
- IAM roles for upload/metadata tools

## Tools

| Tool | Description |
|------|-------------|
| `tools/sign-cookies.py` | Generate signed cookies for CLI/testing |
| `tools/deploy-cookies.py` | Deploy auth.html with fresh cookies |
| `tools/upload.py` | Upload audio files to S3 |
| `tools/batch_upload.py` | Bulk upload from metadata_base.json |
| `tools/extract_metadata.py` | Extract metadata from local audio files |

## Data

- **2,091 tracks** (~15.7 GB audio)
- **2,091 artwork images** (~351 MB)
- Metadata in `metadata/metadata_base.json`

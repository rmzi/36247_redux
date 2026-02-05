# 36 24 7

Remake of the 36 Mafia player made by the lovely folks @ F.A.T.

## Live Site

**https://36247.rmzi.world**

## How It Works

### Architecture

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
    │  - auth.html      │         │                     │
    └───────────────────┘         └─────────────────────┘
```

- **Site bucket**: Public static files served via CloudFront
- **Tracks bucket**: Private, requires CloudFront signed cookies to access
- **CloudFront**: Single distribution with OAC, signed cookies for `/audio/*` and `/manifest.json`

### Authentication Flow

1. User visits `https://36247.rmzi.world`
2. Clicks ENTER → site tries to load `/manifest.json`
3. If no cookies → redirects to `/auth.html`
4. `/auth.html` sets signed cookies (embedded by deploy script)
5. Auto-redirects back to main site
6. Cookies valid for 1 week

### Player Modes

| Mode | URL | Features |
|------|-----|----------|
| Regular | `https://36247.rmzi.world` | Random playback, NEXT to skip |
| Super | `https://36247.rmzi.world#super` | Browse/search all 2,091 tracks |
| Secret | `https://36247.rmzi.world#secret` | Browse + download enabled |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| N | Next track |
| D | Download (secret mode only) |
| / | Focus search (super/secret modes) |
| ← → | Seek ±10 seconds |

## Quick Start (Accessing the Site)

1. Visit **https://36247.rmzi.world/auth.html**
2. Cookies are automatically set (valid 1 week)
3. You're redirected to the player
4. Click ENTER and enjoy!

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

### Deploy Commands

```bash
# Deploy fresh auth cookies (do this weekly)
npm run deploy:cookies

# Deploy site files
npm run deploy

# Or manually:
AWS_PROFILE=personal aws s3 sync www/ s3://36247-site.rmzi.world/
```

### Refresh Cookies

Cookies expire after 1 week. To refresh:

```bash
source tools/.venv/bin/activate
python tools/deploy-cookies.py --hours 168
```

### Generate Cookies for Testing

```bash
# For browser console
python tools/sign-cookies.py --format js

# For curl
python tools/sign-cookies.py --format curl

# JSON output
python tools/sign-cookies.py --format json
```

### Run Tests

```bash
npm test                    # Run all tests
npm run test:chromium       # Chromium only
npm run test:headed         # Watch in browser
npm run test:ui             # Interactive UI
```

## Infrastructure (Terraform)

All AWS resources are managed via Terraform in `/terraform`:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Resources Created

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

## Who

- @rmzi
- @awanderingorill

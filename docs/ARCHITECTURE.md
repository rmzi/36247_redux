# 36247 Redux: Technical Architecture

## Requirements Summary

Based on the original 36 24 7 and modern constraints:

| Requirement | Original | Redux |
|-------------|----------|-------|
| Auto-play on load | Yes (Flash era) | No - "Enter" button required |
| Download button | Yes | No - streaming only |
| Next/Skip button | Yes | Yes |
| Track info display | Yes (ID3 tags) | Yes (from manifest) |
| Progress tracking | Yes (cookies) | Yes (localStorage) |
| Backend | FTP server | S3 + CloudFront |
| Auth required | No | No |
| Server needed | Minimal (static hosting) | Ideally none |

---

## Architecture Options

### Option 1: Pure S3 Static Hosting (Simplest)

```
┌─────────────────────────────────────────────────────────────┐
│                        S3 Bucket                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /index.html                                        │   │
│  │  /main.css                                          │   │
│  │  /main.js                                           │   │
│  │  /manifest.json       (track list + metadata)       │   │
│  │  /audio/              (all MP3 files)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│              S3 Static Website Hosting                      │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Browser    │
                    └───────────────┘
```

**Pros:**
- Zero server management
- Extremely simple deployment
- Lowest cost (~$0.023/GB storage + $0.09/GB transfer)
- No code to maintain beyond static files

**Cons:**
- Audio files directly accessible via URL (can't truly prevent downloads)
- No analytics (which is actually a pro for F.A.T. ethos)
- Bucket must be public for website hosting

**S3 Configuration:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::36247-redux/*"
    }
  ]
}
```

**Best For:** MVP, testing, true F.A.T. spirit (who cares if people download?)

---

### Option 2: CloudFront + Referer Restriction (Better Protection)

```
┌─────────────────────────────────────────────────────────────┐
│                     S3 Bucket (Private)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /audio/              (all MP3 files)               │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │ OAC (Origin Access Control)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CloudFront Distribution                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Behavior: /audio/*                                 │   │
│  │  - Restrict by Referer header                       │   │
│  │  - Cache audio files (reduce S3 costs)              │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                     S3 Bucket (Public)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /index.html, /main.css, /main.js, /manifest.json   │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Browser    │
                    └───────────────┘
```

**CloudFront Function for Referer Check:**
```javascript
function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var referer = headers['referer'] ? headers['referer'].value : '';

    // Allow requests from our domain
    if (referer.startsWith('https://36247.yourdomain.com') ||
        referer.startsWith('http://localhost')) {
        return request;
    }

    // Block direct access
    return {
        statusCode: 403,
        statusDescription: 'Forbidden',
        body: 'Direct access not allowed'
    };
}
```

**Pros:**
- Audio files not directly accessible (deterrent, not bulletproof)
- CloudFront caching reduces S3 costs
- Better global performance via CDN
- Still no server to manage

**Cons:**
- Referer can be spoofed (not true security)
- More complex setup
- CloudFront has a learning curve

**Best For:** Production deployment where you want some access control

---

### Option 3: Signed URLs via Lambda@Edge (Strongest Protection)

```
┌─────────────────────────────────────────────────────────────┐
│                     S3 Bucket (Private)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /audio/              (all MP3 files)               │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │ OAC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CloudFront Distribution                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Lambda@Edge: Viewer Request                        │   │
│  │  - Validate signed URL parameters                   │   │
│  │  - Check expiration                                 │   │
│  │  - Generate new signed URL for next track           │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                    API Gateway + Lambda                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  POST /next-track                                   │   │
│  │  - Select random track                              │   │
│  │  - Generate signed CloudFront URL (5 min expiry)    │   │
│  │  - Return track metadata + signed URL               │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Browser    │
                    └───────────────┘
```

**Lambda Function (Node.js):**
```javascript
const AWS = require('aws-sdk');
const crypto = require('crypto');

exports.handler = async (event) => {
    const tracks = require('./manifest.json').tracks;
    const track = tracks[Math.floor(Math.random() * tracks.length)];

    const signedUrl = getSignedUrl(track.path, 300); // 5 min expiry

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: signedUrl,
            artist: track.artist,
            album: track.album,
            title: track.title,
            year: track.year
        })
    };
};

function getSignedUrl(path, expiresIn) {
    // CloudFront signed URL generation
    // Requires CloudFront key pair
}
```

**Pros:**
- URLs expire quickly (can't be shared effectively)
- True access control
- Can add rate limiting, analytics if desired
- Most "secure" option

**Cons:**
- Requires Lambda (small server component)
- More complex deployment
- Higher latency for track changes
- Overkill for the F.A.T. philosophy?

**Best For:** If you truly need to prevent any downloading

---

## Recommendation

### For True F.A.T. Spirit: Option 1 or 2

The original 36 24 7 had a download button. F.A.T. Lab's philosophy was about sharing freely. If someone wants to download a track, let them. The streaming-only requirement is more about UX (don't encourage downloading) than DRM.

**Recommended approach:**
1. Start with **Option 1** (pure S3)
2. If you want a deterrent, upgrade to **Option 2** (CloudFront + Referer)
3. Only use **Option 3** if there's a specific legal/licensing reason

### Practical Protection Without a Server

Even with Option 1/2, you can deter casual downloading:
- Don't expose the manifest.json track URLs to users
- Use generic/obfuscated filenames in S3
- The HTML5 audio element doesn't show a download button by default
- Most users won't inspect network requests

---

## File Structure

### S3 Bucket Layout
```
36247-redux/
├── index.html
├── main.css
├── main.js
├── manifest.json
├── assets/
│   ├── enter-button.png
│   ├── next-button.png
│   └── favicon.ico
└── audio/
    ├── 001.mp3
    ├── 002.mp3
    ├── 003.mp3
    └── ... (all tracks with numeric names)
```

### Manifest Format
```json
{
  "version": 1,
  "total": 500,
  "tracks": [
    {
      "id": "001",
      "path": "audio/001.mp3",
      "artist": "Artist Name",
      "album": "Album Name",
      "title": "Track Title",
      "year": 2008,
      "duration": 245
    }
  ]
}
```

---

## Terraform Resources (Existing)

The project already has Terraform configuration in `/tf/`:
- `main.tf` - Provider configuration
- `s3.tf` - S3 bucket for audio files
- `dns.tf` - DNS configuration
- `variables.tf` - Variable definitions

### Suggested Additions

**CloudFront Distribution (if using Option 2):**
```hcl
resource "aws_cloudfront_distribution" "audio_cdn" {
  origin {
    domain_name = aws_s3_bucket.audio.bucket_regional_domain_name
    origin_id   = "S3-audio"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.audio.cloudfront_access_identity_path
    }
  }

  enabled             = true
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-audio"

    forwarded_values {
      query_string = false
      headers      = ["Referer"]
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
```

---

## Deployment Workflow

### Manual (Simple)
```bash
# Sync static files
aws s3 sync ./www s3://36247-redux --exclude "audio/*"

# Sync audio (separately, only when changed)
aws s3 sync ./audio s3://36247-redux/audio --size-only
```

### GitHub Actions (Automated)
```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to S3
        uses: jakejarvis/s3-sync-action@master
        with:
          args: --exclude 'audio/*'
        env:
          AWS_S3_BUCKET: 36247-redux
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Cost Estimation

### Option 1 (S3 Only)
- Storage: ~$0.023/GB/month
- Transfer: ~$0.09/GB (first 10TB)
- Requests: ~$0.0004/1000 GET requests

**Example (500 tracks @ 5MB avg, 1000 plays/day):**
- Storage: 2.5GB = ~$0.06/month
- Transfer: 5GB/day = 150GB/month = ~$13.50/month
- **Total: ~$15/month**

### Option 2 (CloudFront)
- CloudFront transfer: ~$0.085/GB (cheaper than S3 direct)
- CloudFront requests: ~$0.01/10,000 requests
- S3 reduced due to caching

**Example (same usage with 80% cache hit):**
- Storage: 2.5GB = ~$0.06/month
- CloudFront: 150GB * 0.085 = ~$12.75/month
- S3 transfer: 30GB * 0.09 = ~$2.70/month
- **Total: ~$16/month** (slightly more but faster)

---

## Next Steps

1. **Decide on architecture** - Option 1 for MVP, Option 2 for production
2. **Prepare audio files** - normalize, rename, extract metadata
3. **Generate manifest** - script to build manifest.json from files
4. **Update Terraform** - add CloudFront if needed
5. **Build frontend** - HTML/CSS/JS player
6. **Deploy and test**

---

*Architecture designed to honor F.A.T. Lab's simplicity while meeting modern requirements.*

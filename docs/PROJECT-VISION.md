# 36247 Redux: Project Vision

## Origin

This project recreates **fffff.at/36247** (the F.A.T. Lab "36 24 7" player) in a modern way.

The original was an audio player hooked up to an FTP server that would play Three 6 Mafia tracks automatically on load. It had two buttons—download and next—plus a top bar showing song details (artist, album, track, year).

---

## Personal Connection

I worked with **Eyebeam** as an intern and want to bring that air of collaboration and anti-establishment ethos into this project. The themes of **security, surveillance, and resistance to corporate tech** that F.A.T. Lab embodied should carry forward.

---

## Modern Adaptation

### What We Keep
- **Random play** - no algorithms, no playlists, just chaos
- **Minimal interface** - top bar with track info + single action button
- **Progress tracking** - percentage of catalog heard
- **Raw F.A.T. aesthetic** - unpolished, anti-corporate, honest

### What Changes

| Original | Redux | Reason |
|----------|-------|--------|
| Auto-play on load | "Enter" button to start | Browsers block autoplay now |
| Download button | Removed (streaming only) | Don't want to encourage downloads |
| FTP server | S3 + CloudFront | Modern, scalable, cheap |
| Flash (SoundManager2) | HTML5 Audio API | Flash is dead |
| Desktop only | Responsive | Mobile matters now |

### Core User Flow
```
1. Land on page → see "ENTER" button
2. Click Enter → random track starts
3. Top bar shows: Artist | Album | Track | Year
4. "NEXT" button → skip to another random track
5. Track ends → auto-advances to next random track
6. Progress bar shows % of catalog explored
```

---

## Technical Requirements

### Must Have
- **Serve audio from S3** - no traditional server for file hosting
- **Lock down S3** - disallow direct access outside the webpage
- **Streaming only** - no easy download option exposed to users
- **Serverless if possible** - if a server is 100% necessary, use minimal AWS tooling (Lambda, API Gateway)

### Nice to Have
- Works offline (PWA with cached UI)
- Keyboard controls (spacebar = next)
- Visualizer using Web Audio API
- Dark mode that's actually dark (not gray)

---

## Design Philosophy

### Extending F.A.T. Into the Future

F.A.T. Lab shut down in 2015 acknowledging "our adversaries have grown powerful and our methods outdated." But the spirit doesn't have to die.

**What F.A.T. stood for:**
- Public domain everything
- Anti-surveillance, anti-corporate tech
- "Notorious R&D" - release early, often, with rap music
- Accessible tools for everyone
- Hacker/street art/hip-hop culture fusion

**How we extend it:**
- Zero tracking, zero analytics
- No login, no accounts, no data collection
- Source code public and readable
- Function over engagement optimization
- Honest about what it is and isn't

### Visual Direction
- **Typography**: Monospace, terminal aesthetic
- **Colors**: High contrast black/white, occasional red accents
- **Graphics**: Lo-fi, bitmap, intentionally rough
- **Layout**: Single column, visible structure, no polish
- **UI**: Minimal—if it needs explanation, simplify it

---

## Research Findings

### Original Project Details (August 2008)
- **719 tracks** from Three 6 Mafia / Hypnotize Minds discography
- Created by **Theo Watson** (also known for openFrameworks)
- Used **SoundManager2** for Flash-based audio
- **ID3 tag reading** for metadata display
- **Cookie-based** progress persistence
- Mac desktop app created same day by **Jamie Dubs** using Fluid

### F.A.T. Lab Context
- Founded 2007 by Evan Roth and James Powderly
- Deep connection to Eyebeam Art + Technology Center (2005-2008)
- Spawned from Graffiti Research Lab
- Shut down August 2015 with honest acknowledgment of losing the fight against surveillance capitalism
- All work released to public domain

### Why It Matters
The 36 24 7 player embodied F.A.T.'s ethos perfectly:
- Took existing content (Three 6 Mafia catalog)
- Made it freely accessible
- Built fast, shipped fast
- No monetization, no tracking
- Pure utility with personality

---

## Architecture Decision

### Recommended: CloudFront + Referer Restriction

```
S3 (private, audio files)
        ↓
CloudFront (CDN, referer check)
        ↓
S3 (public, static site files)
        ↓
    Browser
```

**Why this approach:**
- No server to manage
- Deters direct file access (not bulletproof, but sufficient)
- CloudFront caching reduces costs
- ~$15-20/month estimated cost
- Can upgrade to signed URLs later if needed

**If truly serverless isn't enough:**
- Lambda@Edge for signed URL generation
- URLs expire in 5 minutes
- Still no persistent server

---

## What This Project Is NOT

- Not a music discovery service
- Not trying to be Spotify
- Not optimized for engagement
- Not collecting any data
- Not making any money
- Not asking for permission

---

## Open Questions

1. **What music catalog?** - Original used Three 6 Mafia. What's the redux catalog?
2. **Domain?** - Using 36247.something or different?
3. **Mobile priority?** - Desktop-first like original, or mobile-first?
4. **Visualizer?** - Worth adding Web Audio API visualizations?

---

*"Release early, often, and with rap music."*

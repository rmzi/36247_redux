# Changelog

All notable changes to 36247 are documented here.

## [Unreleased]

## [2.2.1] - 2026-02-05

### Changed
- Simplified storage architecture: access level now derived from CloudFront cookie presence
- Secret mode persisted in localStorage instead of separate cookie
- Removed "welcome back" message and "reset cookies" link (no longer needed)

### Fixed
- Cookie/localStorage sync issues where UI state could get out of sync with auth state

## [2.2.0] - 2026-02-05

### Added
- Subtle red glow accent in background (bottom-right)
- GA4 event tracking documentation in CLAUDE.md and docs/README.md
- Screenshots in README (main_page, player)
- "Reset cookies" link for returning users with expired sessions
- Konami code can now retrigger cash rain animation on any screen

### Changed
- Cash rain animation: $100 bill textures with 3D tumbling, 80 bills in 3 waves
- Track list text wraps to 2 lines instead of truncating
- Removed separator line above track list
- Simplified architecture docs (removed verbose ASCII diagram)

### Fixed
- Returning users with expired CloudFront cookies now auto-refresh
- Mobile: safe-area padding for notch devices
- Konami on enter screen now transitions to player when already unlocked

## [2.1.0] - 2026-02-05 03:45 EST

### Added
- Diamond/ice text effect on title with visible tiled diamond pattern (conic gradient) and animated shimmer
- Localhost-only debug mode for development (Shift+1-4 or `?debug=mode`)
- Clickable artist/album/artwork in super/secret modes (searches track list)
- Stout Junts artwork grid with image modal in info popup
- Tracklist links for Stout Junts mixes (Vol. 1, 3, 4)
- Social icons (Instagram, GitHub) in info modal
- SVG favicon with diamond-textured "36247"

### Changed
- Updated info modal with F.A.T. Lab history, GRL, Kaho Abe context
- Rewrote "about" text to reflect Memphis rap roots and F.A.T. connection
- Replaced marquee animation with text-overflow ellipsis (fixes duplicate ID bug)
- Optimized Stout Junts images (5MB → ~300KB each)

### Fixed
- Mobile layout completely overhauled - proper sizing and spacing
- Title no longer overflows on mobile (removed 3D transform)
- Modal scrollable on mobile
- Track info truncation only when necessary

## [2.0.0] - 2026-02-04

### Added
- Access level state machine with persistent cookies
- Konami code unlock for super mode
- B+A unlock for secret mode (desktop) / swipe unlock (mobile)
- Password authentication flow
- Album artwork display
- Deep linking via URL hash
- Session history for back/forward navigation
- Volume slider
- Info modal with project details

### Changed
- Unified auth flow combining password and Konami code
- Mobile viewport fixes

## [1.0.0] - 2026-02-03

### Added
- Initial release
- Random track playback from 2,091 Memphis rap tracks
- CloudFront signed cookie authentication
- Three player modes: Regular, Super, Secret
- Track list with search in super/secret modes
- Download functionality in secret mode
- Catalog progress tracking (heard count)
- Keyboard shortcuts for playback control

// 36247 Music Player
// F.A.T. Lab aesthetic streaming player with signed cookie authentication
// Modes unlocked via Konami code: regular -> super (Konami) -> secret (B+A or phone flip)

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    STORAGE_KEY: '36247_heard_tracks',
    ACCESS_COOKIE: '36247_access',
    COOKIE_NAMES: ['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id'],
    PASSWORD: 'ayemanesaymane'
  };

  // Access levels (ordered by privilege)
  const ACCESS_LEVELS = {
    GUEST: 0,
    AUTHENTICATED: 1,
    SECRET: 2
  };

  // COOKIES_PLACEHOLDER - replaced by deploy-cookies.py
  const SIGNED_COOKIES = null;

  // Analytics helper
  function trackEvent(eventName, params = {}) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    }
  }

  // Get access level from cookie
  function getStoredAccessLevel() {
    const match = document.cookie.match(new RegExp(`${CONFIG.ACCESS_COOKIE}=([^;]+)`));
    if (match) {
      const level = ACCESS_LEVELS[match[1].toUpperCase()];
      return level !== undefined ? level : ACCESS_LEVELS.GUEST;
    }
    return ACCESS_LEVELS.GUEST;
  }

  // Save access level to cookie (only upgrades, never downgrades)
  function setAccessLevel(level) {
    const currentLevel = getStoredAccessLevel();
    if (level > currentLevel) {
      const levelName = Object.keys(ACCESS_LEVELS).find(k => ACCESS_LEVELS[k] === level).toLowerCase();
      document.cookie = `${CONFIG.ACCESS_COOKIE}=${levelName}; path=/; secure; samesite=strict; max-age=${60 * 60 * 24 * 365}`;
    }
  }

  // Check if user is at least at given level
  function hasAccessLevel(level) {
    return getStoredAccessLevel() >= level;
  }

  // Konami code sequence: up up down down left right left right
  const KONAMI_SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];
  const SWIPE_THRESHOLD = 50;

  // Check if we have CloudFront cookies
  function hasValidCookies() {
    return CONFIG.COOKIE_NAMES.every(name =>
      document.cookie.split(';').some(c => c.trim().startsWith(name + '='))
    );
  }

  // Set CloudFront cookies
  function setSignedCookies() {
    if (!SIGNED_COOKIES) {
      console.error('Signed cookies not configured');
      return false;
    }
    try {
      for (const [name, value] of Object.entries(SIGNED_COOKIES)) {
        document.cookie = `${name}=${value}; path=/; secure; samesite=strict; max-age=86400`;
      }
      return true;
    } catch (e) {
      console.error('Failed to set cookies:', e);
      return false;
    }
  }

  // Show password prompt
  function showPasswordPrompt() {
    elements.passwordContainer.classList.remove('hidden');
    elements.passwordInput.focus();
    state.passwordShowing = true;
  }

  // Hide password prompt
  function hidePasswordPrompt() {
    elements.passwordContainer.classList.add('hidden');
    elements.passwordError.classList.remove('visible');
    elements.passwordInput.value = '';
  }

  // Validate password and set cookies
  function handlePasswordSubmit() {
    const password = elements.passwordInput.value;
    if (password === CONFIG.PASSWORD) {
      if (setSignedCookies()) {
        setAccessLevel(ACCESS_LEVELS.AUTHENTICATED);
        trackEvent('login', { method: 'password' });
        hidePasswordPrompt();
        startPlayer();
      } else {
        elements.passwordError.textContent = 'cookie error';
        elements.passwordError.classList.add('visible');
      }
    } else {
      trackEvent('login_failed');
      elements.passwordError.textContent = 'wrong';
      elements.passwordError.classList.add('visible');
      elements.passwordInput.value = '';
      elements.passwordInput.focus();
    }
  }

  // Modes
  const MODES = {
    REGULAR: 'regular',
    SECRET: 'secret'
  };

  // State
  let state = {
    mode: MODES.REGULAR,
    manifest: null,
    tracks: [],
    filteredTracks: [],
    currentTrack: null,
    heardTracks: new Set(),
    isPlaying: false,
    searchQuery: '',
    // Konami state
    konamiProgress: 0,
    secretUnlocked: false,
    pressedB: false,
    // Touch tracking
    touchStartX: 0,
    touchStartY: 0,
    // Deep link
    pendingTrackPath: null,
    // Password/Konami flow
    passwordShowing: false,
    // Session history for back/forward
    playHistory: [],
    historyIndex: -1
  };

  // DOM Elements
  const elements = {
    enterScreen: document.getElementById('enter-screen'),
    playerScreen: document.getElementById('player-screen'),
    errorScreen: document.getElementById('error-screen'),
    enterBtn: document.getElementById('enter-btn'),
    backBtn: document.getElementById('back-btn'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    nextBtn: document.getElementById('next-btn'),
    downloadBtn: document.getElementById('download-btn'),
    retryBtn: document.getElementById('retry-btn'),
    audio: document.getElementById('audio-player'),
    artist: document.getElementById('artist'),
    album: document.getElementById('album'),
    title: document.getElementById('title'),
    year: document.getElementById('year'),
    progressBar: document.getElementById('progress-bar'),
    progressContainer: document.getElementById('progress-container'),
    currentTime: document.getElementById('current-time'),
    duration: document.getElementById('duration'),
    heardCount: document.getElementById('heard-count'),
    totalCount: document.getElementById('total-count'),
    heardPercent: document.getElementById('heard-percent'),
    errorMessage: document.getElementById('error-message'),
    trackListContainer: document.getElementById('track-list-container'),
    trackList: document.getElementById('track-list'),
    trackSearch: document.getElementById('track-search'),
    konamiProgress: document.getElementById('konami-progress'),
    artworkContainer: document.getElementById('artwork-container'),
    artworkImage: document.getElementById('artwork-image'),
    passwordContainer: document.getElementById('password-container'),
    passwordInput: document.getElementById('password-input'),
    passwordError: document.getElementById('password-error'),
    welcomeBack: document.getElementById('welcome-back'),
    volumeSlider: document.getElementById('volume-slider'),
    volumeValue: document.getElementById('volume-value'),
    infoTrigger: document.getElementById('info-trigger'),
    infoModal: document.getElementById('info-modal'),
    modalClose: document.getElementById('modal-close'),
    modalBackdrop: document.querySelector('.modal-backdrop'),
    imageModal: document.getElementById('image-modal'),
    imageModalImg: document.getElementById('image-modal-img'),
    imageModalClose: document.getElementById('image-modal-close')
  };

  // URL hash helpers for deep linking (base64 encoded track path)
  function encodeTrackHash(track) {
    try {
      return btoa(track.path).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      return null;
    }
  }

  function decodeTrackHash(hash) {
    try {
      // Restore base64 padding and chars
      let b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return atob(b64);
    } catch (e) {
      return null;
    }
  }

  function getTrackPathFromHash() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#')) {
      return decodeTrackHash(hash.substring(1));
    }
    return null;
  }

  function setTrackInHash(track) {
    if (track) {
      const encoded = encodeTrackHash(track);
      if (encoded) {
        history.replaceState(
          { screen: 'player-screen', trackPath: track.path },
          '',
          '#' + encoded
        );
      }
    }
  }

  // Utility functions
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function showScreen(screenId, pushHistory = true) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');

    // Push to browser history for back/forward support
    if (pushHistory && history.pushState) {
      const currentState = history.state;
      if (!currentState || currentState.screen !== screenId) {
        history.pushState({ screen: screenId }, '', '');
      }
    }
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    showScreen('error-screen');
  }

  // Mode helpers
  function isSecretMode() {
    return state.mode === MODES.SECRET;
  }

  function isSecretMode() {
    return state.mode === MODES.SECRET;
  }

  // Konami code detection
  function getKonamiDots() {
    return elements.konamiProgress ? elements.konamiProgress.querySelectorAll('.konami-dot') : [];
  }

  function updateKonamiDots() {
    const dots = getKonamiDots();
    dots.forEach((dot, i) => {
      dot.classList.remove('filled', 'error', 'success');
      if (i < state.konamiProgress) {
        dot.classList.add('filled');
      }
    });
    // Show dots as active once user starts entering
    if (elements.konamiProgress && state.konamiProgress > 0) {
      elements.konamiProgress.classList.add('active');
    }
  }

  function flashKonamiError() {
    const dots = getKonamiDots();
    dots.forEach(dot => {
      dot.classList.add('error');
    });
    if (elements.konamiProgress) {
      elements.konamiProgress.classList.add('active');
    }
    setTimeout(() => {
      dots.forEach(dot => dot.classList.remove('error', 'filled'));
      if (elements.konamiProgress) {
        elements.konamiProgress.classList.remove('active');
      }
    }, 300);
  }

  function flashKonamiSuccess() {
    const dots = getKonamiDots();
    dots.forEach(dot => {
      dot.classList.remove('filled');
      dot.classList.add('success');
    });
    setTimeout(() => {
      dots.forEach(dot => dot.classList.remove('success'));
    }, 500);
  }

  function showSecretHint() {
    // Add hint element if not exists
    if (!document.querySelector('.secret-hint')) {
      const hint = document.createElement('div');
      hint.className = 'secret-hint visible';
      hint.textContent = 'q + ɐ';  // Upside down hint for B + A
      const enterContent = document.querySelector('.enter-content');
      if (enterContent) {
        enterContent.appendChild(hint);
      }
    }
  }

  function showCashRain() {
    const overlay = document.createElement('div');
    overlay.className = 'cash-rain';

    // Create falling bills
    const bills = ['💵', '💰', '💸', '🤑'];
    const numBills = 30;

    for (let i = 0; i < numBills; i++) {
      const bill = document.createElement('span');
      bill.className = 'bill';
      bill.textContent = bills[Math.floor(Math.random() * bills.length)];
      bill.style.left = Math.random() * 100 + 'vw';
      bill.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      bill.style.animationDelay = (Math.random() * 0.8) + 's';
      overlay.appendChild(bill);
    }

    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2500);
  }

  function handleKonamiInput(direction) {
    // Skip if already unlocked secret mode
    if (state.secretUnlocked) return;

    // Only allow Konami on enter screen (before clicking enter)
    if (!elements.enterScreen.classList.contains('active')) return;

    // Hide password box on first Konami input if it's showing
    if (state.konamiProgress === 0 && direction === 'up' && state.passwordShowing) {
      elements.passwordContainer.classList.add('dismissed');
    }

    if (KONAMI_SEQUENCE[state.konamiProgress] === direction) {
      state.konamiProgress++;
      updateKonamiDots();

      if (state.konamiProgress === KONAMI_SEQUENCE.length) {
        // Konami unlocks secret mode directly
        state.secretUnlocked = true;
        state.mode = MODES.SECRET;
        setAccessLevel(ACCESS_LEVELS.SECRET);
        trackEvent('secret_unlock', { method: 'konami' });
        flashKonamiSuccess();
        setSignedCookies();
        showCashRain();
        // Dismiss password box if visible
        if (!elements.passwordContainer.classList.contains('hidden') &&
            !elements.passwordContainer.classList.contains('dismissed')) {
          elements.passwordContainer.classList.add('dismissed');
        }
        // Go to player after animation
        setTimeout(() => startPlayer(), 2500);
      }
    } else if (direction) {
      flashKonamiError();
      state.konamiProgress = 0;
    }
  }

  function handleBAInput(input) {
    if (!state.waitingForBA || state.secretUnlocked) return;

    if (input === 'KeyB' || input === 'down') {
      state.pressedB = true;
    } else if ((input === 'KeyA' || input === 'up') && state.pressedB) {
      // B+A on desktop, or down+up swipe on mobile
      if (input === 'KeyA') {
        unlockSecretDesktop();
      } else {
        unlockSecretMobile();
      }
    } else {
      state.pressedB = false;
    }
  }

  function unlockSecretDesktop() {
    state.secretUnlocked = true;
    state.waitingForBA = false;
    state.mode = MODES.SECRET;
    setAccessLevel(ACCESS_LEVELS.SECRET);
    setSignedCookies(); // Ensure cookies are set for manifest access
    showCashRain();
    // Go to player after animation
    setTimeout(() => startPlayer(), 2500);
  }

  function unlockSecretMobile() {
    state.secretUnlocked = true;
    state.waitingForBA = false;
    state.mode = MODES.SECRET;
    setAccessLevel(ACCESS_LEVELS.SECRET);
    setSignedCookies(); // Ensure cookies are set for manifest access
    showCashRain();
    // Go to player after animation
    setTimeout(() => startPlayer(), 2500);
  }

  // Touch swipe detection
  function handleTouchStart(e) {
    state.touchStartX = e.touches[0].clientX;
    state.touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    // Don't handle swipes when password input is focused
    if (document.activeElement === elements.passwordInput) return;

    const dx = e.changedTouches[0].clientX - state.touchStartX;
    const dy = e.changedTouches[0].clientY - state.touchStartY;

    let direction = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      direction = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > SWIPE_THRESHOLD) {
      direction = dy > 0 ? 'down' : 'up';
    }

    if (direction) {
      // After Konami, swipes go to B+A handler (down=B, up=A)
      if (state.waitingForBA) {
        handleBAInput(direction);
      } else {
        handleKonamiInput(direction);
      }
    }
  }

  // Storage functions
  function loadHeardTracks() {
    try {
      const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (stored) {
        state.heardTracks = new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load heard tracks:', e);
    }
  }

  function saveHeardTracks() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify([...state.heardTracks]));
    } catch (e) {
      console.warn('Failed to save heard tracks:', e);
    }
  }

  function markTrackHeard(trackId) {
    state.heardTracks.add(trackId);
    saveHeardTracks();
    updateCatalogProgress();
    if (isSecretMode()) {
      renderTrackList();
    }
  }

  // Manifest functions
  async function loadManifest() {
    try {
      // On localhost, try local manifest first (copy from production for dev)
      const response = await fetch('/manifest.json', {
        credentials: isLocalhost() ? 'omit' : 'include'
      });

      if (!response.ok) {
        if (response.status === 403) {
          // Redirect to auth page to get fresh cookies
          window.location.href = CONFIG.AUTH_URL;
          return;
        }
        throw new Error(`Failed to load manifest: ${response.status}`);
      }

      state.manifest = await response.json();
      state.tracks = state.manifest.tracks || [];
      state.filteredTracks = [...state.tracks];

      if (state.tracks.length === 0) {
        throw new Error('No tracks available.');
      }

      return true;
    } catch (e) {
      console.error('Manifest load error:', e);
      throw e;
    }
  }

  // Clickable metadata search (super/secret modes)
  function searchFor(query) {
    if (!query || !isSecretMode()) return;
    elements.trackSearch.value = query;
    filterTracks(query);
    elements.trackSearch.scrollIntoView({ behavior: 'smooth' });
  }

  function setupClickableMetadata() {
    if (!isSecretMode()) return;

    const clickables = [elements.artist, elements.album, elements.artworkImage];
    clickables.forEach(el => {
      if (el) el.classList.add('clickable');
    });

    elements.artist.onclick = () => searchFor(state.currentTrack?.artist);
    elements.album.onclick = () => searchFor(state.currentTrack?.album);
    if (elements.artworkImage) {
      elements.artworkImage.onclick = () => searchFor(state.currentTrack?.album);
    }
  }

  // Track selection
  function getNextTrack() {
    const unheard = state.tracks.filter(t => !state.heardTracks.has(t.id));

    if (unheard.length === 0) {
      state.heardTracks.clear();
      saveHeardTracks();
      return state.tracks[Math.floor(Math.random() * state.tracks.length)];
    }

    return unheard[Math.floor(Math.random() * unheard.length)];
  }

  // Track list (superuser mode)
  // Debounce search tracking to avoid spam
  let searchTrackTimeout = null;
  function filterTracks(query) {
    state.searchQuery = query.toLowerCase();
    if (!state.searchQuery) {
      state.filteredTracks = [...state.tracks];
    } else {
      state.filteredTracks = state.tracks.filter(t => {
        const searchStr = `${t.artist || ''} ${t.album || ''} ${t.title || ''} ${t.year || ''}`.toLowerCase();
        return searchStr.includes(state.searchQuery);
      });
      // Track search after 500ms of no typing
      clearTimeout(searchTrackTimeout);
      searchTrackTimeout = setTimeout(() => {
        trackEvent('search', {
          search_term: state.searchQuery,
          results_count: state.filteredTracks.length
        });
      }, 500);
    }
    renderTrackList();
  }

  function renderTrackList() {
    if (!elements.trackList) return;

    const html = state.filteredTracks.map(track => {
      const isPlaying = state.currentTrack && state.currentTrack.id === track.id;
      const playingClass = isPlaying ? 'playing' : '';
      const artist = track.artist || '???';
      const title = track.title || '???';
      const year = track.year || '';
      const artworkSrc = track.artwork ? getMediaUrl(track.artwork) : '';
      const thumbClass = artworkSrc ? '' : 'no-art';

      return `
        <div class="track-item ${playingClass}" data-id="${track.id}">
          <img class="track-item-thumb ${thumbClass}" src="${artworkSrc}" alt="" loading="lazy">
          <div class="track-item-info">
            <div class="track-item-main">
              <span class="track-item-artist">${escapeHtml(artist)}</span>
              <span class="track-item-title">- ${escapeHtml(title)}</span>
            </div>
            ${year ? `<span class="track-item-year">${escapeHtml(year)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    elements.trackList.innerHTML = html;

    // Bind play buttons
    elements.trackList.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.id;
        const track = state.tracks.find(t => t.id === trackId);
        if (track) {
          playTrack(track);
        }
      });
    });

    // Bind row clicks
    elements.trackList.querySelectorAll('.track-item').forEach(row => {
      row.addEventListener('click', () => {
        const trackId = row.dataset.id;
        const track = state.tracks.find(t => t.id === trackId);
        if (track) {
          playTrack(track);
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Player functions
  function updateTrackInfo(track) {
    elements.artist.textContent = track.artist || '???';
    elements.album.textContent = track.album || '???';
    elements.title.textContent = track.title || '???';
    elements.year.textContent = track.year || '???';

    // Setup clickable metadata for super/secret modes
    setupClickableMetadata();
  }

  function updateArtwork(track) {
    if (!elements.artworkContainer || !elements.artworkImage) return;

    if (track.artwork) {
      elements.artworkImage.src = getMediaUrl(track.artwork);
      elements.artworkImage.alt = `${track.artist || 'Unknown'} - ${track.album || 'Unknown'}`;
      elements.artworkContainer.classList.remove('no-art');
    } else {
      elements.artworkImage.src = '';
      elements.artworkImage.alt = '';
      elements.artworkContainer.classList.add('no-art');
    }
  }

  function updateCatalogProgress() {
    const total = state.tracks.length;
    const heard = state.heardTracks.size;
    const percent = total > 0 ? Math.round((heard / total) * 100) : 0;

    elements.heardCount.textContent = heard;
    elements.totalCount.textContent = total;
    elements.heardPercent.textContent = percent;
  }

  function updateProgress() {
    const current = elements.audio.currentTime;
    const duration = elements.audio.duration;

    if (duration && isFinite(duration)) {
      const percent = (current / duration) * 100;
      elements.progressBar.style.width = `${percent}%`;
      elements.currentTime.textContent = formatTime(current);
      elements.duration.textContent = formatTime(duration);
    }
  }

  async function playTrack(track, fromHistory = false) {
    state.currentTrack = track;
    updateTrackInfo(track);
    updateArtwork(track);
    setTrackInHash(track);

    // Add to history if not navigating from history
    if (!fromHistory) {
      // Truncate forward history if we're not at the end
      if (state.historyIndex < state.playHistory.length - 1) {
        state.playHistory = state.playHistory.slice(0, state.historyIndex + 1);
      }
      state.playHistory.push(track.id);
      state.historyIndex = state.playHistory.length - 1;
    }
    updateBackButton();

    const audioUrl = getMediaUrl(track.path);

    try {
      elements.audio.src = audioUrl;
      await elements.audio.play();
      state.isPlaying = true;
      elements.playPauseBtn.textContent = 'PAUSE';
      markTrackHeard(track.id);

      // Track song play
      trackEvent('song_play', {
        artist: track.artist,
        album: track.album,
        title: track.title,
        year: track.year,
        track_id: track.id
      });

      // Update download button visibility
      if (isSecretMode()) {
        elements.downloadBtn.classList.add('visible');
      }

      // Update track list highlighting
      if (isSecretMode()) {
        renderTrackList();
      }
    } catch (e) {
      console.error('Playback error:', e);
      playNextTrack();
    }
  }

  function updateBackButton() {
    if (elements.backBtn) {
      elements.backBtn.disabled = state.historyIndex <= 0;
    }
  }

  function playPreviousTrack() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      const trackId = state.playHistory[state.historyIndex];
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        playTrack(track, true);
      }
    }
  }

  function playNextTrack() {
    // If there's forward history, use it
    if (state.historyIndex < state.playHistory.length - 1) {
      state.historyIndex++;
      const trackId = state.playHistory[state.historyIndex];
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        playTrack(track, true);
        return;
      }
    }

    // Otherwise pick a new track
    const track = getNextTrack();
    if (track) {
      playTrack(track);
    } else {
      showError('No tracks available.');
    }
  }

  function downloadTrack(track) {
    trackEvent('download', {
      artist: track.artist,
      album: track.album,
      title: track.title,
      year: track.year,
      track_id: track.id
    });

    const audioUrl = getMediaUrl(track.path);
    const filename = `${track.artist || 'Unknown'} - ${track.title || 'Unknown'}.mp3`;

    // Fetch the file and trigger download
    fetch(audioUrl, { credentials: 'include' })
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(e => {
        console.error('Download error:', e);
        alert('Download failed. Make sure you have valid cookies.');
      });
  }

  function seekTo(percent) {
    const duration = elements.audio.duration;
    if (duration && isFinite(duration)) {
      elements.audio.currentTime = duration * percent;
    }
  }

  // Event handlers
  async function handleEnter() {
    // Localhost gets full permissions, no cookies
    if (isLocalhost()) {
      console.log('🔧 Localhost - secret mode');
      state.mode = MODES.SECRET;
      state.secretUnlocked = true;
      startPlayer();
      return;
    }

    // Check if we have valid cookies
    if (!hasValidCookies()) {
      showPasswordPrompt();
      return;
    }
    startPlayer();
  }

  async function startPlayer() {
    try {
      await loadManifest();
      loadHeardTracks();
      updateCatalogProgress();

      // Setup UI based on mode
      if (isSecretMode()) {
        elements.trackListContainer.classList.remove('hidden');
        renderTrackList();
      }

      if (isSecretMode()) {
        // Download button will show when a track is playing
      }

      showScreen('player-screen');

      // Check for deep-linked track
      if (state.pendingTrackPath) {
        const linkedTrack = state.tracks.find(t => t.path === state.pendingTrackPath);
        state.pendingTrackPath = null;
        if (linkedTrack) {
          playTrack(linkedTrack);
          return;
        }
      }

      playNextTrack();
    } catch (e) {
      showError(e.message || 'Failed to start player.');
    }
  }

  function handlePlayPause() {
    if (elements.audio.paused) {
      elements.audio.play();
      elements.playPauseBtn.textContent = 'PAUSE';
      trackEvent('resume');
    } else {
      elements.audio.pause();
      elements.playPauseBtn.textContent = 'PLAY';
      trackEvent('pause', {
        artist: state.currentTrack?.artist,
        title: state.currentTrack?.title,
        position_seconds: Math.floor(elements.audio.currentTime)
      });
    }
  }

  function handleNext() {
    // Track skip if song wasn't finished
    if (state.currentTrack && elements.audio.currentTime < elements.audio.duration - 5) {
      trackEvent('skip', {
        artist: state.currentTrack?.artist,
        title: state.currentTrack?.title,
        position_seconds: Math.floor(elements.audio.currentTime),
        duration_seconds: Math.floor(elements.audio.duration)
      });
    }
    playNextTrack();
  }

  function handleDownload() {
    if (state.currentTrack) {
      downloadTrack(state.currentTrack);
    }
  }

  function handleRetry() {
    showScreen('enter-screen');
    if (!hasValidCookies()) {
      showPasswordPrompt();
    }
  }

  function handleProgressClick(e) {
    const rect = elements.progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seekTo(Math.max(0, Math.min(1, percent)));
  }

  function handleTrackEnded() {
    // Track completed listen
    if (state.currentTrack) {
      trackEvent('song_complete', {
        artist: state.currentTrack.artist,
        title: state.currentTrack.title,
        duration_seconds: Math.floor(elements.audio.duration)
      });
    }
    playNextTrack();
  }

  function handleTimeUpdate() {
    updateProgress();
  }

  function handleSearch(e) {
    filterTracks(e.target.value);
  }

  function handleKeydown(e) {
    // Don't handle if typing in search or password
    if (document.activeElement === elements.trackSearch ||
        document.activeElement === elements.passwordInput) {
      return;
    }

    // Konami code detection (works on any screen if not yet unlocked)
    if (!state.secretUnlocked) {
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleKonamiInput('up');
        return;
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleKonamiInput('down');
        return;
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleKonamiInput('left');
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleKonamiInput('right');
        return;
      }
    }

    // B + A detection for secret mode (after Konami unlocked)
    if (state.waitingForBA && (e.code === 'KeyB' || e.code === 'KeyA')) {
      handleBAInput(e.code);
      return;
    }

    // Enter screen - don't process player controls
    if (elements.enterScreen.classList.contains('active')) {
      return;
    }

    // Space to pause/play
    if (e.code === 'Space' && state.currentTrack) {
      e.preventDefault();
      handlePlayPause();
    }

    // N for next
    if (e.code === 'KeyN' && state.currentTrack) {
      e.preventDefault();
      playNextTrack();
    }

    // D for download (secret mode only)
    if (e.code === 'KeyD' && state.currentTrack && isSecretMode()) {
      e.preventDefault();
      downloadTrack(state.currentTrack);
    }

    // Arrow keys for seeking (on player screen, when not entering Konami)
    if (elements.playerScreen.classList.contains('active') && state.currentTrack) {
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        elements.audio.currentTime = Math.min(
          elements.audio.duration,
          elements.audio.currentTime + 10
        );
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        elements.audio.currentTime = Math.max(0, elements.audio.currentTime - 10);
      }
    }

    // / for search (super modes)
    if (e.code === 'Slash' && isSecretMode()) {
      e.preventDefault();
      elements.trackSearch.focus();
    }

    // P to clear cookies and reset (for testing)
    if (e.code === 'KeyP' && e.shiftKey) {
      e.preventDefault();
      clearAllCookies();
      window.location.reload();
    }

  }

  function clearAllCookies() {
    // Clear CloudFront cookies
    CONFIG.COOKIE_NAMES.forEach(name => {
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; secure; samesite=strict`;
    });
    // Clear access level cookie
    document.cookie = `${CONFIG.ACCESS_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; secure; samesite=strict`;
    console.log('Cookies cleared');
  }

  // Localhost check - grants full permissions
  function isLocalhost() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  // Get media URL - on localhost, point to production for audio/artwork
  const PROD_URL = 'https://36247.rmzi.world';
  function getMediaUrl(path) {
    if (!path) return '';
    const url = '/' + path;
    return isLocalhost() ? PROD_URL + url : url;
  }

  // Initialize
  function init() {
    // Restore state from access cookie (production only)
    if (!isLocalhost()) {
      const accessLevel = getStoredAccessLevel();
      if (accessLevel >= ACCESS_LEVELS.SECRET) {
        state.mode = MODES.SECRET;
        state.secretUnlocked = true;
      } else {
        state.mode = MODES.REGULAR;
      }
      // Show welcome back for returning users
      if (accessLevel >= ACCESS_LEVELS.AUTHENTICATED && elements.welcomeBack) {
        elements.welcomeBack.classList.remove('hidden');
      }
      console.log('36247 initialized - access level:', accessLevel);
    } else {
      console.log('36247 initialized - localhost mode');
    }

    // Check for deep-linked track in URL
    state.pendingTrackPath = getTrackPathFromHash();

    // Bind event listeners
    elements.enterBtn.addEventListener('click', handleEnter);
    elements.enterBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleEnter();
    });
    if (elements.backBtn) {
      elements.backBtn.addEventListener('click', playPreviousTrack);
    }
    elements.playPauseBtn.addEventListener('click', handlePlayPause);
    elements.nextBtn.addEventListener('click', handleNext);
    elements.retryBtn.addEventListener('click', handleRetry);
    elements.progressContainer.addEventListener('click', handleProgressClick);
    elements.audio.addEventListener('ended', handleTrackEnded);
    elements.audio.addEventListener('timeupdate', handleTimeUpdate);
    document.addEventListener('keydown', handleKeydown);

    // Touch swipe listeners for Konami on mobile
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    if (elements.downloadBtn) {
      elements.downloadBtn.addEventListener('click', handleDownload);
    }

    if (elements.trackSearch) {
      elements.trackSearch.addEventListener('input', handleSearch);
    }

    // Volume slider
    if (elements.volumeSlider) {
      elements.volumeSlider.addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        elements.audio.volume = vol;
        if (elements.volumeValue) {
          elements.volumeValue.textContent = e.target.value;
        }
      });
    }

    // Info modal
    if (elements.infoTrigger) {
      elements.infoTrigger.addEventListener('click', () => {
        elements.infoModal.classList.remove('hidden');
      });
    }
    if (elements.modalClose) {
      elements.modalClose.addEventListener('click', () => {
        elements.infoModal.classList.add('hidden');
      });
    }
    if (elements.modalBackdrop) {
      elements.modalBackdrop.addEventListener('click', () => {
        elements.infoModal.classList.add('hidden');
      });
    }

    // Image carousel for Stout Junts artwork
    let carouselImages = [];
    let carouselIndex = 0;

    function updateCarousel() {
      if (!elements.imageModalImg) return;
      elements.imageModalImg.src = carouselImages[carouselIndex];

      // Update arrows
      const prevBtn = document.getElementById('image-modal-prev');
      const nextBtn = document.getElementById('image-modal-next');
      if (prevBtn) prevBtn.classList.toggle('hidden', carouselImages.length <= 1);
      if (nextBtn) nextBtn.classList.toggle('hidden', carouselImages.length <= 1);

      // Update dots
      const dotsContainer = document.getElementById('image-modal-dots');
      if (dotsContainer) {
        dotsContainer.innerHTML = carouselImages.length > 1
          ? carouselImages.map((_, i) =>
              `<span class="carousel-dot ${i === carouselIndex ? 'active' : ''}" data-index="${i}"></span>`
            ).join('')
          : '';
      }
    }

    document.querySelectorAll('.sj-thumb').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        e.preventDefault();
        if (elements.imageModal && elements.imageModalImg) {
          const imagesAttr = thumb.dataset.images || thumb.src;
          carouselImages = imagesAttr.split(',').map(s => s.trim());
          carouselIndex = 0;
          updateCarousel();
          elements.imageModal.classList.remove('hidden');
        }
      });
    });

    // Carousel navigation
    const prevBtn = document.getElementById('image-modal-prev');
    const nextBtn = document.getElementById('image-modal-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        carouselIndex = (carouselIndex - 1 + carouselImages.length) % carouselImages.length;
        updateCarousel();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        carouselIndex = (carouselIndex + 1) % carouselImages.length;
        updateCarousel();
      });
    }

    // Dot navigation
    document.getElementById('image-modal-dots')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('carousel-dot')) {
        carouselIndex = parseInt(e.target.dataset.index);
        updateCarousel();
      }
    });

    if (elements.imageModalClose) {
      elements.imageModalClose.addEventListener('click', () => {
        elements.imageModal.classList.add('hidden');
      });
    }

    if (elements.imageModal) {
      elements.imageModal.querySelector('.modal-backdrop').addEventListener('click', () => {
        elements.imageModal.classList.add('hidden');
      });
    }

    // Password input - submit on Enter key
    if (elements.passwordInput) {
      elements.passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePasswordSubmit();
        }
      });
    }

    // Set initial volume to 50%
    elements.audio.volume = 0.5;

    // Handle audio errors
    elements.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      if (state.currentTrack) {
        playNextTrack();
      }
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.screen) {
        showScreen(e.state.screen, false);
      } else {
        // Default to enter screen if no state
        showScreen('enter-screen', false);
      }
    });

    // Set initial history state
    if (history.replaceState) {
      history.replaceState({ screen: 'enter-screen' }, '', '');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

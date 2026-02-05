// 36247 Music Player
// F.A.T. Lab aesthetic streaming player with signed cookie authentication
// Modes unlocked via Konami code: regular -> super (Konami) -> secret (B+A or phone flip)

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    STORAGE_KEY: '36247_heard_tracks',
    COOKIE_NAMES: ['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id'],
    PASSWORD: 'ayemanesaymane'
  };

  // COOKIES_PLACEHOLDER - replaced by deploy-cookies.py
  const SIGNED_COOKIES = null;

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
        hidePasswordPrompt();
        startPlayer();
      } else {
        elements.passwordError.textContent = 'cookie error';
        elements.passwordError.classList.add('visible');
      }
    } else {
      elements.passwordError.textContent = 'wrong';
      elements.passwordError.classList.add('visible');
      elements.passwordInput.value = '';
      elements.passwordInput.focus();
    }
  }

  // Modes
  const MODES = {
    REGULAR: 'regular',
    SUPER: 'super',
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
    superUnlocked: false,
    secretUnlocked: false,
    waitingForBA: false,
    pressedB: false,
    // Touch tracking
    touchStartX: 0,
    touchStartY: 0
  };

  // DOM Elements
  const elements = {
    enterScreen: document.getElementById('enter-screen'),
    playerScreen: document.getElementById('player-screen'),
    errorScreen: document.getElementById('error-screen'),
    enterBtn: document.getElementById('enter-btn'),
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
    passwordError: document.getElementById('password-error')
  };

  // Utility functions
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    showScreen('error-screen');
  }

  // Mode helpers
  function isSuperMode() {
    return state.mode === MODES.SUPER || state.mode === MODES.SECRET;
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

  function showComboBreaker() {
    const overlay = document.createElement('div');
    overlay.className = 'combo-breaker';
    overlay.innerHTML = '<span>COMBO BREAKER</span>';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2000);
  }

  function handleKonamiInput(direction) {
    // Only process on enter screen
    if (!elements.enterScreen.classList.contains('active')) return;
    if (state.superUnlocked) return;

    if (KONAMI_SEQUENCE[state.konamiProgress] === direction) {
      state.konamiProgress++;
      updateKonamiDots();

      if (state.konamiProgress === KONAMI_SEQUENCE.length) {
        state.superUnlocked = true;
        state.waitingForBA = true;
        state.mode = MODES.SUPER;
        flashKonamiSuccess();
        showSecretHint();
        initOrientationListener();
      }
    } else if (direction) {
      flashKonamiError();
      state.konamiProgress = 0;
    }
  }

  function handleBAInput(code) {
    if (!state.waitingForBA || state.secretUnlocked) return;

    if (code === 'KeyB') {
      state.pressedB = true;
    } else if (code === 'KeyA' && state.pressedB) {
      unlockSecret();
    } else {
      state.pressedB = false;
    }
  }

  function handleOrientation(e) {
    if (!state.waitingForBA || state.secretUnlocked) return;

    // Check if phone is upside down (gamma near 180/-180 or beta near 180/-180)
    const isUpsideDown = Math.abs(e.gamma) > 150 || Math.abs(e.beta) > 150;

    if (isUpsideDown) {
      unlockSecret();
    }
  }

  function unlockSecret() {
    state.secretUnlocked = true;
    state.waitingForBA = false;
    state.mode = MODES.SECRET;
    showComboBreaker();
  }

  function initOrientationListener() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+ requires permission - we'll request on first touch
      document.addEventListener('touchend', function requestOrientation() {
        DeviceOrientationEvent.requestPermission().then(permission => {
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        }).catch(() => {});
        document.removeEventListener('touchend', requestOrientation);
      }, { once: true });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', handleOrientation);
    }
  }

  // Touch swipe detection
  function handleTouchStart(e) {
    state.touchStartX = e.touches[0].clientX;
    state.touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - state.touchStartX;
    const dy = e.changedTouches[0].clientY - state.touchStartY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      handleKonamiInput(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > SWIPE_THRESHOLD) {
      handleKonamiInput(dy > 0 ? 'down' : 'up');
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
    if (isSuperMode()) {
      renderTrackList();
    }
  }

  // Manifest functions
  async function loadManifest() {
    try {
      const response = await fetch('/manifest.json', {
        credentials: 'include'
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
  function filterTracks(query) {
    state.searchQuery = query.toLowerCase();
    if (!state.searchQuery) {
      state.filteredTracks = [...state.tracks];
    } else {
      state.filteredTracks = state.tracks.filter(t => {
        const searchStr = `${t.artist || ''} ${t.album || ''} ${t.title || ''}`.toLowerCase();
        return searchStr.includes(state.searchQuery);
      });
    }
    renderTrackList();
  }

  function renderTrackList() {
    if (!elements.trackList) return;

    const html = state.filteredTracks.map(track => {
      const isPlaying = state.currentTrack && state.currentTrack.id === track.id;
      const isHeard = state.heardTracks.has(track.id);

      const playingClass = isPlaying ? 'playing' : '';
      const artist = track.artist || '???';
      const title = track.title || '???';

      let actionsHtml = `<button class="track-item-btn play-btn" data-id="${track.id}">PLAY</button>`;

      if (isSecretMode()) {
        actionsHtml += `<button class="track-item-btn download" data-id="${track.id}" data-path="${track.path}">DL</button>`;
      }

      return `
        <div class="track-item ${playingClass}" data-id="${track.id}">
          <div class="track-item-info">
            <span class="track-item-artist">${escapeHtml(artist)}</span>
            <span class="track-item-title">- ${escapeHtml(title)}</span>
          </div>
          <div class="track-item-actions">
            ${actionsHtml}
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

    // Bind download buttons
    elements.trackList.querySelectorAll('.download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.id;
        const track = state.tracks.find(t => t.id === trackId);
        if (track) {
          downloadTrack(track);
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
  }

  function updateArtwork(track) {
    if (!elements.artworkContainer || !elements.artworkImage) return;

    if (track.artwork) {
      elements.artworkImage.src = '/' + track.artwork;
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

  async function playTrack(track) {
    state.currentTrack = track;
    updateTrackInfo(track);
    updateArtwork(track);

    const audioUrl = '/' + track.path;

    try {
      elements.audio.src = audioUrl;
      await elements.audio.play();
      state.isPlaying = true;
      elements.playPauseBtn.textContent = 'PAUSE';
      markTrackHeard(track.id);

      // Update download button visibility
      if (isSecretMode()) {
        elements.downloadBtn.classList.add('visible');
      }

      // Update track list highlighting
      if (isSuperMode()) {
        renderTrackList();
      }
    } catch (e) {
      console.error('Playback error:', e);
      playNextTrack();
    }
  }

  function playNextTrack() {
    const track = getNextTrack();
    if (track) {
      playTrack(track);
    } else {
      showError('No tracks available.');
    }
  }

  function downloadTrack(track) {
    const audioUrl = '/' + track.path;
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
    // Check if we have valid cookies
    if (!hasValidCookies()) {
      // No cookies - show password prompt
      showPasswordPrompt();
      return;
    }
    // Have cookies - start player
    startPlayer();
  }

  async function startPlayer() {
    try {
      await loadManifest();
      loadHeardTracks();
      updateCatalogProgress();

      // Setup UI based on mode
      if (isSuperMode()) {
        elements.trackListContainer.classList.remove('hidden');
        renderTrackList();
      }

      if (isSecretMode()) {
        // Download button will show when a track is playing
      }

      showScreen('player-screen');
      playNextTrack();
    } catch (e) {
      showError(e.message || 'Failed to start player.');
    }
  }

  function handlePlayPause() {
    if (elements.audio.paused) {
      elements.audio.play();
      elements.playPauseBtn.textContent = 'PAUSE';
    } else {
      elements.audio.pause();
      elements.playPauseBtn.textContent = 'PLAY';
    }
  }

  function handleNext() {
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
    playNextTrack();
  }

  function handleTimeUpdate() {
    updateProgress();
  }

  function handleSearch(e) {
    filterTracks(e.target.value);
  }

  function handleKeydown(e) {
    // Don't handle if typing in search
    if (document.activeElement === elements.trackSearch) {
      return;
    }

    // Konami code detection on enter screen
    if (elements.enterScreen.classList.contains('active')) {
      // Arrow keys for Konami
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
      // B + A detection for secret mode
      if (e.code === 'KeyB' || e.code === 'KeyA') {
        handleBAInput(e.code);
        return;
      }
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

    // Arrow keys for seeking
    if (e.code === 'ArrowRight' && state.currentTrack) {
      e.preventDefault();
      elements.audio.currentTime = Math.min(
        elements.audio.duration,
        elements.audio.currentTime + 10
      );
    }

    if (e.code === 'ArrowLeft' && state.currentTrack) {
      e.preventDefault();
      elements.audio.currentTime = Math.max(0, elements.audio.currentTime - 10);
    }

    // / for search (super modes)
    if (e.code === 'Slash' && isSuperMode()) {
      e.preventDefault();
      elements.trackSearch.focus();
    }
  }

  // Initialize
  function init() {
    // Start in regular mode (unlock via Konami code)
    state.mode = MODES.REGULAR;
    console.log('36247 initialized - enter Konami code to unlock');

    // Bind event listeners
    elements.enterBtn.addEventListener('click', handleEnter);
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

    // Password input - submit on Enter key
    if (elements.passwordInput) {
      elements.passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePasswordSubmit();
        }
      });
    }

    // Handle audio errors
    elements.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      if (state.currentTrack) {
        playNextTrack();
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

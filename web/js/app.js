// ─── App module (init, orchestration) ───

/* global DATA, activeTab, currentUser, planningSelections, trackingDate, viewMode */

async function _restoreSession() {
  let savedUser = null;
  try { savedUser = localStorage.getItem(USER_KEY); } catch(e) { console.error('[NutriFood] localStorage read error:', e); }
  if (!savedUser) { return; }
  currentUser = JSON.parse(savedUser);
  let token = getToken();
  if (!token) { clearAuth(); return; }
  try {
    let meRes = await fetchWithTimeout(API + '/me', { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (meRes.ok) {
      renderUserArea();
      await loadSelectionsFromServer();
      planningSelections = structuredClone(selections);
    } else {
      console.warn('[NutriFood] Token invalid, clearing');
      clearAuth();
    }
  } catch(e) { console.error('[NutriFood] Session check failed:', e); clearAuth(); }
}

function _applyModeAndRender() {
  if (!currentUser) { return; }
  if (currentMode === 'tracking') {
    document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'tracking'); });
    $('tracking-bar').style.display = 'flex';
    trackingDate = getTodayISO();
  } else {
    document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'planning'); });
  }
  document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === viewMode);
  });
}

function _wireViewToggle() {
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      let prevView = viewMode;
      viewMode = btn.dataset.view;
      try { localStorage.setItem('nf-view-mode', viewMode); } catch(e) { console.error('[NutriFood] localStorage error:', e); }
      document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.view === viewMode);
      });
      // In tracking mode, reload appropriate data when switching views
      if (currentMode === 'tracking' && prevView !== viewMode && currentUser) {
        loadScript('js/tracking.js', function() {
          if (viewMode === 'simple') {
            loadTrackingWeek();
          } else {
            loadTrackingDay(trackingDate || getTodayISO());
          }
        });
      } else {
        render();
      }
    });
  });
}

async function _loadPostLoginContent() {
  if (!currentUser) {
    if (window._shareToken) {
      $('search-bar-container').style.display = 'none';
      loadScript('js/share.js', function() { loadSharedView(window._shareToken); });
    } else {
      renderWelcome();
    }
    return;
  }
  $('search-bar-container').style.display = 'block';
  let modeTabs = $('mode-tabs');
  if (modeTabs) { modeTabs.style.display = 'flex'; }
  if (currentMode === 'tracking') {
    loadScript('js/tracking.js', function() {
      if (typeof viewMode !== 'undefined' && viewMode === 'simple') {
        loadTrackingWeek();
      } else {
        loadTrackingDay(trackingDate);
      }
    });
  } else {
    render();
    updateSaveBar();
  }
  loadScript('js/deals.js', function() { loadDeals().then(function() { render(); }); });
  await loadUserGoals();
  loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); });
}

async function init() {
  try {
    let res = await fetchWithTimeout(API + '/foods', {}, 8000);
    DATA = await res.json();
    activeTab = DATA.sections[0].id;
    initAuthEvents();
    await _restoreSession();
    renderUserArea();
    _applyModeAndRender();
    _wireViewToggle();
    await _loadPostLoginContent();
  } catch (e) {
    console.error('[NutriFood] Init error:', e);
    $('app').innerHTML = '<div class="api-error"><h2>⚠️ Serveur indisponible</h2><p>Impossible de se connecter au serveur. Réessayez dans un moment.</p><button id="retry-init">Réessayer</button></div>';
    $('save-bar').classList.remove('visible');
    let retryBtn = $('retry-init');
    if (retryBtn) {
      retryBtn.addEventListener('click', function() {
        $('app').innerHTML = '<p class="loading">Chargement…</p>';
        init();
      });
    }
  }
}

// Check for magic link or share link in URL before init
if (window.location.hash) {
  if (window.location.hash.includes('reset=')) {
    document.addEventListener('DOMContentLoaded', function() {
      $('reset-modal').classList.remove('hidden');
      $('reset-password').focus();
    });
  } else if (window.location.hash.includes('share=')) {
    let shareMatch = /share=([^&]+)/.exec(window.location.hash);
    if (shareMatch) {
      let shareToken = decodeURIComponent(shareMatch[1]);
      // Override init to load shared view
      window._shareToken = shareToken;
    }
  }
}

init();

// ─── Service Worker registration (PWA) ───
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/nutri-food/sw.js').then(function(reg) {
      console.log('[NutriFood] SW registered:', reg.scope);
    }).catch(function(err) {
      console.warn('[NutriFood] SW registration failed:', err);
    });
  });
}

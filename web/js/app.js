// ─── App module (init, orchestration) ───

/* global DATA, activeTab, currentUser, planningSelections, trackingDate */
async function init() {
  try {
    let res = await fetchWithTimeout(API + '/foods', {}, 8000);
    DATA = await res.json();
    activeTab = DATA.sections[0].id;

    // Wire up events
    initAuthEvents();

    // Restore session
    let savedUser = null;
    try { savedUser = localStorage.getItem(USER_KEY); } catch(e) { /* localStorage may be unavailable in private browsing */ console.error('[NutriFood] localStorage read error:', e); }
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      let token = getToken();
      if (token) {
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
      } else { clearAuth(); }
    }

    renderUserArea();

    // Apply saved mode (tracking by default)
    if (currentMode === 'tracking') {
      document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'tracking'); });
      $('tracking-bar').style.display = 'flex';
      trackingDate = getTodayISO();
    } else {
      document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'planning'); });
    }

    // Apply saved view mode (advanced/simple)
    document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.view === viewMode);
    });
    document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        viewMode = btn.dataset.view;
        try { localStorage.setItem('nf-view-mode', viewMode); } catch(e) { console.error('[NutriFood] localStorage error:', e); }
        document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.view === viewMode);
        });
        render();
      });
    });

    if (currentUser) {
      // Show search bar + app
      $('search-bar-container').style.display = 'block';
      if (currentMode === 'tracking') {
        loadScript('js/tracking.js', function() {
          loadTrackingDay(trackingDate);
        });
      } else {
        render();
        updateSaveBar();
      }
      // Load deals (single call — loadScript handles dedup + callback queueing)
      loadScript('js/deals.js', function() {
        loadDeals().then(function() { render(); });
      });
      // Feature 3: load goals
      await loadUserGoals();
      // Feature 1: check suggestions badge
      loadScript('js/suggestions.js', function() {
        checkSuggestionsBadge();
      });
    } else if (window._shareToken) {
      $('search-bar-container').style.display = 'none';
      loadScript('js/share.js', function() {
        loadSharedView(window._shareToken);
      });
    } else {
      // Not logged in: show welcome screen
      renderWelcome();
    }
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

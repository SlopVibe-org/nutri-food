// ─── Auth module ───

/* global authMode, searchActiveIndex */
let globalClickListenersAttached = false;
function renderUserArea() {
  const area = $('user-area');
  if (!area) { return; }
  if (currentUser) {
    let initials = currentUser.name.charAt(0).toUpperCase();
    let menuItems = '';
    menuItems += '<button class="user-menu-item" id="menu-grocery"><span class="icon">🛒</span> Liste d\'épicerie</button>';
    menuItems += '<button class="user-menu-item" id="menu-goals"><span class="icon">🎯</span> Mes objectifs</button>';
    menuItems += '<button class="user-menu-item" id="menu-history"><span class="icon">📊</span> Historique</button>';
    if (currentUser.is_admin) { menuItems += '<button class="user-menu-item" id="menu-manage-products"><span class="icon">📦</span> Gérer les produits</button>'; }
    menuItems += '<button class="user-menu-item" id="menu-deals"><span class="icon">🏷️</span> Spéciaux</button>';
    menuItems += '<div class="user-menu-divider"></div>';
    menuItems += '<button class="user-menu-item" id="menu-password"><span class="icon">🔑</span> Mot de passe</button>';
    menuItems += '<button class="user-menu-item" id="menu-logout" style="color:var(--accent-red);"><span class="icon">🚪</span> Déconnexion</button>';

    area.innerHTML = '<div class="user-menu">' +
      '<button class="user-menu-btn" id="user-menu-toggle"><span class="avatar">' + initials + '</span> <span class="uname">' + currentUser.name + '</span> ▾</button>' +
      '<div class="user-menu-dropdown" id="user-menu-dropdown">' + menuItems + '</div>' +
    '</div>';

    $('user-menu-toggle').addEventListener('click', function(e) {
      e.stopPropagation();
      $('user-menu-dropdown').classList.toggle('visible');
    });
    $('menu-grocery').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); loadScript('js/grocery.js', function() { showGroceryList(); }); });
    $('menu-goals').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); showGoals(); });
    $('menu-history').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); loadScript('js/history.js', function() { showHistory(); }); });
    $('menu-password').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); showChangePassword(); });
    $('menu-logout').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); clearAuth(); });
    if (currentUser.is_admin) {
      $('menu-manage-products').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); loadScript('js/cnf.js', function() { showManageProducts(); }); });
      $('menu-deals').addEventListener('click', function() { $('user-menu-dropdown').classList.remove('visible'); loadScript('js/deals.js', function() { showDealsPage(); }); });
    }

    if (!globalClickListenersAttached) {
      globalClickListenersAttached = true;
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.user-menu')) {
          let dd = $('user-menu-dropdown');
          if (dd) { dd.classList.remove('visible'); }
        }
      });
    }
  } else {
    area.innerHTML = '<button class="auth-btn" id="login-btn">Connexion</button>';
    $('login-btn').addEventListener('click', function() { showAuth('login'); });
  }
}

// ─── Auth modal ───
function showAuth(mode) {
  authMode = mode;
  $('auth-error').textContent = '';
  $('auth-modal').classList.remove('hidden');
  $('name-field').style.display = mode === 'register' ? 'block' : 'none';
  $('auth-title').textContent = mode === 'register' ? 'Créer un compte' : 'Connexion';
  $('auth-submit').textContent = mode === 'register' ? "S'inscrire" : 'Connexion';
  $('auth-switch-text').textContent = mode === 'register' ? 'Déjà inscrit? ' : 'Pas de compte? ';
  $('auth-switch-link').textContent = mode === 'register' ? 'Connexion' : "S'inscrire";
  $('auth-email').focus();
}

function toggleAuthMode() { showAuth(authMode === 'login' ? 'register' : 'login'); }

async function submitAuth() {
  let email = $('auth-email').value.trim();
  let password = $('auth-password').value;
  let name = $('auth-name').value.trim();
  let errEl = $('auth-error');
  let submitBtn = $('auth-submit');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Identifiant et mot de passe requis'; return; }
  if (authMode === 'register' && !name) { errEl.textContent = 'Nom requis'; return; }

  let endpoint = authMode === 'register' ? '/register' : '/login';
  let body = authMode === 'register' ? { email: email.toLowerCase(), name: name, password: password } : { email: email.toLowerCase(), password: password };

  submitBtn.disabled = true;
  submitBtn.textContent = authMode === 'register' ? 'Inscription…' : 'Connexion…';

  try {
    let res = await fetchWithTimeout(API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 10000);
    let data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Erreur'; submitBtn.disabled = false; submitBtn.textContent = authMode === 'register' ? "S'inscrire" : 'Connexion'; return; }

    // Success - smooth transition without page reload
    setAuth(data.token, data.user);
    $('auth-modal').classList.add('hidden');
    $('search-bar-container').style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = authMode === 'register' ? "S'inscrire" : 'Connexion';
    // Load selections and render
    await loadSelectionsFromServer();
    planningSelections = structuredClone(selections);
    await loadUserGoals();
    if (currentMode === 'tracking') {
      // In tracking mode, load tracking data (not planning selections)
      loadScript('js/tracking.js', function() {
        loadScript('js/deals.js', function() { loadDeals(); });
        if (typeof viewMode !== 'undefined' && viewMode === 'simple') {
          loadTrackingWeek();
        } else {
          loadTrackingDay(trackingDate || getTodayISO());
        }
      });
    } else {
      loadScript('js/deals.js', function() { loadDeals(); render(); });
    }
    updateSaveBar();
    // Seasonal now in suggestions panel
    loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); });
    showToast(authMode === 'register' ? 'Compte créé!' : 'Connexion réussie', 'success');
  } catch(e) {
    console.error('[NutriFood] Auth error:', e);
    errEl.textContent = 'Erreur de connexion au serveur: ' + e.message;
    submitBtn.disabled = false;
    submitBtn.textContent = authMode === 'register' ? "S'inscrire" : 'Connexion';
  }
}

// ─── Forgot password ───
function showForgotPassword() {
  let email = $('auth-email').value.trim();
  $('auth-modal').classList.add('hidden');
  $('app').innerHTML = '<div class="welcome"><h2>🔑 Mot de passe oublié</h2><p style="color:var(--text-dim);margin-bottom:20px;">Entrez votre email ou nom d usager. Vous recevrez un lien par courriel.</p><div style="max-width:340px;margin:0 auto;"><input type="text" id="forgot-email" placeholder="Email ou nom d usager" value="' + esc(email || '') + '" style="width:100%;padding:12px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:1rem;margin-bottom:12px;" aria-label="Email ou nom d usager"><button class="login-cta" id="forgot-submit">Envoyer le lien</button></div><div style="text-align:center;margin-top:12px;"><a style="color:var(--text-dim);font-size:0.85rem;cursor:pointer;" id="forgot-back">← Retour</a></div></div>';
  $('forgot-submit').addEventListener('click', submitForgotPassword);
  $('forgot-back').addEventListener('click', function() { window.location.reload(); });
  $('forgot-email').focus();
}

async function submitForgotPassword() {
  let identifier = $('forgot-email').value.trim();
  if (!identifier) { return; }
  $('forgot-submit').textContent = 'Envoi…';
  $('forgot-submit').disabled = true;
  try {
    await fetch(API + '/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier })
    });
    // Always show success (prevent enumeration)
    $('app').innerHTML = '<div class="welcome"><h2>📧 Courriel envoyé</h2><p style="color:var(--text-dim);margin-bottom:20px;">Si ce compte existe, vous recevrez un lien de réinitialisation par courriel. Vérifiez votre boîte de réception.</p><button class="login-cta" id="forgot-done" onclick="location.reload()">Retour à NutriFood</button></div>';
  } catch(e) {
    console.error('[NutriFood] Forgot password error:', e);
    $('forgot-submit').textContent = 'Erreur';
  }
}

// ─── Reset via magic link ───
async function submitResetPassword() {
  let newPw = $('reset-password').value;
  let confirmPw = $('reset-confirm').value;
  let errEl = $('reset-error');
  errEl.textContent = '';
  if (!newPw || !confirmPw) { errEl.textContent = 'Tous les champs sont requis'; return; }
  if (newPw !== confirmPw) { errEl.textContent = 'Les mots de passe ne correspondent pas'; return; }
  if (newPw.length < 6) { errEl.textContent = 'Minimum 6 caractères'; return; }

  let hash = window.location.hash;
  let resetToken = '';
  let match = /reset=([^&]+)/.exec(hash);
  if (match) { resetToken = decodeURIComponent(match[1]); }
  if (!resetToken) { errEl.textContent = 'Token manquant'; return; }

  $('reset-submit').textContent = 'Changement…';
  $('reset-submit').disabled = true;
  try {
    let res = await fetchWithTimeout(API + '/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: newPw })
    }, 10000);
    let data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Erreur'; $('reset-submit').textContent = 'Changer le mot de passe'; $('reset-submit').disabled = false; return; }
    // Success: log in and redirect
    setAuth(data.token, data.user);
    window.location.hash = '';
    window.location.reload();
  } catch(e) {
    console.error("[NutriFood] Auth error:", e);
    errEl.textContent = 'Erreur de connexion'; $('reset-submit').textContent = 'Changer le mot de passe'; $('reset-submit').disabled = false;
  }
}

// ─── Change password (logged in) ───
function showChangePassword() {
  $('pw-error').textContent = '';
  $('pw-current').value = '';
  $('pw-new').value = '';
  $('pw-confirm').value = '';
  $('pw-modal').classList.remove('hidden');
  $('pw-current').focus();
}

async function submitChangePassword() {
  let current = $('pw-current').value;
  let newPw = $('pw-new').value;
  let confirmPw = $('pw-confirm').value;
  let errEl = $('pw-error');
  errEl.textContent = '';
  if (!current || !newPw || !confirmPw) { errEl.textContent = 'Tous les champs sont requis'; return; }
  if (newPw !== confirmPw) { errEl.textContent = 'Les nouveaux mots de passe ne correspondent pas'; return; }
  if (newPw.length < 6) { errEl.textContent = 'Minimum 6 caractères'; return; }
  if (newPw === current) { errEl.textContent = 'Le nouveau mot de passe doit être différent'; return; }

  $('pw-submit').textContent = 'Changement…';
  $('pw-submit').disabled = true;
  let token = getToken();
  try {
    let res = await fetchWithTimeout(API + '/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ current_password: current, new_password: newPw })
    }, 10000);
    let data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Erreur'; $('pw-submit').textContent = 'Changer'; $('pw-submit').disabled = false; return; }
    // Success
    $('pw-modal').classList.add('hidden');
    showToast('Mot de passe changé', 'success');
    $('save-bar').classList.add('visible');
    $('save-info').textContent = 'Mot de passe changé ✓';
  } catch(e) {
    console.error("[NutriFood] Auth error:", e);
    errEl.textContent = 'Erreur de connexion'; $('pw-submit').textContent = 'Changer'; $('pw-submit').disabled = false;
  }
}

// Wire up auth modal events (no inline onclick)
function initAuthEvents() {
  // Mode tabs (Planification / Suivi)
  document.querySelectorAll('.mode-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { loadScript('js/tracking.js', function() { switchMode(tab.dataset.mode); }); });
  });
  // Tracking day navigation
  $('tracking-prev').addEventListener('click', function() {
    loadScript('js/tracking.js', function() {
      let d = new Date(trackingDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      loadTrackingDay(d.toISOString().slice(0,10));
    });
  });
  $('tracking-next').addEventListener('click', function() {
    loadScript('js/tracking.js', function() {
      let d = new Date(trackingDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      loadTrackingDay(d.toISOString().slice(0,10));
    });
  });
  // Feature 1: Suggestions FAB & modal
  $('suggestions-fab').addEventListener('click', function() { loadScript('js/suggestions.js', function() { showSuggestions(); }); });
  $('suggestions-close').addEventListener('click', function() { $('suggestions-modal').classList.add('hidden'); });
  $('suggestions-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });
  $('manage-products-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });
  // Feature 3: Goals modal
  $('goals-submit').addEventListener('click', function(e) { e.preventDefault(); submitGoals(); });
  $('goals-cancel').addEventListener('click', function() { $('goals-modal').classList.add('hidden'); });
  $('goals-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });
  // Feature 4: History modal
  $('history-close').addEventListener('click', function() { $('history-modal').classList.add('hidden'); });
  $('history-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });
  // Deals modal
  $('deals-close').addEventListener('click', function() { $('deals-modal').classList.add('hidden'); });
  $('deals-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });

  $('auth-submit').addEventListener('click', function(e) { e.preventDefault(); submitAuth(); });
  $('auth-switch-link').addEventListener('click', function(e) { e.preventDefault(); toggleAuthMode(); });
  $('auth-password').addEventListener('keypress', function(e) { if (e.key === 'Enter') { e.preventDefault(); submitAuth(); } });
  $('auth-email').addEventListener('keypress', function(e) { if (e.key === 'Enter') { e.preventDefault(); submitAuth(); } });
  // Close modal on overlay click
  $('auth-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });
  // Forgot password
  $('forgot-password-link').addEventListener('click', function(e) { e.preventDefault(); showForgotPassword(); });
  // Change password modal
  $('pw-submit').addEventListener('click', function(e) { e.preventDefault(); submitChangePassword(); });
  $('pw-cancel').addEventListener('click', function(e) { e.preventDefault(); $('pw-modal').classList.add('hidden'); });
  // Reset password modal (magic link)
  $('reset-submit').addEventListener('click', function(e) { e.preventDefault(); submitResetPassword(); });
  // Search
  $('search-input').addEventListener('input', performSearch);
  $('search-input').addEventListener('keydown', handleSearchKeydown);
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-bar')) { 
      $('search-results').classList.remove('visible'); searchActiveIndex = -1; 
    }
  });
  // Grocery list
  document.addEventListener('click', function(e) {
    if (e.target.id === 'grocery-close-btn' || e.target.id === 'grocery-overlay') {
      $('grocery-overlay').classList.add('hidden');
    }
    if (e.target.id === 'grocery-copy-btn') { copyGroceryList(); }
  });
}

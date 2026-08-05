// ─── Render module ───

/* global activeTab, autoSaveTimer, savedSnapshot, selections */
function render() {
  if (typeof viewMode !== 'undefined' && viewMode === 'simple') { renderSimple(); return; }
  // Restore tracking bar if in tracking mode (was hidden in simple view)
  if (currentMode === 'tracking') { let tbar = $('tracking-bar'); if (tbar) { tbar.style.display = 'flex'; } }
  let app = $('app');

  let totals = computeNutritionTotals(selections);
  let html = '';
  html += '<div class="nutri-summary">';
  if (currentMode === 'tracking') {
    html += '<div id="tracking-nutrition"><p class="loading">Chargement nutrition…</p></div>';
  } else {
    html += renderDailyNutrition(totals);
  }
  html += '</div>';

  html += '<div class="tabs">';
  DATA.sections.forEach(function(sec) {
    html += '<button class="tab ' + (sec.id === activeTab ? 'active' : '') + '" data-tab="' + sec.id + '"><span class="tab-dot ' + getSectionDotClass(sec.id) + '"></span>' + sec.icon + ' ' + sec.name + '</button>';
  });
  html += '</div>';
  DATA.sections.forEach(function(sec) {
    let cats = DATA.categories.filter(function(c) { return c.section === sec.id; });
    html += '<div class="tab-content ' + (sec.id === activeTab ? 'active' : '') + '" id="tab-' + sec.id + '"><div class="grid">';
    cats.forEach(function(cat) {
      let sorted = cat.foods.slice().sort(function(a, b) { return b.density - a.density; });
      html += renderCard({ ...cat, foods: sorted });
    });
    html += '</div></div>';
  });
  app.innerHTML = html;

  // Wire up tabs
  app.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() { activeTab = tab.dataset.tab; render(); });
  });
  // Wire up selects and checkboxes
  app.querySelectorAll('select[id^="sel-"]').forEach(function(sel) {
    sel.addEventListener('change', function() { addFromSelect(sel.dataset.cat || sel.id.replace('sel-', ''), sel); });
  });
  // In tracking mode, fetch and render dual nutrition dashboard
  if (currentMode === 'tracking' && currentUser) {
    renderTrackingNutrition();
  }
}

function getSectionDotClass(sectionId) {
  let cats = DATA.categories.filter(function(c) { return c.section === sectionId; });
  let totalSelected = 0, totalMin = 0, totalMax = 0;
  cats.forEach(function(cat) {
    let sel = selections[cat.id] || [];
    totalSelected += sel.reduce(function(s, i) { return s + i.qty; }, 0);
    totalMin += cat.weekly_min; totalMax += cat.weekly_max;
  });
  if (totalSelected === 0 || totalSelected < totalMin) { return 'under'; }
  if (totalSelected > totalMax) { return 'over'; }
  return 'in-range';
}

function getPortionHint(cat) {
  let section = cat.section || '';
  let catId = cat.id || '';
  let hints = {
    'viandes-laitiers': '1 portion = paume de la main (~100g)',
    'legumes': '1 portion = 1 tasse crue ou ½ tasse cuite',
    'fruits': '1 portion = 1 fruit moyen ou ½ tasse',
    'feculents': '1 portion = ½ tasse cuite ou 1 tranche',
    'habitudes': 'Consommer avec modération'
  };
  // Also check by category id for more specific hints
  let idHints = {
    'noix-graines': '1 portion = 1 petite poignée (~30g)',
    'lait': '1 portion = 1 tasse (250ml)',
    'oeufs': '1 portion = 1-2 œufs'
  };
  if (idHints[catId]) { return idHints[catId]; }
  if (hints[section]) { return hints[section]; }
  return null;
}

function getSeasonPrefix(food) {
  let month = new Date().getMonth() + 1;
  if (food.season?.length > 0 && food.season.length < 12) {
    if (food.season.includes(month)) return '🌱 ';
    if (food.import_season?.includes(month)) return '✈️ ';
  } else if (food.import_season?.length > 0 && food.import_season.length < 12) {
    if (food.import_season.includes(month)) return '✈️ ';
  }
  return '';
}

function renderCard(cat) {
  let selected = selections[cat.id] || [];
  let totalCount = selected.reduce(function(s, i) { return s + i.qty; }, 0);
  let suffix = cat.daily ? 'jour.' : 'sem.';
  let min = cat.weekly_min, max = cat.weekly_max;
  let target = min === max ? '' + min : min + '-' + max;
  let cls = '';
  if (totalCount < min) { cls = 'under'; }
  else if (totalCount > max) { cls = 'over'; }
  else cls = 'in-range';

  let html = '<div class="card" data-cat="' + cat.id + '">';
  html += '<div class="card-header">';
  html += '<span class="cat-label"><span class="icon">' + cat.icon + '</span>' + cat.name + '</span>';
  html += '<span class="counter-badge ' + (totalCount > 0 ? cls : '') + '">' + totalCount + ' / ' + target + ' ' + suffix + '</span>';
  html += '</div>';

  let portionHint = getPortionHint(cat);
  if (portionHint) {
    html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:8px;font-style:italic;">📏 ' + esc(portionHint) + '</div>';
  }

  if (cat.type === 'checkbox') {
    cat.foods.forEach(function(f) {
        let isChecked = selected.some(function(s) { return s.name === f.name; });
        let dealBadgesHtml = buildDealBadges(f.name);
        html += '<label class="checkbox-add"><input type="checkbox" data-cat="' + cat.id + '" data-name="' + esc(f.name) + '" data-density="' + f.density + '" data-nutrients="' + esc(f.nutrients) + '" ' + (isChecked ? 'checked' : '') + '><span>+ ' + f.name + ' (' + f.density + '%)</span>' + dealBadgesHtml + '</label>';
    });
  } else {
    html += '<select data-cat="' + cat.id + '"><option value="">+ Ajouter…</option>';
      cat.foods.forEach(function(f) {
        let seasonPrefix = getSeasonPrefix(f);
        let dealPrefix = DEALS[f.name]?.length > 0 ? '🏷️ ' : '';
        html += '<option value="' + esc(f.name) + '" data-density="' + f.density + '" data-nutrients="' + esc(f.nutrients) + '">' + dealPrefix + seasonPrefix + f.name + ' — ' + f.density + '% (' + truncateNutrients(f.nutrients, 3) + ')</option>';
      });
      html += '</select>';
  }

  html += '<div class="chips" id="chips-' + cat.id + '">' + renderChips(cat.id, selected) + '</div>';
  html += '</div>';
  return html;
}

function truncateNutrients(str, max) {
  if (!str) return '';
  let parts = str.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (parts.length <= max) return str;
  return parts.slice(0, max).join(', ') + ' +' + (parts.length - max);
}

function renderChips(catId, selected) {
  return selected.slice().sort(function(a, b) { return b.density - a.density; }).map(function(item) {
    // Check if food exists in another category
    let alsoIn = [];
    DATA.categories.forEach(function(c) {
      if (c.id !== catId && c.foods.some(function(f) { return f.name === item.name; })) {
        alsoIn.push(c.icon + ' ' + c.name);
      }
    });
    let alsoTag = alsoIn.length > 0 ? ' <span style="font-size:0.68rem;color:var(--text-dim);">aussi: ' + alsoIn.join(', ') + '</span>' : '';
    let qtyControls = item.qty > 1
      ? '<span class="qty-controls"><button class="qty-btn" data-action="dec" data-cat="' + catId + '" data-name="' + esc(item.name) + '">−</button><span class="qty-num">×' + item.qty + '</span><button class="qty-btn" data-action="inc" data-cat="' + catId + '" data-name="' + esc(item.name) + '">+</button></span>'
      : '<span class="qty-controls"><button class="qty-btn" data-action="inc" data-cat="' + catId + '" data-name="' + esc(item.name) + '">+</button></span>';
    return '<span class="chip" title="' + esc(truncateNutrients(item.nutrients, 4)) + '" data-detail-cat="' + catId + '" data-detail-name="' + esc(item.name) + '" style="cursor:pointer;">' + item.name + '<span class="density-tag">' + item.density + '%</span>' + buildDealBadges(item.name) + alsoTag + qtyControls + '<button class="remove-btn" data-action="remove" data-cat="' + catId + '" data-name="' + esc(item.name) + '" title="Retirer">×</button></span>';
  }).join('');
}

function refreshCard(catId) {
  if (typeof viewMode !== 'undefined' && viewMode === 'simple') { renderSimple(); return; }
  let card = document.querySelector('[data-cat="' + catId + '"]');
  if (!card) { return; }
  let cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) { return; }
  let selected = selections[catId] || [];
  let totalCount = selected.reduce(function(s, i) { return s + i.qty; }, 0);
  let badge = card.querySelector('.counter-badge');
  if (badge) {
    let min = cat.weekly_min, max = cat.weekly_max;
    let target = min === max ? '' + min : min + '-' + max;
    badge.textContent = totalCount + ' / ' + target + ' ' + (cat.daily ? 'jour.' : 'sem.');
    let rangeClass = '';
    if (totalCount > 0 && totalCount < min) { rangeClass = 'under'; }
    else if (totalCount > max) { rangeClass = 'over'; }
    else if (totalCount > 0) { rangeClass = 'in-range'; }
    badge.className = 'counter-badge ' + rangeClass;
  }
  let chipsContainer = card.querySelector('#chips-' + catId);
  if (chipsContainer) { chipsContainer.innerHTML = renderChips(catId, selected); }
}

function updateTabDots() {
  DATA.sections.forEach(function(sec, idx) {
    let dotClass = getSectionDotClass(sec.id);
    let tabs = document.querySelectorAll('.tab');
    if (tabs[idx]) { let dot = tabs[idx].querySelector('.tab-dot'); if (dot) { dot.className = 'tab-dot ' + dotClass; } }
  });
  if (currentMode === 'tracking') { renderTrackingNutrition(); }
}

function updateSaveBar() {
  let bar = $('save-bar');
  let btn = $('save-btn');
  let info = $('save-info');
  let total = Object.values(selections).reduce(function(sum, arr) { return sum + arr.reduce(function(s, i) { return s + i.qty; }, 0); }, 0);

  // Rewire save button
  btn.onclick = saveSelections;

  if (isDirty()) {
    bar.classList.add('visible'); btn.classList.add('dirty'); btn.disabled = false;
    btn.textContent = '💾 Sauvegarder';
    info.textContent = total + ' aliment(s) — modifications non sauvegardées';
  } else {
    btn.classList.remove('dirty'); btn.disabled = true;
    btn.textContent = '✓ Sauvegardé';
    if (total > 0) { bar.classList.add('visible'); info.textContent = total + ' aliment(s) sélectionné(s) — sauvegardé ✓'; }
    else { bar.classList.remove('visible'); }
  }
}

function setDirty(dirty) {
  let btn = $('save-btn');
  if (!btn) { return; }
  if (dirty) { btn.classList.add('dirty'); btn.disabled = false; }
  else { btn.classList.remove('dirty'); btn.disabled = true; }
}

function getFoodNutrition(catId, foodName) {
  let cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) { return null; }
  let food = cat.foods.find(function(f) { return f.name === foodName; });
  return food?.nutrition || null;
}

function accumulateNutrition(totals, nutrition, qty) {
  if (!nutrition) { return; }
  totals.protein += (nutrition.protein || 0) * qty;
  totals.fiber += (nutrition.fiber || 0) * qty;
  totals.iron += (nutrition.iron || 0) * qty;
  totals.vit_c += (nutrition.vit_c || 0) * qty;
  totals.calcium += (nutrition.calcium || 0) * qty;
  totals.omega3 += (nutrition.omega3 || 0) * qty;
  totals.calories += (nutrition.calories || 0) * qty;
}

function computeNutritionTotals(sel) {
  let totals = { protein: 0, fiber: 0, iron: 0, vit_c: 0, calcium: 0, omega3: 0, calories: 0 };
  Object.keys(sel).forEach(function(catId) {
    sel[catId].forEach(function(item) {
      let nutrition = getFoodNutrition(catId, item.name);
      accumulateNutrition(totals, nutrition, item.qty || 1);
    });
  });
  return totals;
}

function addItem(catId, item) {
  if (!selections[catId]) { selections[catId] = []; }
  let existing = selections[catId].find(function(s) { return s.name === item.name; });
  if (existing) { existing.qty = (existing.qty || 1) + 1; }
  else selections[catId].push({ ...item, qty: 1 });
  refreshCard(catId); updateTabDots(); updateSaveBar(); scheduleAutoSave();
  if (currentMode === 'tracking') { renderTrackingNutrition(); }
  if (currentUser) { loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); }); }
}

function removeItem(catId, name) {
  if (!selections[catId]) { return; }
  selections[catId] = selections[catId].filter(function(s) { return s.name !== name; });
  if (selections[catId].length === 0) { delete selections[catId]; }
  // Uncheck checkbox if visible
  let cb = document.querySelector('[data-cat="' + catId + '"][type="checkbox"]');
  if (cb) { cb.checked = false; }
  refreshCard(catId); updateTabDots(); updateSaveBar(); scheduleAutoSave();
  if (currentMode === 'tracking') { renderTrackingNutrition(); }
  if (currentUser) { loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); }); }
}

function changeQty(catId, name, delta) {
  if (!selections[catId]) { return; }
  let item = selections[catId].find(function(s) { return s.name === name; });
  if (!item) { return; }
  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) {
    removeItem(catId, name);
  } else {
    refreshCard(catId);
    updateTabDots();
    updateSaveBar();
    scheduleAutoSave();
    if (currentMode === 'tracking') { renderTrackingNutrition(); }
    if (currentUser) { loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); }); }
  }
}

function addFromSelect(catId, sel) {
  let opt = sel.selectedOptions?.[0];
  if (!opt?.value) { return; }
  addItem(catId, { name: opt.value, density: Number.parseInt(opt.dataset.density || 0), nutrients: opt.dataset.nutrients || '' });
  sel.value = '';
}

// ─── isDirty + Auto-save ───
function isDirty() { return JSON.stringify(selections) !== savedSnapshot; }

function scheduleAutoSave() {
  if (!getToken()) return; // skip if not logged in
  setDirty(true);
  clearTimeout(autoSaveTimer);
  if (currentMode === 'tracking') {
    if (typeof viewMode !== 'undefined' && viewMode === 'simple') {
      // Simple view saves immediately via addSimpleFood, no auto-save needed
      return;
    } else {
      autoSaveTimer = setTimeout(function() { loadScript('js/tracking.js', function() { saveTracking(); }); }, 2000);
    }
  } else {
    autoSaveTimer = setTimeout(function() { saveSelections(); }, 2000);
  }
}

async function saveSelections() {
  if (currentMode === 'tracking') {
    if (typeof viewMode !== 'undefined' && viewMode === 'simple') {
      return; // Simple view handles saves via addSimpleFood
    } else {
      loadScript('js/tracking.js', function() { saveTracking(); });
    }
    return;
  }
  // Cancel pending auto-save timer since we're saving now
  clearTimeout(autoSaveTimer);
  let btn = $('save-btn');
  btn.disabled = true; btn.textContent = '⏳ Sauvegarde…';
  let token = getToken();
  if (token) {
    try {
      let res = await fetchWithTimeout(API + '/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ selections: selections })
      }, 10000);
      if (res.ok) {
        savedSnapshot = JSON.stringify(selections);
        showToast('Sauvegardé', 'success');
      } else {
        showToast('Erreur de sauvegarde', 'error');
      }
    } catch(e) {
      console.error('[NutriFood] Save error:', e);
      showToast('Erreur de sauvegarde: ' + e.message, 'error');
    }
  }
  btn.textContent = '💾 Sauvegarder';
  updateSaveBar();
}

async function loadSelectionsFromServer() {
  let token = getToken();
  if (!token) { return; }
  try {
    let res = await fetchWithTimeout(API + '/selections', { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (res.status === 401) { console.warn('[NutriFood] Token expired'); clearAuth(); return; }
    let data = await res.json();
    selections = data.selections || {};
    Object.values(selections).forEach(function(arr) { arr.forEach(function(item) { if (!item.qty) { item.qty = 1; } }); });
    savedSnapshot = JSON.stringify(selections);
  } catch(e) { /* Network or server error */ console.error('[NutriFood] Load selections error:', e); }
}

// ─── Admin food editing ───
function adminAddFood(catId) {
  let nameEl = $('add-name-' + catId);
  let densityEl = $('add-density-' + catId);
  let nutrientsEl = $('add-nutrients-' + catId);
  if (!nameEl?.value?.trim()) { return; }
  let name = nameEl.value.trim();
  let density = Number.parseInt(densityEl.value || '50');
  let nutrients = nutrientsEl.value.trim() || 'Non spécifié';
  
  // Add to DATA
  let cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) { return; }
  if (cat.foods.some(function(f) { return f.name === name; })) { showToast('Cet aliment existe d\u00e9j\u00e0', 'warning'); return; }
  cat.foods.push({ name: name, density: density, nutrients: nutrients });
  
  // Clear fields
  nameEl.value = ''; densityEl.value = ''; nutrientsEl.value = '';
  
  render();
}

function adminRemoveFood(catId, name) {
  let cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) { return; }
  cat.foods = cat.foods.filter(function(f) { return f.name !== name; });
  // Also remove from selections if present
  if (selections[catId]) {
    selections[catId] = selections[catId].filter(function(s) { return s.name !== name; });
    if (selections[catId].length === 0) { delete selections[catId]; }
  }
  render();
  updateSaveBar();
}

async function hideFood(catId, name) {
  let token = getToken();
  if (!token) { showToast('Non connecté', 'error'); return; }
  try {
    let res = await fetchWithTimeout(API + '/admin/food/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: name })
    }, 10000);
    if (res.ok) {
      // Remove from DATA locally
      let cat = DATA.categories.find(function(c) { return c.id === catId; });
      if (cat) { cat.foods = cat.foods.filter(function(f) { return f.name !== name; }); }
      // Remove from selections
      if (selections[catId]) {
        selections[catId] = selections[catId].filter(function(s) { return s.name !== name; });
        if (selections[catId].length === 0) { delete selections[catId]; }
      }
      render();
      updateSaveBar();
      loadRemoveProductList();
      showToast(name + ' masqué', 'success');
    } else {
      showToast('Erreur lors du masquage', 'error');
    }
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

function getSeasonIcon(food, month) {
  if (!food) { return ''; }
  if (food.season?.length > 0 && food.season.length < 12) {
    if (food.season.includes(month)) return '🌱';
    if (food.import_season?.includes(month)) return '✈️';
  } else if (food.import_season?.length > 0 && food.import_season.length < 12) {
    if (food.import_season.includes(month)) return '✈️';
  }
  return '';
}

function renderWelcome() {
  $('app').innerHTML = `
    <div class="welcome">
      <h2>🍎 NutriFood</h2>
      <p>Suivi, optimisation et planification nutritionnelle.</p>
      <div class="features">
        <div class="feature">🥩 <strong>Viandes & Laitiers</strong></div>
        <div class="feature">🥔 <strong>Féculents</strong></div>
        <div class="feature">🥬 <strong>Légumes</strong></div>
        <div class="feature">🍎 <strong>Fruits</strong></div>
        <div class="feature">🌱 <strong>Habitudes</strong></div>
      </div>
      <button class="login-cta" id="welcome-login">Connexion / Inscription</button>
    </div>
  `;
  $('save-bar').classList.remove('visible');
  $('welcome-login').addEventListener('click', function() { showAuth('login'); });
}

// ─── Unified event delegation ───
function _handleActionButtons(e, btn) {
  let catId = btn.dataset.cat;
  let name = decodeEntities(btn.dataset.name);
  let action = btn.dataset.action;
  if (action === 'inc') { changeQty(catId, name, 1); }
  else if (action === 'dec') { changeQty(catId, name, -1); }
  else if (action === 'remove') { removeItem(catId, name); }
  else if (action === 'add-food') { adminAddFood(catId); }
  else if (action === 'remove-food') { adminRemoveFood(catId, name); }
  e.stopPropagation();
  e.preventDefault();
}

function _handleChipClick(e) {
  let chip = e.target.closest('[data-detail-cat]');
  if (!chip) { return false; }
  e.preventDefault();
  let chipName = decodeEntities(chip.dataset.detailName);
  loadScript('js/food-modal.js', function() { openFoodModal(chip.dataset.detailCat, chipName); });
  return true;
}

function _handleRemoveCatToggle(catHeader) {
  let catId = catHeader.dataset.removeCat;
  let items = document.querySelector('[data-remove-cat-items="' + catId + '"]');
  let arrow = catHeader.querySelector('.remove-cat-arrow');
  if (!items) { return; }
  let shown = items.style.display !== 'none';
  document.querySelectorAll('[data-remove-cat-items]').forEach(function(el) { el.style.display = 'none'; });
  document.querySelectorAll('.remove-cat-arrow').forEach(function(el) { el.textContent = '\u25BC'; });
  if (!shown) { items.style.display = 'block'; if (arrow) { arrow.textContent = '\u25B2'; } }
}

function _handleDealsToggle() {
  let content = document.getElementById('deals-content');
  let arrow = document.getElementById('deals-arrow');
  if (!content) { return; }
  let shown = content.style.display !== 'none';
  content.style.display = shown ? 'none' : 'block';
  if (arrow) { arrow.textContent = shown ? '\u2193' : '\u2191'; }
}

function _handleDealFoodClick(dealBadges) {
  let dealName = decodeEntities(dealBadges.dataset.dealFood);
  loadScript('js/food-modal.js', function() {
    for (let cat of DATA.categories) {
      if (cat.foods.some(function(f) { return f.name === dealName; })) { openFoodModal(cat.id, dealName); return; }
    }
  });
}

document.addEventListener('click', function(e) {
  let btn = e.target.closest('[data-action]');
  if (btn) { _handleActionButtons(e, btn); return; }
  let hideItem = e.target.closest('[data-hide-cat]');
  if (hideItem) { hideFood(hideItem.dataset.hideCat, decodeEntities(hideItem.dataset.hideName)); return; }
  let catHeader = e.target.closest('[data-remove-cat]');
  if (catHeader) { _handleRemoveCatToggle(catHeader); return; }
  let toggle = e.target.closest('#deals-toggle');
  if (toggle) { _handleDealsToggle(); return; }
  let dealBadges = e.target.closest('[data-deal-food]');
  if (dealBadges) { e.preventDefault(); _handleDealFoodClick(dealBadges); return; }
  _handleChipClick(e);
});

document.addEventListener('change', function(e) {
  // Select changes
  if (e.target.tagName === 'SELECT' && e.target.dataset.cat) {
    if (e.target.value) {
      let opt = e.target.selectedOptions[0];
      addItem(e.target.dataset.cat, { name: e.target.value, density: Number.parseInt(opt.dataset.density || 0), nutrients: opt.dataset.nutrients || '' });
      e.target.value = '';
    }
  }
  // Checkbox changes
  if (e.target.type === 'checkbox' && e.target.dataset.cat) {
    let name = decodeEntities(e.target.dataset.name);
    if (e.target.checked) { addItem(e.target.dataset.cat, { name: name, density: Number.parseInt(e.target.dataset.density || 0), nutrients: e.target.dataset.nutrients || '' }); }
    else removeItem(e.target.dataset.cat, name);
  }
});

// Mouse hover: highlight chips
document.addEventListener('mouseover', function(e) {
  let chip = e.target.closest('[data-detail-cat]');
  if (chip) { chip.style.cursor = 'pointer'; }
  let sbox = e.target.closest('[data-simple-food]');
  if (sbox) { sbox.style.cursor = 'pointer'; }
});

// ─── Simplified tracking view ───
function renderSimple() {
  let app = $('app');
  let html = '';
  html += '<div class="simple-view">';
  // Hide tracking day selector in simple view
  let tbar = $('tracking-bar');
  if (tbar) { tbar.style.display = 'none'; }
  // Mini nutrition dashboard (#23)
  html += '<div id="simple-nutri-summary" style="margin-bottom:12px;"></div>';
  // Reset button
  html += '<div class="simple-header"><button class="simple-reset-btn" id="simple-reset-btn">🔄 Reset</button></div>';

  DATA.sections.forEach(function(sec) {
    let cats = DATA.categories.filter(function(c) { return c.section === sec.id; });
    if (cats.length === 0) { return; }
    html += '<div class="simple-section">';
    html += '<h3 class="simple-section-title">' + sec.icon + ' ' + sec.name + '</h3>';
    cats.forEach(function(cat) {
      html += renderSimpleCategory(cat);
    });
    html += '</div>';
  });
  app.innerHTML = html;

  // Wire reset button
  let resetBtn = $('simple-reset-btn');
  if (resetBtn) { resetBtn.addEventListener('click', openResetConfirm); }

  // Fetch and render mini nutrition dashboard (#23)
  _renderSimpleNutriSummary();

  // Wire up empty square clicks to open the dropdown
  app.querySelectorAll('[data-simple-add]').forEach(function(box) {
    box.addEventListener('click', function(e) {
      e.stopPropagation();
      let catId = box.dataset.simpleAdd;
      // Capture target day if specified
      pendingAddDate = box.dataset.simpleDay || null;
      let dd = document.querySelector('[data-simple-dd="' + catId + '"]');
      if (dd) {
        let isVisible = dd.classList.contains('visible');
        document.querySelectorAll('.simple-dropdown.visible').forEach(function(d) { d.classList.remove('visible', 'drop-up'); });
        if (!isVisible) {
          // Position dropdown relative to the clicked box
          let boxRect = box.getBoundingClientRect();
          let ddParent = dd.parentElement;
          let parentRect = ddParent.getBoundingClientRect();
          let spaceBelow = window.innerHeight - boxRect.bottom;
          dd.style.left = (boxRect.left - parentRect.left) + 'px';
          if (spaceBelow < 250) {
            // Open upward: bottom edge of dropdown sits just above the box
            dd.style.top = '';
            dd.style.bottom = (parentRect.bottom - boxRect.top + 4) + 'px';
          } else {
            // Open downward: top edge of dropdown sits just below the box
            dd.style.bottom = '';
            dd.style.top = (boxRect.bottom - parentRect.top + 4) + 'px';
          }
          dd.classList.add('visible');
          let search = dd.querySelector('.simple-search');
          if (search) { search.value = ''; search.focus({ preventScroll: true }); }
          // Show all items
          dd.querySelectorAll('.simple-dd-item').forEach(function(it) { it.style.display = ''; });
        }
      }
    });
  });
  // Wire up search filtering
  app.querySelectorAll('[data-simple-search]').forEach(function(search) {
    search.addEventListener('input', function() {
      let q = normalizeForSearch(search.value);
      let items = search.parentElement.querySelectorAll('.simple-dd-item');
      items.forEach(function(it) {
        let name = normalizeForSearch(it.dataset.simplePick);
        it.style.display = name.includes(q) ? '' : 'none';
      });
    });
    search.addEventListener('click', function(e) { e.stopPropagation(); });
  });
  // Wire up food item picks
  app.querySelectorAll('[data-simple-pick]').forEach(function(item) {
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      let catId = item.dataset.cat;
      let foodName = decodeEntities(item.dataset.simplePick);
      let density = Number.parseInt(item.dataset.density || 0);
      let nutrients = item.dataset.nutrients || '';
      if (currentMode === 'tracking') {
        addSimpleFood(catId, foodName, density, nutrients);
      } else {
        addItem(catId, { name: foodName, density: density, nutrients: nutrients });
      }
      document.querySelectorAll('.simple-dropdown.visible').forEach(function(d) { d.classList.remove('visible'); });
    });
  });
  // Click outside closes dropdowns (listener attached once, not per-render — fix #20)
  if (!window._simpleClickListenerAttached) {
    window._simpleClickListenerAttached = true;
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.simple-dropdown') && !e.target.closest('[data-simple-add]')) {
        document.querySelectorAll('.simple-dropdown.visible').forEach(function(d) { d.classList.remove('visible'); });
      }
    }, true);
  }
}

// ─── Mutex for addSimpleFood (#27 — prevent race condition on rapid clicks) ───
let _addSimpleFoodLock = Promise.resolve();

// ─── Mini nutrition dashboard for simple view (#23) ───
async function _renderSimpleNutriSummary() {
  let container = $('simple-nutri-summary');
  if (!container) return;
  let token = getToken();
  if (!token) return;
  try {
    let todayISO = getTodayISO();
    let res = await fetchWithTimeout(API + '/tracking/nutrition/' + todayISO, {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 8000);
    if (!res.ok) return;
    let data = await res.json();
    let dayTotals = data.day_totals || {};
    let targets = data.targets || {};
    let labels = { protein: 'Prot.', fiber: 'Fib.', iron: 'Fer', vitamin_c: 'Vit.C', calcium: 'Calc.', omega3: 'Ω-3' };
    let units = { protein: 'g', fiber: 'g', iron: 'mg', vitamin_c: 'mg', calcium: 'mg', omega3: 'g' };
    let keys = ['protein', 'fiber', 'iron', 'vitamin_c', 'calcium', 'omega3'];

    let bars = keys.map(function(key) {
      let val = dayTotals[key] || 0;
      let tgt = targets[key] || 1;
      let pct = Math.min(Math.round((val / tgt) * 100), 100);
      let color = pct >= 100 ? 'var(--accent)' : (pct >= 50 ? '#fbbf24' : 'var(--accent-red)');
      return '<div style="flex:1;min-width:80px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-dim);margin-bottom:2px;">' +
        '<span>' + labels[key] + '</span>' +
        '<span style="color:' + color + ';font-weight:600;">' + pct + '%</span>' +
        '</div>' +
        '<div style="height:6px;background:#12141c;border-radius:3px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;transition:width 0.3s;"></div>' +
        '</div></div>';
    }).join('');

    container.innerHTML = '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;">' +
      '<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px;">📊 Objectifs nutritionnels (aujourdhui)</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + bars + '</div>' +
      '</div>';
  } catch(e) { /* best-effort, silent fail */ }
}

function _renderSbox(slot, cat, dayTag, optional, dayDate) {
  if (slot) {
    let fn = esc(slot.name);
    return '<span class="sbox filled" data-simple-food="' + fn + '" data-detail-cat="' + cat.id + '" data-detail-name="' + fn + '" title="' + fn + '">' + dayTag + '</span>';
  }
  let cls = optional ? 'sbox empty optional' : 'sbox empty';
  let dayAttr = dayDate ? ' data-simple-day="' + dayDate + '"' : '';
  return '<span class="' + cls + '" data-simple-add="' + cat.id + '"' + dayAttr + '>' + dayTag + '</span>';
}

function _renderSimpleBoxes(max, slots, cat) {
  let min = cat.weekly_min || 0;
  // Compute this week's dates (Mon-Sun)
  let today = new Date();
  let monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  let weekDates = [];
  for (let i = 0; i < 7; i++) {
    let d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  let html = '<span class="simple-boxes">';
  if (max <= 7) {
    html += '<span class="simple-row">';
    for (let i = 0; i < max; i++) { html += _renderSbox(slots[i], cat, '', i >= min, weekDates[i]); }
    html += '</span>';
  } else {
    let perDay = Math.floor(max / 7);
    let extra = max % 7;
    let reqPerDay = Math.floor(min / 7);
    let reqExtra = min % 7;
    let dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    let slotIdx = 0;
    for (let d = 0; d < 7; d++) {
      let count = perDay + (d < extra ? 1 : 0);
      let reqCount = reqPerDay + (d < reqExtra ? 1 : 0);
      if (d > 0) { html += '<span class="simple-day-sep"></span>'; }
      html += '<span class="simple-row">';
      for (let s = 0; s < count; s++) {
        let dayTag = '<span class="sbox-day">' + dayLabels[d] + '</span>';
        html += _renderSbox(slots[slotIdx], cat, dayTag, s >= reqCount, weekDates[d]);
        slotIdx++;
      }
      html += '</span>';
    }
  }
  html += '</span>';
  return html;
}

// Wrapper: serialize addSimpleFood calls to prevent race condition (#27)
async function addSimpleFood(catId, name, density, nutrients) {
  _addSimpleFoodLock = _addSimpleFoodLock.then(function() {
    return _addSimpleFoodInner(catId, name, density, nutrients);
  }).catch(function() { /* prevent chain break */ });
  return _addSimpleFoodLock;
}

async function _addSimpleFoodInner(catId, name, density, nutrients) {
  let targetDate = (typeof pendingAddDate !== 'undefined' && pendingAddDate) || getTodayISO();
  pendingAddDate = null;

  // 1. Update trackingWeek directly for the target day
  if (!trackingWeek[targetDate]) { trackingWeek[targetDate] = {}; }
  if (!trackingWeek[targetDate][catId]) { trackingWeek[targetDate][catId] = []; }
  let existing = trackingWeek[targetDate][catId].find(function(s) { return s.name === name; });
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
  } else {
    trackingWeek[targetDate][catId].push({ name: name, density: density, nutrients: nutrients, qty: 1 });
  }

  // 2. Update aggregate selections for display
  if (!selections[catId]) { selections[catId] = []; }
  let selItem = selections[catId].find(function(s) { return s.name === name; });
  if (selItem) {
    selItem.qty = (selItem.qty || 1) + 1;
  } else {
    selections[catId].push({ name: name, density: density, nutrients: nutrients, qty: 1 });
  }

  // 3. Save that specific day to server
  let token = getToken();
  if (token) {
    try {
      await fetchWithTimeout(API + '/tracking/' + targetDate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ selections: trackingWeek[targetDate] })
      }, 10000);
      trackingSnapshot = JSON.stringify(selections);
      savedSnapshot = trackingSnapshot;
    } catch(e) { console.error('[NutriFood] Simple add save error:', e); }
  }

  // 4. Re-render
  renderSimple();
  updateSaveBar();
}

function _buildWeekSlotsForCat(catId, max) {
  let slots = new Array(max).fill(null);
  if (currentMode === 'tracking' && trackingWeek && Object.keys(trackingWeek).length > 0) {
    // Build a map: foodName -> array of {date, qty} from trackingWeek
    let foodDays = {}; // foodName -> [{date, qty}]
    let weekDates = Object.keys(trackingWeek).sort(function(a, b) { return a.localeCompare(b); });
    weekDates.forEach(function(d) {
      let dayCat = (trackingWeek?.[d] || {})[catId] || [];
      dayCat.forEach(function(item) {
        if (!foodDays[item.name]) { foodDays[item.name] = []; }
        foodDays[item.name].push({ date: d, qty: item.qty || 1 });
      });
    });
    // Also include unsaved items from selections (not yet in trackingWeek)
    let selItems = selections[catId] || [];
    selItems.forEach(function(item) {
      let savedQty = 0;
      (foodDays[item.name] || []).forEach(function(d) { savedQty += d.qty; });
      let unsaved = (item.qty || 1) - savedQty;
      if (unsaved > 0) {
        if (!foodDays[item.name]) { foodDays[item.name] = []; }
        // Unsaved items go to the pending day (or today if none specified)
        let targetDay = (typeof pendingAddDate !== 'undefined' && pendingAddDate) || getTodayISO();
        foodDays[item.name].push({ date: targetDay, qty: unsaved, unsaved: true });
      }
    });
    // Now place items into slots
    let unsavedDate = (typeof pendingAddDate !== 'undefined' && pendingAddDate) || getTodayISO();
    if (max <= 7) {
      // Single row — place items chronologically by day eaten
      // Build ordered list: saved days + unsaved day inserted at right position
      let allDates = weekDates.slice();
      if (!allDates.includes(unsavedDate)) { allDates.push(unsavedDate); }
      allDates.sort(function(a, b) { return a.localeCompare(b); });
      let slotIdx = 0;
      allDates.forEach(function(d) {
        if (d === unsavedDate && !allDates.includes(unsavedDate)) {
          // Place unsaved items for this date
          selItems.forEach(function(item) {
            let savedQty = 0;
            (foodDays[item.name] || []).forEach(function(fd) { if (!fd.unsaved) { savedQty += fd.qty; } });
            let unsaved = (item.qty || 1) - savedQty;
            for (let q = 0; q < unsaved; q++) {
              if (slotIdx < max) { slots[slotIdx] = item; slotIdx++; }
            }
          });
        } else if (trackingWeek[d]) {
          let dayCat = trackingWeek[d][catId] || [];
          dayCat.forEach(function(item) {
            for (let q = 0; q < (item.qty || 1); q++) {
              if (slotIdx < max) { slots[slotIdx] = item; slotIdx++; }
            }
          });
        }
      });
    } else {
      // Grouped by day — place in correct day group
      let perDay = Math.floor(max / 7);
      let extra = max % 7;
      let dayOffsets = [];
      let off = 0;
      for (let dd = 0; dd < 7; dd++) { dayOffsets.push(off); off += perDay + (dd < extra ? 1 : 0); }
      weekDates.forEach(function(d) {
        let dateObj = new Date(d + 'T12:00:00');
        let dayIdx = (dateObj.getDay() + 6) % 7; // 0=Monday
        let dayStart = dayOffsets[dayIdx];
        let dayCount = perDay + (dayIdx < extra ? 1 : 0);
        let daySel = trackingWeek?.[d] || {};
        let items = daySel[catId] || [];
        let localIdx = 0;
        items.forEach(function(item) {
          for (let q = 0; q < (item.qty || 1); q++) {
            if (localIdx < dayCount) {
              slots[dayStart + localIdx] = item;
              localIdx++;
            } else {
              for (let i = 0; i < max; i++) { if (!slots[i]) { slots[i] = item; break; } }
            }
          }
        });
      });
      // Place unsaved items in the pending day's group (or today)
      let unsavedDate2 = (typeof pendingAddDate !== 'undefined' && pendingAddDate) || getTodayISO();
      let unsavedObj = new Date(unsavedDate2 + 'T12:00:00');
      let unsavedIdx = (unsavedObj.getDay() + 6) % 7;
      let unsavedStart = dayOffsets[unsavedIdx];
      let unsavedCount = perDay + (unsavedIdx < extra ? 1 : 0);
      let unsavedLocalIdx = 0;
      // Count how many saved items are in the target day's slots
      for (let i = unsavedStart; i < unsavedStart + unsavedCount; i++) { if (slots[i]) { unsavedLocalIdx++; } }
      selItems.forEach(function(item) {
        let savedQty = 0;
        (foodDays[item.name] || []).forEach(function(fd) { if (!fd.unsaved) { savedQty += fd.qty; } });
        let unsaved = (item.qty || 1) - savedQty;
        for (let q = 0; q < unsaved; q++) {
          if (unsavedLocalIdx < unsavedCount) {
            slots[unsavedStart + unsavedLocalIdx] = item;
            unsavedLocalIdx++;
          } else {
            for (let i = 0; i < max; i++) { if (!slots[i]) { slots[i] = item; break; } }
          }
        }
      });
    }
  } else {
    // Planning mode or no tracking data — flat from selections
    let selected = selections[catId] || [];
    let slotIdx = 0;
    selected.forEach(function(item) {
      for (let q = 0; q < (item.qty || 1); q++) {
        if (slotIdx < max) { slots[slotIdx] = item; slotIdx++; }
      }
    });
  }
  return slots;
}

function renderSimpleCategory(cat) {
  let selected = selections[cat.id] || [];
  let totalCount = selected.reduce(function(s, i) { return s + i.qty; }, 0);
  let max = cat.weekly_max || 7;
  let min = cat.weekly_min || 0;
  let suffix = cat.daily ? '/j' : '/s';
  let cls;
  if (totalCount < min) { cls = 'under'; }
  else if (totalCount > max) { cls = 'over'; }
  else { cls = 'in-range'; }

  let html = '<div class="simple-cat" data-cat="' + cat.id + '">';
  html += '<div class="simple-cat-row">';
  html += '<span class="simple-cat-name"><span class="icon">' + cat.icon + '</span>' + cat.name + '</span>';
  html += '<span class="simple-cat-count ' + cls + '">' + totalCount + '/' + max + suffix + '</span>';

  let slots = _buildWeekSlotsForCat(cat.id, max);

  html += _renderSimpleBoxes(max, slots, cat);
  html += '</div>';

  html += '<div class="simple-dropdown" data-simple-dd="' + cat.id + '">';
  html += '<input type="text" class="simple-search" placeholder="Rechercher…" data-simple-search="' + cat.id + '" autocomplete="off">';
  html += '<div class="simple-dd-items" data-simple-items="' + cat.id + '">';
  let sorted = cat.foods.slice().sort(function(a, b) { return b.density - a.density; });
  sorted.forEach(function(f) {
    let seasonPrefix = getSeasonPrefix(f);
    html += '<div class="simple-dd-item" data-simple-pick="' + esc(f.name) + '" data-cat="' + cat.id + '" data-density="' + f.density + '" data-nutrients="' + esc(f.nutrients) + '">' + seasonPrefix + f.name + ' <span class="simple-dd-dens">' + f.density + '%</span></div>';
  });
  html += '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

// ─── Render module ───

function render() {
  var app = $('app');

  var totals = computeNutritionTotals(selections);
  var html = '';
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
    var cats = DATA.categories.filter(function(c) { return c.section === sec.id; });
    html += '<div class="tab-content ' + (sec.id === activeTab ? 'active' : '') + '" id="tab-' + sec.id + '"><div class="grid">';
    cats.forEach(function(cat) {
      var sorted = cat.foods.slice().sort(function(a, b) { return b.density - a.density; });
      html += renderCard(Object.assign({}, cat, { foods: sorted }));
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
  var cats = DATA.categories.filter(function(c) { return c.section === sectionId; });
  var totalSelected = 0, totalMin = 0, totalMax = 0;
  cats.forEach(function(cat) {
    var sel = selections[cat.id] || [];
    totalSelected += sel.reduce(function(s, i) { return s + i.qty; }, 0);
    totalMin += cat.weekly_min; totalMax += cat.weekly_max;
  });
  if (totalSelected === 0 || totalSelected < totalMin) return 'under';
  if (totalSelected > totalMax) return 'over';
  return 'in-range';
}

function getPortionHint(cat) {
  var section = cat.section || '';
  var catId = cat.id || '';
  var hints = {
    'viandes-laitiers': '1 portion = paume de la main (~100g)',
    'legumes': '1 portion = 1 tasse crue ou ½ tasse cuite',
    'fruits': '1 portion = 1 fruit moyen ou ½ tasse',
    'feculents': '1 portion = ½ tasse cuite ou 1 tranche',
    'habitudes': 'Consommer avec modération'
  };
  // Also check by category id for more specific hints
  var idHints = {
    'noix-graines': '1 portion = 1 petite poignée (~30g)',
    'lait': '1 portion = 1 tasse (250ml)',
    'oeufs': '1 portion = 1-2 œufs'
  };
  if (idHints[catId]) return idHints[catId];
  if (hints[section]) return hints[section];
  return null;
}

function renderCard(cat) {
  var selected = selections[cat.id] || [];
  var totalCount = selected.reduce(function(s, i) { return s + i.qty; }, 0);
  var suffix = cat.daily ? 'jour.' : 'sem.';
  var min = cat.weekly_min, max = cat.weekly_max;
  var target = min === max ? '' + min : min + '-' + max;
  var cls = '';
  if (totalCount < min) cls = 'under';
  else if (totalCount > max) cls = 'over';
  else cls = 'in-range';

  var html = '<div class="card" data-cat="' + cat.id + '">';
  html += '<div class="card-header">';
  html += '<span class="cat-label"><span class="icon">' + cat.icon + '</span>' + cat.name + '</span>';
  html += '<span class="counter-badge ' + (totalCount > 0 ? cls : '') + '">' + totalCount + ' / ' + target + ' ' + suffix + '</span>';
  html += '</div>';

  var portionHint = getPortionHint(cat);
  if (portionHint) {
    html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:8px;font-style:italic;">📏 ' + esc(portionHint) + '</div>';
  }

  if (cat.type === 'checkbox') {
    cat.foods.forEach(function(f) {
        var isChecked = selected.some(function(s) { return s.name === f.name; });
        var dealBadgesHtml = buildDealBadges(f.name);
        html += '<label class="checkbox-add"><input type="checkbox" data-cat="' + cat.id + '" data-name="' + esc(f.name) + '" data-density="' + f.density + '" data-nutrients="' + esc(f.nutrients) + '" ' + (isChecked ? 'checked' : '') + '><span>+ ' + f.name + ' (' + f.density + '%)</span>' + dealBadgesHtml + '</label>';
    });
  } else {
    html += '<select data-cat="' + cat.id + '"><option value="">+ Ajouter…</option>';
      cat.foods.forEach(function(f) {
        var seasonPrefix = '';
        if (f.season && f.season.length > 0) {
          var month = new Date().getMonth() + 1;
          if (f.season.includes(month)) seasonPrefix = '🌱 ';
          else if (f.import_season && f.import_season.includes(month)) seasonPrefix = '✈️ ';
        } else if (f.import_season && f.import_season.length > 0 && f.import_season.length < 12) {
          var month = new Date().getMonth() + 1;
          if (f.import_season.includes(month)) seasonPrefix = '✈️ ';
        }
        var dealPrefix = DEALS[f.name] && DEALS[f.name].length > 0 ? '🏷️ ' : '';
        html += '<option value="' + esc(f.name) + '" data-density="' + f.density + '" data-nutrients="' + esc(f.nutrients) + '">' + dealPrefix + seasonPrefix + f.name + ' — ' + f.density + '% (' + f.nutrients + ')</option>';
      });
      html += '</select>';
  }

  html += '<div class="chips" id="chips-' + cat.id + '">' + renderChips(cat.id, selected) + '</div>';
  html += '</div>';
  return html;
}

function renderChips(catId, selected) {
  var cat = DATA.categories.find(function(c) { return c.id === catId; });
  return selected.slice().sort(function(a, b) { return b.density - a.density; }).map(function(item) {
    // Check if food exists in another category
    var alsoIn = [];
    DATA.categories.forEach(function(c) {
      if (c.id !== catId && c.foods.some(function(f) { return f.name === item.name; })) {
        alsoIn.push(c.icon + ' ' + c.name);
      }
    });
    var alsoTag = alsoIn.length > 0 ? ' <span style="font-size:0.68rem;color:var(--text-dim);">aussi: ' + alsoIn.join(', ') + '</span>' : '';
    var qtyControls = item.qty > 1
      ? '<span class="qty-controls"><button class="qty-btn" data-action="dec" data-cat="' + catId + '" data-name="' + esc(item.name) + '">−</button><span class="qty-num">×' + item.qty + '</span><button class="qty-btn" data-action="inc" data-cat="' + catId + '" data-name="' + esc(item.name) + '">+</button></span>'
      : '<span class="qty-controls"><button class="qty-btn" data-action="inc" data-cat="' + catId + '" data-name="' + esc(item.name) + '">+</button></span>';
    return '<span class="chip" title="' + esc(item.nutrients) + '" data-detail-cat="' + catId + '" data-detail-name="' + esc(item.name) + '" style="cursor:pointer;">' + item.name + '<span class="density-tag">' + item.density + '%</span>' + buildDealBadges(item.name) + alsoTag + qtyControls + '<button class="remove-btn" data-action="remove" data-cat="' + catId + '" data-name="' + esc(item.name) + '" title="Retirer">×</button></span>';
  }).join('');
}

function refreshCard(catId) {
  var card = document.querySelector('[data-cat="' + catId + '"]');
  if (!card) return;
  var cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) return;
  var selected = selections[catId] || [];
  var totalCount = selected.reduce(function(s, i) { return s + i.qty; }, 0);
  var badge = card.querySelector('.counter-badge');
  if (badge) {
    var min = cat.weekly_min, max = cat.weekly_max;
    var target = min === max ? '' + min : min + '-' + max;
    badge.textContent = totalCount + ' / ' + target + ' ' + (cat.daily ? 'jour.' : 'sem.');
    var rangeClass = '';
    if (totalCount > 0 && totalCount < min) rangeClass = 'under';
    else if (totalCount > max) rangeClass = 'over';
    else if (totalCount > 0) rangeClass = 'in-range';
    badge.className = 'counter-badge ' + rangeClass;;
  }
  var chipsContainer = card.querySelector('#chips-' + catId);
  if (chipsContainer) chipsContainer.innerHTML = renderChips(catId, selected);
}

function updateTabDots() {
  DATA.sections.forEach(function(sec, idx) {
    var dotClass = getSectionDotClass(sec.id);
    var tabs = document.querySelectorAll('.tab');
    if (tabs[idx]) { var dot = tabs[idx].querySelector('.tab-dot'); if (dot) dot.className = 'tab-dot ' + dotClass; }
  });
  if (currentMode === 'tracking') renderTrackingNutrition();
}

function updateSaveBar() {
  var bar = $('save-bar');
  var btn = $('save-btn');
  var info = $('save-info');
  var total = Object.values(selections).reduce(function(sum, arr) { return sum + arr.reduce(function(s, i) { return s + i.qty; }, 0); }, 0);

  // Rewire save button
  btn.onclick = saveSelections;

  if (isDirty()) {
    bar.classList.add('visible'); btn.classList.add('dirty'); btn.disabled = false;
    info.textContent = total + ' aliment(s) — modifications non sauvegardées';
  } else {
    btn.classList.remove('dirty'); btn.disabled = true;
    if (total > 0) { bar.classList.add('visible'); info.textContent = total + ' aliment(s) sélectionné(s) — sauvegardé ✓'; }
    else { bar.classList.remove('visible'); }
  }
}

function setDirty(dirty) {
  var btn = $('save-btn');
  if (!btn) return;
  if (dirty) { btn.classList.add('dirty'); btn.disabled = false; }
  else { btn.classList.remove('dirty'); btn.disabled = true; }
}

function computeNutritionTotals(sel) {
  var totals = { protein: 0, fiber: 0, iron: 0, vit_c: 0, calcium: 0, omega3: 0, calories: 0 };
  Object.keys(sel).forEach(function(catId) {
    sel[catId].forEach(function(item) {
      var cat = DATA.categories.find(function(c) { return c.id === catId; });
      if (cat) {
        var food = cat.foods.find(function(f) { return f.name === item.name; });
        if (food && food.nutrition) {
          var qty = item.qty || 1;
          totals.protein += (food.nutrition.protein || 0) * qty;
          totals.fiber += (food.nutrition.fiber || 0) * qty;
          totals.iron += (food.nutrition.iron || 0) * qty;
          totals.vit_c += (food.nutrition.vit_c || 0) * qty;
          totals.calcium += (food.nutrition.calcium || 0) * qty;
          totals.omega3 += (food.nutrition.omega3 || 0) * qty;
          totals.calories += (food.nutrition.calories || 0) * qty;
        }
      }
    });
  });
  return totals;
}

function addItem(catId, item) {
  if (!selections[catId]) selections[catId] = [];
  var existing = selections[catId].find(function(s) { return s.name === item.name; });
  if (existing) existing.qty = (existing.qty || 1) + 1;
  else selections[catId].push(Object.assign({}, item, { qty: 1 }));
  refreshCard(catId); updateTabDots(); updateSaveBar(); scheduleAutoSave();
  if (currentMode === 'tracking') renderTrackingNutrition();
  if (currentUser) loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); });
}

function removeItem(catId, name) {
  if (!selections[catId]) return;
  selections[catId] = selections[catId].filter(function(s) { return s.name !== name; });
  if (selections[catId].length === 0) delete selections[catId];
  // Uncheck checkbox if visible
  var cb = document.querySelector('[data-cat="' + catId + '"][type="checkbox"]');
  if (cb) cb.checked = false;
  refreshCard(catId); updateTabDots(); updateSaveBar(); scheduleAutoSave();
  if (currentMode === 'tracking') renderTrackingNutrition();
  if (currentUser) loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); });
}

function changeQty(catId, name, delta) {
  if (!selections[catId]) return;
  var item = selections[catId].find(function(s) { return s.name === name; });
  if (!item) return;
  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) removeItem(catId, name);
  else { refreshCard(catId); updateTabDots(); updateSaveBar(); scheduleAutoSave(); if (currentMode === 'tracking') renderTrackingNutrition(); if (currentUser) loadScript('js/suggestions.js', function() { checkSuggestionsBadge(); }); }
}

function addFromSelect(catId, sel) {
  var opt = sel.selectedOptions[0];
  if (!opt || !opt.value) return;
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
    autoSaveTimer = setTimeout(function() { loadScript('js/tracking.js', function() { saveTracking(); }); }, 2000);
  } else {
    autoSaveTimer = setTimeout(function() { saveSelections(); }, 2000);
  }
}

async function saveSelections() {
  if (currentMode === 'tracking') { loadScript('js/tracking.js', function() { saveTracking(); }); return; }
  // Cancel pending auto-save timer since we're saving now
  clearTimeout(autoSaveTimer);
  var btn = $('save-btn');
  var origText = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Sauvegarde…';
  var token = getToken();
  if (token) {
    try {
      var res = await fetchWithTimeout(API + '/selections', {
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
  var token = getToken();
  if (!token) return;
  try {
    var res = await fetchWithTimeout(API + '/selections', { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (res.status === 401) { console.warn('[NutriFood] Token expired'); clearAuth(); return; }
    var data = await res.json();
    selections = data.selections || {};
    Object.values(selections).forEach(function(arr) { arr.forEach(function(item) { if (!item.qty) item.qty = 1; }); });
    savedSnapshot = JSON.stringify(selections);
  } catch(e) { console.error('[NutriFood] Load selections error:', e); }
}

// ─── Admin food editing ───
function adminAddFood(catId) {
  var nameEl = $('add-name-' + catId);
  var densityEl = $('add-density-' + catId);
  var nutrientsEl = $('add-nutrients-' + catId);
  if (!nameEl || !nameEl.value.trim()) return;
  var name = nameEl.value.trim();
  var density = Number.parseInt(densityEl.value || '50');
  var nutrients = nutrientsEl.value.trim() || 'Non spécifié';
  
  // Add to DATA
  var cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) return;
  if (cat.foods.some(function(f) { return f.name === name; })) { showToast('Cet aliment existe d\u00e9j\u00e0', 'warning'); return; }
  cat.foods.push({ name: name, density: density, nutrients: nutrients });
  
  // Clear fields
  nameEl.value = ''; densityEl.value = ''; nutrientsEl.value = '';
  
  // Save to server
  saveFoodsToServer();
  render();
}

function adminRemoveFood(catId, name) {
  var cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) return;
  cat.foods = cat.foods.filter(function(f) { return f.name !== name; });
  // Also remove from selections if present
  if (selections[catId]) {
    selections[catId] = selections[catId].filter(function(s) { return s.name !== name; });
    if (selections[catId].length === 0) delete selections[catId];
  }
  saveFoodsToServer();
  render();
  updateSaveBar();
}

async function saveFoodsToServer() {
  // Deprecated — foods are now managed via /api/admin/food/show and /api/admin/food/hide
}

async function hideFood(catId, name) {
  var token = getToken();
  if (!token) { showToast('Non connecté', 'error'); return; }
  try {
    var res = await fetchWithTimeout(API + '/admin/food/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: name })
    }, 10000);
    if (res.ok) {
      // Remove from DATA locally
      var cat = DATA.categories.find(function(c) { return c.id === catId; });
      if (cat) cat.foods = cat.foods.filter(function(f) { return f.name !== name; });
      // Remove from selections
      if (selections[catId]) {
        selections[catId] = selections[catId].filter(function(s) { return s.name !== name; });
        if (selections[catId].length === 0) delete selections[catId];
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
  if (!food) return '';
  if (food.season && food.season.length > 0 && food.season.length < 12) {
    if (food.season.includes(month)) return '🌱';
    if (food.import_season && food.import_season.includes(month)) return '✈️';
  } else if (food.import_season && food.import_season.length > 0 && food.import_season.length < 12) {
    if (food.import_season.includes(month)) return '✈️';
  }
  return '';
}

function renderWelcome() {
  $('app').innerHTML = `
    <div class="welcome">
      <h2>🍎 NutriFood</h2>
      <p>Planifiez votre semaine nutritionnelle — aliments classés par densité nutritionnelle.</p>
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
document.addEventListener('click', function(e) {
  // 1. Action buttons (qty +, qty -, remove, admin) — highest priority
  var btn = e.target.closest('[data-action]');
  if (btn) {
    var catId = btn.dataset.cat;
    var name = btn.dataset.name.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    var action = btn.dataset.action;
    if (action === 'inc') changeQty(catId, name, 1);
    else if (action === 'dec') changeQty(catId, name, -1);
    else if (action === 'remove') removeItem(catId, name);
    else if (action === 'add-food') adminAddFood(catId);
    else if (action === 'remove-food') adminRemoveFood(catId, name);
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  // 1b. Hide product from manage tab
  var hideItem = e.target.closest('[data-hide-cat]');
  if (hideItem) {
    var hideCat = hideItem.dataset.hideCat;
    var hideName = hideItem.dataset.hideName.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    hideFood(hideCat, hideName);
    return;
  }
  // 1c. Toggle category accordion in remove tab
  var catHeader = e.target.closest('[data-remove-cat]');
  if (catHeader) {
    var catId = catHeader.dataset.removeCat;
    var items = document.querySelector('[data-remove-cat-items="' + catId + '"]');
    var arrow = catHeader.querySelector('.remove-cat-arrow');
    if (items) {
      var shown = items.style.display !== 'none';
      // Close all others
      document.querySelectorAll('[data-remove-cat-items]').forEach(function(el) { el.style.display = 'none'; });
      document.querySelectorAll('.remove-cat-arrow').forEach(function(el) { el.textContent = '\u25BC'; });
      // Toggle this one
      if (!shown) {
        items.style.display = 'block';
        if (arrow) arrow.textContent = '\u25B2';
      }
    }
    return;
  }
  // 2. Deals toggle in modal
  var toggle = e.target.closest('#deals-toggle');
  if (toggle) {
    var content = document.getElementById('deals-content');
    var arrow = document.getElementById('deals-arrow');
    if (content) {
      var shown = content.style.display !== 'none';
      content.style.display = shown ? 'none' : 'block';
      if (arrow) arrow.textContent = shown ? '\u2193' : '\u2191';
    }
    return;
  }
  // 3. Deal badges inside chips -> open food modal
  var dealBadges = e.target.closest('[data-deal-food]');
  if (dealBadges) {
    e.preventDefault();
    var dealName = dealBadges.dataset.dealFood.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    loadScript('js/food-modal.js', function() {
      for (var i = 0; i < DATA.categories.length; i++) {
        var cat = DATA.categories[i];
        if (cat.foods.some(function(f) { return f.name === dealName; })) {
          openFoodModal(cat.id, dealName);
          return;
        }
      }
    });
    return;
  }
  // 4. Chip click -> open food modal
  var chip = e.target.closest('[data-detail-cat]');
  if (chip) {
    e.preventDefault();
    var chipName = chip.dataset.detailName.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    loadScript('js/food-modal.js', function() {
      openFoodModal(chip.dataset.detailCat, chipName);
    });
    return;
  }
});

document.addEventListener('change', function(e) {
  // Select changes
  if (e.target.tagName === 'SELECT' && e.target.dataset.cat) {
    if (e.target.value) {
      var opt = e.target.selectedOptions[0];
      addItem(e.target.dataset.cat, { name: e.target.value, density: Number.parseInt(opt.dataset.density || 0), nutrients: opt.dataset.nutrients || '' });
      e.target.value = '';
    }
  }
  // Checkbox changes
  if (e.target.type === 'checkbox' && e.target.dataset.cat) {
    var name = e.target.dataset.name.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (e.target.checked) addItem(e.target.dataset.cat, { name: name, density: Number.parseInt(e.target.dataset.density || 0), nutrients: e.target.dataset.nutrients || '' });
    else removeItem(e.target.dataset.cat, name);
  }
});

// Mouse hover: highlight chips
document.addEventListener('mouseover', function(e) {
  var chip = e.target.closest('[data-detail-cat]');
  if (chip) chip.style.cursor = 'pointer';
});

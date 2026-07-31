// ─── Nutrition module ───

function daysUntilReset() {
  var now = new Date();
  var day = now.getDay(); // 0=dimanche, 1=lundi, 
  var daysUntilMonday = day === 0 ? 1 : (8 - day);
  return daysUntilMonday;
}

function getISOWeek() {
  var d = new Date();
  var tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  var weekNum = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return weekNum;
}

function hasSelections() {
  return Object.keys(selections).some(function(catId) { return selections[catId] && selections[catId].length > 0; });
}

// ─── Goals ───
var userGoals = null;
var defaultGoals = { protein: 350, fiber: 175, iron: 56, vitamin_c: 280, calcium: 700, omega3: 3.5, calories: 14000 };

async function loadUserGoals() {
  var token = getToken();
  if (!token) { userGoals = { ...defaultGoals }; return; }
  try {
    var res = await fetchWithTimeout(API + '/goals', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (res.ok) {
      var data = await res.json();
      userGoals = data.goals || { ...defaultGoals };
    } else {
      userGoals = { ...defaultGoals };
    }
  } catch(e) { userGoals = { ...defaultGoals }; }
}

async function showGoals() {
  $('goals-error').textContent = '';
  if (!userGoals) await loadUserGoals();
  $('goal-protein').value = userGoals.protein || defaultGoals.protein;
  $('goal-fiber').value = userGoals.fiber || defaultGoals.fiber;
  $('goal-iron').value = userGoals.iron || defaultGoals.iron;
  $('goal-vitamin_c').value = userGoals.vitamin_c || defaultGoals.vitamin_c;
  $('goal-calcium').value = userGoals.calcium || defaultGoals.calcium;
  $('goal-omega3').value = userGoals.omega3 || defaultGoals.omega3;
  $('goal-calories').value = userGoals.calories || defaultGoals.calories;
  $('goals-modal').classList.remove('hidden');
}

async function submitGoals() {
  var goals = {
    protein: parseFloat($('goal-protein').value) || 0,
    fiber: parseFloat($('goal-fiber').value) || 0,
    iron: parseFloat($('goal-iron').value) || 0,
    vitamin_c: parseFloat($('goal-vitamin_c').value) || 0,
    calcium: parseFloat($('goal-calcium').value) || 0,
    omega3: parseFloat($('goal-omega3').value) || 0,
    calories: parseFloat($('goal-calories').value) || 0
  };
  var token = getToken();
  if (!token) { $('goals-error').textContent = 'Non connecté'; return; }
  $('goals-submit').disabled = true;
  $('goals-submit').textContent = 'Sauvegarde…';
  try {
    var res = await fetchWithTimeout(API + '/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ goals: goals })
    }, 10000);
    if (res.ok) {
      userGoals = goals;
      $('goals-modal').classList.add('hidden');
      showToast('Objectifs sauvegardés', 'success');
      render();
      checkSuggestionsBadge();
    } else {
      var data = await res.json().catch(function() { return {}; });
      $('goals-error').textContent = data.error || 'Erreur';
    }
  } catch(e) {
    $('goals-error').textContent = 'Erreur: ' + e.message;
  }
  $('goals-submit').disabled = false;
  $('goals-submit').textContent = '💾 Sauvegarder';
}

// ─── Reset confirmation ───
function openResetConfirm() {
  var body = $('reset-confirm-body');
  if (currentMode === 'tracking') {
    body.innerHTML =
      '<p style="margin-bottom:16px;color:var(--text-dim);">Que voulez-vous réinitialiser?</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      '<button class="submit-btn" id="reset-day-btn" style="background:var(--accent-amber);">📅 Journée (' + formatDayLabel(trackingDate) + ')</button>' +
      '<button class="submit-btn" id="reset-week-btn" style="background:var(--accent-red);">📋 Semaine complète</button>' +
      '<a class="cancel-link" id="reset-cancel-btn">Annuler</a>' +
      '</div>';
    $('reset-day-btn').addEventListener('click', function() { performTrackingReset('day'); });
    $('reset-week-btn').addEventListener('click', function() { performTrackingReset('week'); });
    $('reset-cancel-btn').addEventListener('click', closeResetConfirm);
  } else {
    body.innerHTML =
      '<p style="margin-bottom:16px;color:var(--text-dim);">Vider toutes les sélections de la semaine?</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      '<button class="submit-btn" id="reset-confirm-btn" style="background:var(--accent-red);">✅ Confirmer le reset</button>' +
      '<a class="cancel-link" id="reset-cancel-btn">Annuler</a>' +
      '</div>';
    $('reset-confirm-btn').addEventListener('click', performPlanningReset);
    $('reset-cancel-btn').addEventListener('click', closeResetConfirm);
  }
  $('reset-confirm-modal').classList.remove('hidden');
}

function closeResetConfirm() {
  $('reset-confirm-modal').classList.add('hidden');
}

async function performPlanningReset() {
  closeResetConfirm();
  selections = {};
  planningSelections = {};
  savedSnapshot = '{}';
  render();
  updateSaveBar();
  var token = getToken();
  if (token) {
    try {
      await fetchWithTimeout(API + '/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ selections: {} })
      }, 10000);
      showToast('Sélections réinitialisées', 'success');
    } catch(e) { showToast('Erreur lors du reset', 'error'); }
  }
}

async function performTrackingReset(scope) {
  closeResetConfirm();
  var token = getToken();
  if (!token) return;
  try {
    if (scope === 'day') {
      await fetchWithTimeout(API + '/tracking/' + trackingDate, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      }, 10000);
      showToast('Journée réinitialisée', 'success');
    } else {
      await fetchWithTimeout(API + '/tracking/week', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      }, 10000);
      showToast('Semaine réinitialisée', 'success');
    }
    loadTrackingDay(trackingDate);
  } catch(e) { showToast('Erreur lors du reset', 'error'); }
}

// ─── Tracking nutrition dashboard (dual: day + week) ───
async function renderTrackingNutrition() {
  var container = $('tracking-nutrition');
  if (!container || !DATA) return;
  var nutrients = [
    { key: 'calories', label: 'Calories', unit: 'kcal', goalKey: 'calories' },
    { key: 'protein', label: 'Protéine', unit: 'g', goalKey: 'protein' },
    { key: 'fiber', label: 'Fibres', unit: 'g', goalKey: 'fiber' },
    { key: 'iron', label: 'Fer', unit: 'mg', goalKey: 'iron' },
    { key: 'vit_c', label: 'Vit C', unit: 'mg', goalKey: 'vitamin_c' },
    { key: 'calcium', label: 'Calcium', unit: 'mg', goalKey: 'calcium' },
    { key: 'omega3', label: 'O-3', unit: 'g', goalKey: 'omega3' }
  ];
  var targets = userGoals || {};
  // Compute day totals locally (instant)
  var dt = { protein: 0, fiber: 0, iron: 0, vit_c: 0, calcium: 0, omega3: 0, calories: 0 };
  Object.keys(selections).forEach(function(catId) {
    if (!selections[catId]) return;
    var cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    selections[catId].forEach(function(item) {
      var food = cat.foods.find(function(f) { return f.name === item.name; });
      if (food && food.nutrition) {
        var qty = item.qty || 1;
        dt.protein += (food.nutrition.protein || 0) * qty;
        dt.fiber += (food.nutrition.fiber || 0) * qty;
        dt.iron += (food.nutrition.iron || 0) * qty;
        dt.vit_c += (food.nutrition.vit_c || 0) * qty;
        dt.calcium += (food.nutrition.calcium || 0) * qty;
        dt.omega3 += (food.nutrition.omega3 || 0) * qty;
        dt.calories += (food.nutrition.calories || 0) * qty;
      }
    });
  });
  function nutrientRow(n, val, goal, isDaily) {
    var target = isDaily ? (goal ? goal / 7 : 0) : (goal || 0);
    var pct = target > 0 ? Math.round((val / target) * 100) : 0;
    var pctCls = '';
    if (pct >= 80) pctCls = 'good';
    else if (pct >= 50) pctCls = 'ok';
    else pctCls = 'low';
    var h = '<div class="nutri-stat">';
    h += '<span class="ns-value">' + (n.key === 'calories' ? Math.round(val).toLocaleString() : Math.round(val)) + '</span>';
    h += '<span class="ns-label">' + n.label + '</span>';
    if (target > 0) {
      h += '<span class="ns-pct ' + pctCls + '">' + pct + '%</span>';
      h += '<div class="nutri-progress"><div class="nutri-progress-fill ' + pctCls + '" style="width:' + Math.min(pct, 100) + '%"></div></div>';
    }
    h += '</div>';
    return h;
  }
  // Render day section immediately
  var html = '';
  html += '<div class="nutri-summary-header"><span class="nutri-summary-title">📊 <strong>' + formatDayLabel(trackingDate) + '</strong></span><span class="reset-badge" style="cursor:pointer;" onclick="openResetConfirm()">🔄 Reset</span></div>';
  html += '<div class="nutri-stats-row">';
  nutrients.forEach(function(n) {
    html += nutrientRow(n, dt[n.key] || 0, targets[n.goalKey || n.key], true);
  });
  html += '</div>';
  // Week section placeholder
  var weekNum = getISOWeek();
  html += '<div class="nutri-summary-header" style="margin-top:12px;"><span class="nutri-summary-title">📅 Semaine ' + weekNum + ' (cumul)</span></div>';
  html += '<div id="tracking-week-stats" class="nutri-stats-row"><p class="loading">Chargement…</p></div>';
  container.innerHTML = html;
  // Fetch week totals async
  var token = getToken();
  if (!token) return;
  try {
    var res = await fetchWithTimeout(API + '/tracking/nutrition/' + trackingDate, { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (!res.ok) { var wc1 = $('tracking-week-stats'); if (wc1) wc1.innerHTML = ''; return; }
    var data = await res.json();
    var wt = data.week_totals || {};
    if (data.targets) targets = data.targets;
    var wc2 = $('tracking-week-stats');
    if (!wc2) return;
    var wh = '';
    nutrients.forEach(function(n) {
      wh += nutrientRow(n, wt[n.key] || 0, targets[n.goalKey || n.key], false);
    });
    wc2.innerHTML = wh;
  } catch(e) { console.error('[NutriFood] Tracking week fetch error:', e); }
}

function renderDailyNutrition(totals) {
  /* goals check inline */
  var weekNum = getISOWeek();
  var resetDays = daysUntilReset();

  var nutrients = [
    { key: 'calories', label: 'Calories',   unit: 'kcal', weekly: totals.calories || 0, goalKey: 'calories' },
    { key: 'protein',  label: 'Proteine g', unit: 'g',    weekly: totals.protein,  goalKey: 'protein' },
    { key: 'fiber',    label: 'Fibres g',   unit: 'g',    weekly: totals.fiber,    goalKey: 'fiber' },
    { key: 'iron',     label: 'Fer mg',     unit: 'mg',   weekly: totals.iron,     goalKey: 'iron' },
    { key: 'vit_c',    label: 'Vit C mg',   unit: 'mg',   weekly: totals.vit_c,    goalKey: 'vitamin_c' },
    { key: 'calcium',  label: 'Calcium mg', unit: 'mg',   weekly: totals.calcium,  goalKey: 'calcium' },
    { key: 'omega3',   label: 'O-3 g',      unit: 'g',    weekly: totals.omega3,   goalKey: 'omega3' }
  ];

  var html = '<div class="nutri-summary-header">';
  html += '<span class="nutri-summary-title">\uD83D\uDCCA Nutrition — <strong>Semaine ' + weekNum + '</strong></span>';
  html += '<span class="reset-badge" style="cursor:pointer;" onclick="openResetConfirm()">\uD83D\uDD04 Reset dans ' + resetDays + 'j</span>';
  html += '</div>';

  html += '<div class="nutri-stats-row">';
  nutrients.forEach(function(n) {
    var daily = n.weekly / 7;
    var dailyStr = n.unit === 'g' ? (Math.round(daily * 10) / 10) + '' : Math.round(daily) + '';
    html += '<div class="nutri-stat">';
    html += '<span class="ns-value">' + (n.key === 'calories' ? Math.round(n.weekly).toLocaleString() : Math.round(n.weekly)) + '</span>';
    html += '<span class="ns-label">' + n.label + '</span>';
    html += '<span class="ns-daily">' + dailyStr + n.unit + '/j</span>';
    var goalVal = userGoals ? userGoals[n.goalKey || n.key] : null;
    if (goalVal) {
      var dailyTarget = goalVal / 7;
      var pct = dailyTarget > 0 ? Math.round((daily / dailyTarget) * 100) : 0;
      var pctCls = '';
      if (pct >= 80) pctCls = 'good';
      else if (pct >= 50) pctCls = 'ok';
      else pctCls = 'low';
      html += '<span class="ns-pct ' + pctCls + '">' + pct + '%</span>';
      html += '<div class="nutri-progress"><div class="nutri-progress-fill ' + pctCls + '" style="width:' + Math.min(pct, 100) + '%"></div></div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

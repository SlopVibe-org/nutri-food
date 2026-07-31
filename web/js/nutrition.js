// ─── Nutrition module ───

/* global selections, planningSelections, savedSnapshot */
function daysUntilReset() {
  let now = new Date();
  let day = now.getDay(); // 0=dimanche, 1=lundi, 
  let daysUntilMonday = day === 0 ? 1 : (8 - day);
  return daysUntilMonday;
}

function getISOWeek() {
  let d = new Date();
  let tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  let dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  let yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  let weekNum = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return weekNum;
}

function hasSelections() {
  return Object.keys(selections).some(function(catId) { return selections[catId]?.length > 0; });
}

// ─── Goals ───
let userGoals = null;
let defaultGoals = { protein: 350, fiber: 175, iron: 56, vitamin_c: 280, calcium: 700, omega3: 3.5, calories: 14000 };

async function loadUserGoals() {
  let token = getToken();
  if (!token) { userGoals = { ...defaultGoals }; return; }
  try {
    let res = await fetchWithTimeout(API + '/goals', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (res.ok) {
      let data = await res.json();
      userGoals = data.goals || { ...defaultGoals };
    } else {
      userGoals = { ...defaultGoals };
    }
  } catch(e) { userGoals = { ...defaultGoals }; }
}

async function showGoals() {
  $('goals-error').textContent = '';
  if (!userGoals) { await loadUserGoals(); }
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
  let goals = {
    protein: Number.parseFloat($('goal-protein').value) || 0,
    fiber: Number.parseFloat($('goal-fiber').value) || 0,
    iron: Number.parseFloat($('goal-iron').value) || 0,
    vitamin_c: Number.parseFloat($('goal-vitamin_c').value) || 0,
    calcium: Number.parseFloat($('goal-calcium').value) || 0,
    omega3: Number.parseFloat($('goal-omega3').value) || 0,
    calories: Number.parseFloat($('goal-calories').value) || 0
  };
  let token = getToken();
  if (!token) { $('goals-error').textContent = 'Non connecté'; return; }
  $('goals-submit').disabled = true;
  $('goals-submit').textContent = 'Sauvegarde…';
  try {
    let res = await fetchWithTimeout(API + '/goals', {
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
      let data = await res.json().catch(function() { return {}; });
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
  let body = $('reset-confirm-body');
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
  let token = getToken();
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
  let token = getToken();
  if (!token) { return; }
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
function getPctClass(pct) {
  if (pct >= 80) { return 'good'; }
  if (pct >= 50) { return 'ok'; }
  return 'low';
}

function computeDayTotals() {
  return computeNutritionTotals(selections);
}

const TRACKING_NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', goalKey: 'calories' },
  { key: 'protein', label: 'Protéine', unit: 'g', goalKey: 'protein' },
  { key: 'fiber', label: 'Fibres', unit: 'g', goalKey: 'fiber' },
  { key: 'iron', label: 'Fer', unit: 'mg', goalKey: 'iron' },
  { key: 'vit_c', label: 'Vit C', unit: 'mg', goalKey: 'vitamin_c' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', goalKey: 'calcium' },
  { key: 'omega3', label: 'O-3', unit: 'g', goalKey: 'omega3' }
];

function buildNutrientRow(n, val, goal, isDaily) {
  let weeklyTarget = goal || 0;
  let target = isDaily ? weeklyTarget / 7 : weeklyTarget;
  let pct = target > 0 ? Math.round((val / target) * 100) : 0;
  let pctCls = getPctClass(pct);
  let h = '<div class="nutri-stat">';
  h += '<span class="ns-value">' + (n.key === 'calories' ? Math.round(val).toLocaleString() : Math.round(val)) + '</span>';
  h += '<span class="ns-label">' + n.label + '</span>';
  if (target > 0) {
    h += '<span class="ns-pct ' + pctCls + '">' + pct + '%</span>';
    h += '<div class="nutri-progress"><div class="nutri-progress-fill ' + pctCls + '" style="width:' + Math.min(pct, 100) + '%"></div></div>';
  }
  h += '</div>';
  return h;
}

async function renderTrackingNutrition() {
  let container = $('tracking-nutrition');
  if (!container || !DATA) { return; }
  let targets = userGoals || {};
  let dt = computeDayTotals();
  // Render day section immediately
  let html = '';
  html += '<div class="nutri-summary-header"><span class="nutri-summary-title">📊 <strong>' + formatDayLabel(trackingDate) + '</strong></span><span class="reset-badge" style="cursor:pointer;" onclick="openResetConfirm()">🔄 Reset</span></div>';
  html += '<div class="nutri-stats-row">';
  TRACKING_NUTRIENTS.forEach(function(n) {
    html += buildNutrientRow(n, dt[n.key] || 0, targets[n.goalKey || n.key], true);
  });
  html += '</div>';
  // Week section placeholder
  let weekNum = getISOWeek();
  html += '<div class="nutri-summary-header" style="margin-top:12px;"><span class="nutri-summary-title">📅 Semaine ' + weekNum + ' (cumul)</span></div>';
  html += '<div id="tracking-week-stats" class="nutri-stats-row"><p class="loading">Chargement…</p></div>';
  container.innerHTML = html;
  // Fetch week totals async
  let token = getToken();
  if (!token) { return; }
  try {
    let res = await fetchWithTimeout(API + '/tracking/nutrition/' + trackingDate, { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (!res.ok) { let wc1 = $('tracking-week-stats'); if (wc1) { wc1.innerHTML = ''; } return; }
    let data = await res.json();
    let wt = data.week_totals || {};
    if (data.targets) { targets = data.targets; }
    let wc2 = $('tracking-week-stats');
    if (!wc2) { return; }
    let wh = '';
    TRACKING_NUTRIENTS.forEach(function(n) {
      wh += buildNutrientRow(n, wt[n.key] || 0, targets[n.goalKey || n.key], false);
    });
    wc2.innerHTML = wh;
  } catch(e) { /* Network or tracking data error */ console.error('[NutriFood] Tracking week fetch error:', e); }
}

function renderDailyNutrition(totals) {
  /* goals check inline */
  let weekNum = getISOWeek();
  let resetDays = daysUntilReset();

  let nutrients = [
    { key: 'calories', label: 'Calories',   unit: 'kcal', weekly: totals.calories || 0, goalKey: 'calories' },
    { key: 'protein',  label: 'Proteine g', unit: 'g',    weekly: totals.protein,  goalKey: 'protein' },
    { key: 'fiber',    label: 'Fibres g',   unit: 'g',    weekly: totals.fiber,    goalKey: 'fiber' },
    { key: 'iron',     label: 'Fer mg',     unit: 'mg',   weekly: totals.iron,     goalKey: 'iron' },
    { key: 'vit_c',    label: 'Vit C mg',   unit: 'mg',   weekly: totals.vit_c,    goalKey: 'vitamin_c' },
    { key: 'calcium',  label: 'Calcium mg', unit: 'mg',   weekly: totals.calcium,  goalKey: 'calcium' },
    { key: 'omega3',   label: 'O-3 g',      unit: 'g',    weekly: totals.omega3,   goalKey: 'omega3' }
  ];

  let html = '<div class="nutri-summary-header">';
  html += '<span class="nutri-summary-title">\uD83D\uDCCA Nutrition — <strong>Semaine ' + weekNum + '</strong></span>';
  html += '<span class="reset-badge" style="cursor:pointer;" onclick="openResetConfirm()">\uD83D\uDD04 Reset dans ' + resetDays + 'j</span>';
  html += '</div>';

  html += '<div class="nutri-stats-row">';
  nutrients.forEach(function(n) {
    let daily = n.weekly / 7;
    let dailyStr = n.unit === 'g' ? (Math.round(daily * 10) / 10) + '' : Math.round(daily) + '';
    html += '<div class="nutri-stat">';
    html += '<span class="ns-value">' + (n.key === 'calories' ? Math.round(n.weekly).toLocaleString() : Math.round(n.weekly)) + '</span>';
    html += '<span class="ns-label">' + n.label + '</span>';
    html += '<span class="ns-daily">' + dailyStr + n.unit + '/j</span>';
    let goalVal = userGoals ? userGoals[n.goalKey || n.key] : null;
    if (goalVal) {
      let dailyTarget = goalVal / 7;
      let pct = dailyTarget > 0 ? Math.round((daily / dailyTarget) * 100) : 0;
      let pctCls = getPctClass(pct);
      html += '<span class="ns-pct ' + pctCls + '">' + pct + '%</span>';
      html += '<div class="nutri-progress"><div class="nutri-progress-fill ' + pctCls + '" style="width:' + Math.min(pct, 100) + '%"></div></div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

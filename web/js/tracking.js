// ─── Tracking module (lazy-loaded) ───

/* global planningSelections, currentMode, trackingDate, trackingSelections, selections, savedSnapshot, trackingSnapshot, trackingWeek, viewMode */

function switchMode(mode) {
  if (mode === currentMode) { return; }
  if (mode === 'tracking') {
    planningSelections = structuredClone(selections);
    currentMode = 'tracking';
    localStorage.setItem('nf-mode', 'tracking');
    trackingDate = getTodayISO();
    document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'tracking'); });
    if (viewMode === 'simple') {
      loadTrackingWeek();
    } else {
      $('tracking-bar').style.display = 'flex';
      loadTrackingDay(trackingDate);
    }
  } else {
    trackingSelections = structuredClone(selections);
    currentMode = 'planning';
    localStorage.setItem('nf-mode', 'planning');
    selections = structuredClone(planningSelections);
    savedSnapshot = JSON.stringify(selections);
    document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'planning'); });
    $('tracking-bar').style.display = 'none';
    render();
    updateSaveBar();
    if (currentUser) { checkSuggestionsBadge(); }
  }
}

async function loadTrackingDay(dateStr) {
  trackingDate = dateStr;
  $('tracking-day-label').textContent = formatDayLabel(dateStr);
  if (!currentUser) { selections = {}; render(); return; }
  let token = getToken();
  if (!token) { selections = {}; render(); return; }
  try {
    let res = await fetchWithTimeout(API + '/tracking/' + dateStr, { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (res.ok) {
      let data = await res.json();
      trackingSelections = data.selections || {};
    } else {
      trackingSelections = {};
    }
  } catch(e) { /* Network or parsing error — non-critical */ console.error('[NutriFood] Tracking load error:', e); trackingSelections = {}; }
  selections = structuredClone(trackingSelections);
  Object.values(selections).forEach(function(arr) { arr.forEach(function(item) { if (!item.qty) { item.qty = 1; } }); });
  trackingSnapshot = JSON.stringify(selections);
  savedSnapshot = trackingSnapshot;
  render();
  updateSaveBar();
}

async function saveTracking() {
  if (!currentUser || currentMode !== 'tracking') { return; }
  let token = getToken();
  if (!token) { return; }
  try {
    await fetchWithTimeout(API + '/tracking/' + trackingDate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ selections: selections })
    }, 10000);
    trackingSelections = structuredClone(selections);
    trackingSnapshot = JSON.stringify(selections);
    savedSnapshot = trackingSnapshot;
    updateSaveBar();
  } catch(e) { /* Network or server error — non-critical */ console.error('[NutriFood] Tracking save error:', e); }
}

// ─── Week-aggregated tracking (simple view) ───

async function loadTrackingWeek() {
  trackingDate = getTodayISO();
  if (!currentUser) { selections = {}; trackingWeek = {}; render(); return; }
  let token = getToken();
  if (!token) { selections = {}; trackingWeek = {}; render(); return; }
  try {
    let res = await fetchWithTimeout(API + '/tracking/week', { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (res.ok) {
      let data = await res.json();
      trackingWeek = data.days || {};
    } else {
      trackingWeek = {};
    }
  } catch(e) { console.error('[NutriFood] Tracking week load error:', e); trackingWeek = {}; }
  // Aggregate all days into single selections for display
  let aggregated = {};
  Object.values(trackingWeek).forEach(function(daySel) {
    if (!daySel || typeof daySel !== 'object') { return; }
    Object.keys(daySel).forEach(function(catId) {
      if (!aggregated[catId]) { aggregated[catId] = []; }
      (daySel[catId] || []).forEach(function(item) {
        let existing = aggregated[catId].find(function(s) { return s.name === item.name; });
        if (existing) {
          existing.qty = (existing.qty || 1) + (item.qty || 1);
        } else {
          aggregated[catId].push({ name: item.name, density: item.density || 0, nutrients: item.nutrients || '', qty: item.qty || 1 });
        }
      });
    });
  });
  selections = aggregated;
  Object.values(selections).forEach(function(arr) { arr.forEach(function(item) { if (!item.qty) { item.qty = 1; } }); });
  trackingSnapshot = JSON.stringify(selections);
  savedSnapshot = trackingSnapshot;
  render();
  updateSaveBar();
}

async function saveTrackingSimple() {
  if (!currentUser || currentMode !== 'tracking') { return; }
  let token = getToken();
  if (!token) { return; }
  let targetDate = (typeof pendingAddDate !== 'undefined' && pendingAddDate) || getTodayISO();
  if (typeof pendingAddDate !== 'undefined') { pendingAddDate = null; }

  // Compute target day's delta: what the aggregate has minus what other days already account for
  let todaySelections = {};
  Object.keys(selections).forEach(function(catId) {
    let items = selections[catId] || [];
    // Count what other days have for each food in this category
    let otherQty = {};
    Object.keys(trackingWeek || {}).forEach(function(d) {
      if (d === targetDate) { return; }
      let dayCat = (trackingWeek?.[d] || {})[catId] || [];
      dayCat.forEach(function(item) {
        otherQty[item.name] = (otherQty[item.name] || 0) + (item.qty || 1);
      });
    });
    // Remaining goes to today
    let todayItems = [];
    items.forEach(function(item) {
      let remaining = (item.qty || 1) - (otherQty[item.name] || 0);
      otherQty[item.name] = Math.max(0, (otherQty[item.name] || 0) - (item.qty || 1));
      if (remaining > 0) {
        todayItems.push({ name: item.name, density: item.density || 0, nutrients: item.nutrients || '', qty: remaining });
      }
    });
    if (todayItems.length > 0) { todaySelections[catId] = todayItems; }
  });

  try {
    await fetchWithTimeout(API + '/tracking/' + targetDate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ selections: todaySelections })
    }, 10000);
    // Update local trackingWeek state
    if (Object.keys(todaySelections).length > 0) {
      trackingWeek[targetDate] = todaySelections;
    } else {
      delete trackingWeek[targetDate];
    }
    trackingSnapshot = JSON.stringify(selections);
    savedSnapshot = trackingSnapshot;
    updateSaveBar();
  } catch(e) { console.error('[NutriFood] Tracking simple save error:', e); }
}

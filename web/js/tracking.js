// ─── Tracking module (lazy-loaded) ───

function switchMode(mode) {
  if (mode === currentMode) return;
  if (mode === 'tracking') {
    planningSelections = structuredClone(selections);
    currentMode = 'tracking';
    localStorage.setItem('nf-mode', 'tracking');
    trackingDate = getTodayISO();
    document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === 'tracking'); });
    $('tracking-bar').style.display = 'flex';
    loadTrackingDay(trackingDate);
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
    if (currentUser) checkSuggestionsBadge();
  }
}

async function loadTrackingDay(dateStr) {
  trackingDate = dateStr;
  $('tracking-day-label').textContent = formatDayLabel(dateStr);
  if (!currentUser) { selections = {}; render(); return; }
  var token = getToken();
  if (!token) { selections = {}; render(); return; }
  try {
    var res = await fetchWithTimeout(API + '/tracking/' + dateStr, { headers: { 'Authorization': 'Bearer ' + token } }, 10000);
    if (res.ok) {
      var data = await res.json();
      trackingSelections = data.selections || {};
    } else {
      trackingSelections = {};
    }
  } catch(e) { console.error('[NutriFood] Tracking load error:', e); trackingSelections = {}; }
  selections = structuredClone(trackingSelections);
  Object.values(selections).forEach(function(arr) { arr.forEach(function(item) { if (!item.qty) item.qty = 1; }); });
  trackingSnapshot = JSON.stringify(selections);
  savedSnapshot = trackingSnapshot;
  render();
  updateSaveBar();
}

async function saveTracking() {
  if (!currentUser || currentMode !== 'tracking') return;
  var token = getToken();
  if (!token) return;
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
  } catch(e) { console.error('[NutriFood] Tracking save error:', e); }
}

// ─── Search module ───

/* global searchActiveIndex, activeTab */
let searchTimer = null;
function performSearch() {
 clearTimeout(searchTimer);
 searchTimer = setTimeout(actualSearch, 150);
}

function handleSearchKeydown(e) {
 let results = $('search-results');
 if (!results.classList.contains('visible')) { return; }
 let items = results.querySelectorAll('.search-result[data-cat]');
 if (items.length === 0) { return; }

 if (e.key === 'ArrowDown') {
 e.preventDefault();
 searchActiveIndex = Math.min(searchActiveIndex + 1, items.length - 1);
 updateSearchActive(items);
 } else if (e.key === 'ArrowUp') {
 e.preventDefault();
 searchActiveIndex = Math.max(searchActiveIndex - 1, 0);
 updateSearchActive(items);
 } else if (e.key === 'Enter') {
 e.preventDefault();
 if (searchActiveIndex >= 0 && items[searchActiveIndex]) {
 items[searchActiveIndex].click();
 }
 } else if (e.key === 'Escape') {
 $('search-input').value = '';
 results.classList.remove('visible');
 searchActiveIndex = -1;
 }
}

function updateSearchActive(items) {
 items.forEach(function(el, i) {
 el.classList.toggle('search-result-active', i === searchActiveIndex);
 });
 // Scroll active item into view
 if (searchActiveIndex >= 0 && items[searchActiveIndex]) {
 items[searchActiveIndex].scrollIntoView({ block: 'nearest' });
 }
}

function findFoodMatches(query) {
 let matches = [];
 DATA.categories.forEach(function(cat) {
 cat.foods.forEach(function(f) {
 if (normalizeForSearch(f.name).includes(query)) {
 matches.push({ cat: cat, food: f });
 } else if (Array.isArray(f?.aliases)) {
 for (let alias of f.aliases) {
 if (normalizeForSearch(alias).includes(query)) {
 matches.push({ cat: cat, food: f });
 break;
 }
 }
 }
 });
 });
 return matches;
}

function actualSearch() {
 let rawQuery = $('search-input').value.trim();
 let query = normalizeForSearch(rawQuery);
 let results = $('search-results');
 searchActiveIndex = -1;
 if (query.length < 2) { results.classList.remove('visible'); results.innerHTML = ''; return; }
 let matches = findFoodMatches(query);
 if (matches.length === 0) {
 results.innerHTML = '<div class="search-result"><span class="sr-meta">Aucun résultat</span></div>';
 } else {
 results.innerHTML = matches.slice(0, 20).map(function(m) {
 let aliasInfo = '';
 if (m.food.aliases?.length > 0) { aliasInfo = ' <span style="color:var(--text-dim);font-size:0.75rem;">(' + esc(m.food.aliases.slice(0, 3).join(', ')) + '</span>'; }
 return '<div class="search-result" data-cat="' + m.cat.id + '" data-name="' + esc(m.food.name) + '" data-density="' + m.food.density + '" data-nutrients="' + esc(m.food.nutrients) + '"><div><div class="sr-name">' + esc(m.food.name) + aliasInfo + '</div><div class="sr-cat">' + m.cat.icon + ' ' + m.cat.name + '</div></div><div class="sr-density">' + m.food.density + '%</div></div>';
 }).join('');
 // Wire up result clicks
 results.querySelectorAll('.search-result[data-cat]').forEach(function(el) {
 el.addEventListener('click', function() {
 let catId = el.dataset.cat;
 var foodData = { name: decodeEntities(el.dataset.name), density: Number.parseInt(el.dataset.density), nutrients: decodeEntities(el.dataset.nutrients) };
 if (currentMode === 'tracking' && typeof viewMode !== 'undefined' && viewMode === 'simple') {
 addSimpleFood(catId, foodData.name, foodData.density, foodData.nutrients);
 } else {
 addItem(catId, foodData);
 }
 // Switch to that tab
 let cat = DATA.categories.find(function(c) { return c.id === catId; });
 if (cat) { activeTab = cat.section; render(); }
 $('search-input').value = '';
 results.classList.remove('visible');
 });
 });
 }
 results.classList.add('visible');

 // Extended search: query CNF database (5993 foods) if we have few local results
 if (matches.length < 5 && rawQuery.length >= 3) {
 fetchExtendedResults(rawQuery, results);
 }
}

// ─── Extended CNF search (#33) ───
let _cnfSearchTimer = null;
function fetchExtendedResults(query, resultsDiv) {
 clearTimeout(_cnfSearchTimer);
 _cnfSearchTimer = setTimeout(async function() {
 try {
 let res = await fetchWithTimeout(API + '/cnf/search?q=' + encodeURIComponent(query), {}, 5000);
 if (!res.ok) { return; }
 let data = await res.json();
 let cnfResults = data.results || [];
 if (cnfResults.length === 0) { return; }

 // Filter out foods already in NutriFood
 let localNames = new Set();
 DATA.categories.forEach(function(cat) {
 cat.foods.forEach(function(f) { localNames.add(f.name.toLowerCase()); });
 });
 cnfResults = cnfResults.filter(function(r) {
 return !localNames.has((r.name_fr || '').toLowerCase()) && !r.already_visible;
 });
 if (cnfResults.length === 0) { return; }

 // Append extended section
 let existingExtended = resultsDiv.querySelector('.cnf-section');
 if (existingExtended) { existingExtended.remove(); }

 let section = document.createElement('div');
 section.className = 'cnf-section';
 section.style.cssText = 'border-top:1px solid var(--border);margin-top:4px;padding-top:4px;';
 let label = document.createElement('div');
 label.style.cssText = 'font-size:0.7rem;color:var(--text-dim);padding:4px 8px;text-transform:uppercase;letter-spacing:0.5px;';
 label.textContent = '📚 Base de données canadienne (' + cnfResults.length + ')';
 section.appendChild(label);

 cnfResults.slice(0, 10).forEach(function(r) {
 let div = document.createElement('div');
 div.className = 'search-result cnf-result';
 div.dataset.foodId = r.food_id;
 let name = r.name_fr || r.name_en || 'Inconnu';
 let group = r.group_fr || '';
 div.innerHTML = '<div><div class="sr-name">' + esc(name) + '</div><div class="sr-cat" style="color:var(--text-dim);">' + esc(group) + '</div></div><div class="sr-meta" style="font-size:0.7rem;color:var(--text-dim);">📋</div>';
 div.addEventListener('click', function() {
 showCNFProduct(r.food_id, name);
 $('search-input').value = '';
 resultsDiv.classList.remove('visible');
 });
 section.appendChild(div);
 });
 resultsDiv.appendChild(section);
 } catch(e) { /* CNF search is best-effort */ }
 }, 300);
}

async function showCNFProduct(foodId, name) {
 let overlay = document.createElement('div');
 overlay.className = 'modal-overlay';
 overlay.innerHTML = '<div class="modal" style="max-width:420px;"><h2>📋 ' + esc(name) + '</h2><p class="loading">Chargement…</p><div style="text-align:center;margin-top:12px;"><button class="auth-btn outline" id="cnf-close">Fermer</button></div></div>';
 document.body.appendChild(overlay);
 overlay.querySelector('#cnf-close').addEventListener('click', function() { overlay.remove(); });
 overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.remove(); } });

 try {
 let headers = {};
 let res = await fetchWithTimeout(API + '/cnf/product/' + foodId, { headers: headers }, 8000);
 if (!res.ok) { overlay.querySelector('.loading').textContent = 'Erreur de chargement'; return; }
 let data = await res.json();
 let food = data.food || {};
 let nutrients = data.nutrients || [];

 let html = '<div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:8px;">' + esc(data.group?.name_fr || '') + '</div>';
 if (nutrients.length > 0) {
 html += '<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Valeurs nutritionnelles (par 100g)</div>';
 html += '<div style="display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:0.82rem;max-height:300px;overflow-y:auto;">';
 nutrients.slice(0, 25).forEach(function(n) {
 html += '<div>' + esc(n.name_fr) + '</div><div style="text-align:right;color:var(--text);">' + (n.amount || 0) + ' ' + esc(n.unit || '') + '</div>';
 });
 html += '</div>';
 } else {
 html += '<p style="color:var(--text-dim);">Aucune donnée nutritionnelle disponible.</p>';
 }
 let content = overlay.querySelector('.loading');
 if (content) {
 let wrapper = document.createElement('div');
 wrapper.innerHTML = html;
 content.replaceWith(wrapper);
 }
 } catch(e) {
 let content = overlay.querySelector('.loading');
 if (content) { content.textContent = 'Erreur: ' + e.message; }
 }
}

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
      if (m.food.aliases?.length > 0) { aliasInfo = ' <span style="color:var(--text-dim);font-size:0.75rem;">(' + esc(m.food.aliases.slice(0, 3).join(', ')) + ')</span>'; }
      return '<div class="search-result" data-cat="' + m.cat.id + '" data-name="' + esc(m.food.name) + '" data-density="' + m.food.density + '" data-nutrients="' + esc(m.food.nutrients) + '"><div><div class="sr-name">' + esc(m.food.name) + aliasInfo + '</div><div class="sr-cat">' + m.cat.icon + ' ' + m.cat.name + '</div></div><div class="sr-density">' + m.food.density + '%</div></div>';
    }).join('');
    // Wire up result clicks
    results.querySelectorAll('.search-result[data-cat]').forEach(function(el) {
      el.addEventListener('click', function() {
        addItem(el.dataset.cat, { name: el.dataset.name.decodeEntities(), density: Number.parseInt(el.dataset.density), nutrients: el.dataset.nutrients.decodeEntities() });
        // Switch to that tab
        let cat = DATA.categories.find(function(c) { return c.id === el.dataset.cat; });
        if (cat) { activeTab = cat.section; render(); }
        $('search-input').value = '';
        results.classList.remove('visible');
      });
    });
  }
  results.classList.add('visible');
}

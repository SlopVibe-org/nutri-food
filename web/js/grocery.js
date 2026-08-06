// ─── Grocery module (lazy-loaded) ───

function findBestDeal(itemName) {
  let itemDeals = DEALS[itemName];
  if (!itemDeals?.length) { return null; }
  return itemDeals.slice().sort(function(a, b) { return (a.price || 0) - (b.price || 0); })[0];
}

function buildGroceryItem(item, cat, month) {
  let food = cat.foods.find(function(f) { return f.name === item.name; });
  let icon = cat.icon;
  let seasonIcon = getSeasonIcon(food, month);
  if (seasonIcon) { icon = seasonIcon + ' ' + icon; }
  let dealInfo = findBestDeal(item.name);
  return {
    name: item.name,
    qty: item.qty || 1,
    cat: cat.name,
    icon: icon,
    dealInfo: dealInfo
  };
}

function collectGroceryItems(grocerySelections, month) {
  let items = [];
  let dealTotal = 0;
  let dealCount = 0;
  Object.keys(grocerySelections).forEach(function(catId) {
    let cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) { return; }
    grocerySelections[catId].forEach(function(item) {
      let entry = buildGroceryItem(item, cat, month);
      if (entry.dealInfo) {
        dealTotal += (entry.dealInfo.price || 0) * entry.qty;
        dealCount++;
      }
      items.push(entry);
    });
  });
  items.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { items: items, dealTotal: dealTotal, dealCount: dealCount };
}

function renderGroceryItemsHTML(items, dealCount, dealTotal) {
  let container = $('grocery-items');
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px;">Aucun aliment sélectionné.</p>';
    return;
  }
  // Build items
  items.forEach(function(item) {
    let dealHtml = '';
    if (item.dealInfo) {
      let d = item.dealInfo;
      let storeInfo = STORE_META[d.store] || {};
      let color = storeInfo.color || '#666';
      let storeName = storeInfo.name || d.store || '?';
      let letter = storeName.charAt(0).toUpperCase();
      let link = d.link || '#';
      dealHtml = ' <a class="gi-deal" href="' + esc(link) + '" target="_blank" rel="noopener" title="' + esc(d.name || '') + '">🏷️ <span class="grocery-deal-store-badge" style="background:' + color + ';">' + letter + '</span>' + (d.price || '') + '$ ' + esc(storeName) + '</a>';
    }
    let div = document.createElement('div');
    div.className = 'grocery-item';
    div.dataset.name = item.name;
    div.dataset.qty = item.qty;
    div.innerHTML = '<input type="checkbox"><span class="gi-name">' + item.icon + ' ' + esc(item.name) + dealHtml + '</span><span class="gi-qty">' + (item.qty > 1 ? '×' + item.qty : '') + '</span>';
    container.appendChild(div);
  });
  // Deal total (appendChild, NOT innerHTML +=)
  if (dealCount > 0) {
    let totalDiv = document.createElement('div');
    totalDiv.className = 'grocery-total';
    totalDiv.innerHTML = '<div class="gt-amount">Total estimé: ' + dealTotal.toFixed(2) + '$</div><div class="gt-note">Prix indicatifs selon les circulaires actuelles</div>';
    container.appendChild(totalDiv);
  }
  // Wire checkboxes (after all DOM is built)
  container.querySelectorAll('.grocery-item input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      let item = this.closest('.grocery-item');
      item.classList.toggle('checked', this.checked);
      // Move checked items to bottom (but before grocery-total if it exists)
      let total = container.querySelector('.grocery-total');
      if (this.checked) {
        if (total) { container.insertBefore(item, total); }
        else { container.appendChild(item); }
      } else {
        // Move unchecked back up (before first checked item)
        let firstChecked = container.querySelector('.grocery-item.checked');
        if (firstChecked) {
          container.insertBefore(item, firstChecked);
        }
      }
    });
  });
}

function wireGroceryButtons() {
  let shareBtn = $('grocery-share-btn');
  if (shareBtn) {
    shareBtn.onclick = async function() {
      let origText = shareBtn.textContent;
      shareBtn.disabled = true; shareBtn.textContent = '⏳…';
      try {
        let res = await fetchWithTimeout(API + '/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, 10000);
        let data = await res.json();
        if (res.ok && data.share_url) {
          shareBtn.textContent = '✓ Lien copié!';
          navigator.clipboard.writeText(data.share_url);
          showToast('Lien copié!', 'success');
          setTimeout(function() { shareBtn.textContent = origText; }, 2000);
        } else {
          showToast('Erreur de partage', 'error');
          shareBtn.textContent = origText;
        }
      } catch(e) { console.error('[NutriFood] Grocery share error:', e); showToast('Erreur: ' + e.message, 'error'); shareBtn.textContent = origText; }
      shareBtn.disabled = false;
    };
  }

  let clearBtn = $('grocery-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = function() {
      let container = $('grocery-items');
      let checked = container.querySelectorAll('.grocery-item.checked');
      if (checked.length === 0) { showToast('Aucun item coché', 'info'); return; }
      checked.forEach(function(el) { el.remove(); });
      showToast(checked.length + ' item' + (checked.length > 1 ? 's' : '') + ' retiré' + (checked.length > 1 ? 's' : ''), 'success');
    };
  }

  let printBtn = $('grocery-print-btn');
  if (printBtn) {
    printBtn.onclick = function() {
      let container = $('grocery-items');
      let groceryItems = container.querySelectorAll('.grocery-item');
      let date = new Date().toLocaleDateString('fr-CA');

      // Build a standalone HTML document in a hidden iframe for clean printing
      let itemsHtml = '';
      groceryItems.forEach(function(el) {
        let name = el.dataset.name || '';
        let qty = el.dataset.qty && el.dataset.qty !== '1' ? '×' + el.dataset.qty : '';
        let isChecked = el.classList.contains('checked');
        let rowStyle = isChecked ? 'text-decoration:line-through;color:#999;' : '';
        let cbStyle = isChecked ? 'background:#000;' : '';
        itemsHtml += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #ccc;' + rowStyle + '">';
        itemsHtml += '<div style="width:14px;height:14px;border:1.5px solid #000;border-radius:2px;flex-shrink:0;' + cbStyle + '"></div>';
        itemsHtml += '<span>' + esc(name) + '</span>';
        if (qty) { itemsHtml += '<span style="margin-left:auto;font-weight:600;">' + qty + '</span>'; }
        itemsHtml += '</div>';
      });

      let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
      html += '<style>';
      html += 'body { font-family: Helvetica, Arial, sans-serif; font-size:12pt; line-height:1.6; color:#000; background:#fff; padding:20px; margin:0; }';
      html += 'h1 { font-size:16pt; margin:0 0 4px; }';
      html += '.date { font-size:10pt; color:#555; margin-bottom:16px; }';
      html += '@media print { body { padding:0; } }';
      html += '</style></head><body>';
      html += '<h1>Liste d\'épicerie</h1>';
      html += '<div class="date">' + date + '</div>';
      html += itemsHtml;
      html += '</body></html>';

      let iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      iframe.onload = function() {
        iframe.contentWindow.onafterprint = function() {
          document.body.removeChild(iframe);
        };
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      };

      iframe.srcdoc = html;
    };
  }
}

function showGroceryList() {
  // Use planning selections by default, or tracking selections if in tracking mode
  let sourceMode = currentMode === 'tracking' ? 'tracking' : 'planning';
  let grocerySelections = sourceMode === 'tracking' ? trackingSelections : (planningSelections || {});

  // If tracking selections are empty but planning has data, offer planning as fallback
  let hasTrackingData = Object.keys(grocerySelections).length > 0 &&
    Object.values(grocerySelections).some(function(items) { return items && items.length > 0; });
  if (!hasTrackingData && planningSelections && Object.keys(planningSelections).length > 0) {
    grocerySelections = planningSelections;
    sourceMode = 'planning';
  }

  let month = new Date().getMonth() + 1;
  let result = collectGroceryItems(grocerySelections, month);

  // Update title to show source
  let titleEl = document.querySelector('#grocery-overlay h2, #grocery-overlay .grocery-title');
  if (titleEl) {
    let sourceLabel = sourceMode === 'tracking' ? 'Suivi' : 'Planification';
    titleEl.textContent = '🛒 Liste d\'épicerie (' + sourceLabel + ')';
  }

  renderGroceryItemsHTML(result.items, result.dealCount, result.dealTotal);
  wireGroceryButtons();

  $('grocery-overlay').classList.remove('hidden');
}

function copyGroceryList() {
  let lines = [];
  // Match the same logic as showGroceryList
  let grocerySelections = (currentMode === 'tracking' && Object.keys(trackingSelections).length > 0) ? trackingSelections : (planningSelections || {});
  Object.keys(grocerySelections).forEach(function(catId) {
    let cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) { return; }
    grocerySelections[catId].forEach(function(item) {
      let qty = item.qty > 1 ? ' x' + item.qty : '';
      lines.push(item.name + qty);
    });
  });
  lines.sort(function(a, b) { return a.localeCompare(b); });
  let text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    let btn = $('grocery-copy-btn');
    btn.textContent = '✓ Copié!';
    setTimeout(function() { btn.textContent = '📋 Copier'; }, 2000);
  });
}

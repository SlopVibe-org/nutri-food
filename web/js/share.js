// ─── Share module (lazy-loaded) ───

// Share link generation is handled in grocery.js wireGroceryButtons

async function loadSharedView(shareToken) {
  try {
    let res = await fetch(API + '/shared/' + shareToken);
    if (!res.ok) { renderWelcome(); return; }
    let data = await res.json();
    let items = data.grocery || [];

    $('user-area').innerHTML = '<span class="user-name" style="color:var(--accent);">🛒 Liste de ' + esc(data.user_name || '') + '</span>';
    $('search-bar-container').style.display = 'none';

    if (items.length === 0) {
      $('app').innerHTML = '<div class="welcome"><h2>🛒 Liste vide</h2><p style="color:var(--text-dim);">Aucun aliment dans cette liste.</p></div>';
      return;
    }

    let html = '<div style="max-width:500px;margin:0 auto;">';
    html += '<div style="margin-bottom:16px;"><h2 style="color:var(--accent);font-size:1.3rem;">🛒 Liste d\'épicerie</h2>';
    html += '<p style="color:var(--text-dim);font-size:0.9rem;">' + items.length + ' article(s) — cliquez pour cocher</p></div>';
    items.forEach(function(item) {
      let qtyLabel = item.qty > 1 ? ' <span class="gi-qty">×' + item.qty + '</span>' : '';
      html += '<div class="grocery-item"><input type="checkbox"><span class="gi-name">' + item.icon + ' ' + esc(item.name) + '</span>' + qtyLabel + '</div>';
    });
    html += '</div>';
    $('app').innerHTML = html;

    // Wire checkboxes
    $('app').querySelectorAll('.grocery-item input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        this.closest('.grocery-item').classList.toggle('checked', this.checked);
      });
    });

    $('save-bar').classList.remove('visible');
  } catch(e) { console.error('[NutriFood] Share load error:', e); renderWelcome(); }
}

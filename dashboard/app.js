// Token Launch Radar — the board page. Renders window.RADAR (written beside
// this page as ../data.js by main.ts), wires the filters and the sort, and
// opens a per-protocol detail view with the model's working shown.
//
// Deep links double as the screenshot rig: ?detail=<slug> opens that
// protocol's detail, ?watchlist=1, ?category=<name>, ?chain=<name>,
// ?q=<text> and ?sort=<key> preset the controls.

(function () {
  'use strict';
  var data = window.RADAR;
  if (!data) return;

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows');
  var detailEl = $('detail');
  var state = { q: '', category: '', chain: '', sort: 'rank', watch: false, detail: null };

  function money(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v;
  }

  function pct(v) {
    if (v === null || v === undefined) return '<span class="why">n/a</span>';
    var cls = v >= 0 ? 'up' : 'down';
    var sign = v >= 0 ? '+' : '−';
    return '<span class="' + cls + '">' + sign + Math.abs(v).toFixed(1) + '%</span>';
  }

  function years(days) {
    if (days === null || days === undefined) return '—';
    return (days / 365).toFixed(1) + 'y';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Header and summary strip.
  $('meta-line').textContent =
    'Snapshot ' + data.as_of + ' · ' + data.source + '. ' + data.counts.protocols +
    ' protocols read; the watchlist floor is ' + money(data.floor_usd) + ' of TVL. Model ' +
    data.model_version + ' — every number below is computed, none is looked up by name.';
  $('stats').innerHTML =
    '<div class="stat hot"><b>' + data.counts.ranked + '</b><span>pre-token protocols ranked</span></div>' +
    '<div class="stat"><b>' + data.counts.watchlist + '</b><span>on the house watchlist, all covered</span></div>' +
    '<div class="stat"><b>' + data.counts.live + '</b><span>already trading, set aside unranked</span></div>' +
    '<div class="stat"><b>' + data.counts.products + '</b><span>products of trading tokens, set aside</span></div>' +
    '<div class="stat hot"><b>' + money(data.rows.length ? data.rows[0].implied_value_usd : 0) + '</b><span>top implied value on the board</span></div>';

  // Filter option lists, from the data itself.
  var cats = {}, chains = {};
  data.rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('f-category').appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('f-chain').appendChild(o);
  });

  function growthKey(r) {
    // A reported 0.0% is a real value, not a missing one: only null sinks.
    return r.change_7d === null || r.change_7d === undefined ? -Infinity : r.change_7d;
  }

  function visible() {
    var out = data.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q && r.name.toLowerCase().indexOf(state.q.toLowerCase()) < 0) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return growthKey(b) - growthKey(a); },
      age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
      multiple: function (a, b) { return b.multiple - a.multiple; },
    };
    return out.sort(by[state.sort] || by.rank);
  }

  function render() {
    var list = visible();
    $('row-count').textContent = 'Showing ' + list.length + ' of ' + data.rows.length + ' ranked protocols';
    $('empty').hidden = list.length !== 0;
    rowsEl.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" aria-selected="' + (state.detail === r.slug) + '">' +
        '<td class="num rank">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' +
        (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<span class="pcat">' + esc(r.category || 'Uncategorised') + ' · ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</span></td>' +
        '<td class="num money">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + years(r.age_days) + '</td>' +
        '<td class="why">' + esc(r.signal) + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call(rowsEl.querySelectorAll('tr'), function (tr) {
      tr.tabIndex = 0;
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail(tr.getAttribute('data-slug'));
        }
      });
    });
  }

  function bar(label, value, widthPct, teal, display) {
    return '<div class="bar-row"><span>' + label + '</span>' +
      '<div class="bar' + (teal ? ' teal' : '') + '"><i style="width:' + Math.max(3, Math.min(100, widthPct)) + '%"></i></div>' +
      '<b>' + display + '</b></div>';
  }

  function openDetail(slug) {
    var r = null;
    data.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.detail = slug;
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var anchor = r.peers > 0
      ? 'The ' + (r.category || 'uncategorised') + ' multiple is the median of ' + r.peers +
        ' trading peer' + (r.peers === 1 ? '' : 's') + ', shrunk toward the snapshot-wide ×' +
        data.global_multiple.toFixed(2) + '.'
      : 'No ' + (r.category || 'uncategorised') + ' protocol in the snapshot trades yet, so the ' +
        'multiple is the snapshot-wide median ×' + data.global_multiple.toFixed(2) + ' itself.';
    var neutral = '';
    if (r.change_7d === null) neutral += ' No seven-day change is reported, so the growth factor is a neutral ×1.00.';
    if (r.listed_at === null) neutral += ' No tracking date is reported, so the maturity factor is a neutral ×1.00.';
    detailEl.innerHTML =
      '<div class="detail-head"><h2>' + esc(r.name) + '</h2>' +
      '<span class="money">' + money(r.implied_value_usd) + '</span>' +
      '<span class="sub">implied value · rank #' + r.rank + ' of ' + data.rows.length +
      (r.watchlist ? ' · on the house watchlist' : '') + '</span>' +
      '<button class="detail-close" id="detail-close" type="button">Close ✕</button></div>' +
      '<div class="detail-grid"><div>' +
      '<h3>The snapshot record</h3>' +
      '<dl class="facts">' +
      '<dt>Category</dt><dd>' + esc(r.category || 'Uncategorised') + '</dd>' +
      '<dt>TVL</dt><dd class="money">' + money(r.tvl_usd) + '</dd>' +
      '<dt>7-day TVL</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Chains</dt><dd>' + r.chains.map(esc).join(', ') + '</dd>' +
      '<dt>Tracked since</dt><dd>' + (r.listed_at || 'not reported') +
      (r.age_days !== null ? ' (' + years(r.age_days) + ' with no token recorded)' : '') + '</dd>' +
      '<dt>Token</dt><dd>none recorded in the snapshot</dd>' +
      '</dl>' +
      '<h3>How the value is built</h3>' +
      bar('TVL base', r.tvl_usd, 100 * Math.log10(Math.max(10, r.tvl_usd)) / 11, true, money(r.tvl_usd)) +
      bar('Category multiple', r.multiple, 100 * r.multiple / 2.5, false, '×' + r.multiple.toFixed(2)) +
      bar('Growth factor', r.growth_factor, 100 * (r.growth_factor - 0.8) / 0.8, false, r.change_7d === null ? '×1.00 n/a' : '×' + r.growth_factor.toFixed(2)) +
      bar('Maturity factor', r.maturity_factor, 100 * (r.maturity_factor - 1) / 0.3, false, '×' + r.maturity_factor.toFixed(2)) +
      '<p class="formula">= ' + money(r.tvl_usd) + ' × ' + r.multiple.toFixed(2) + ' × ' + r.growth_factor.toFixed(2) +
      ' × ' + r.maturity_factor.toFixed(2) + ' → <strong>' + money(r.implied_value_usd) + '</strong>. ' + esc(r.signal) + '. ' +
      anchor + neutral + '</p>' +
      '</div><div>' +
      '<h3>How to farm it</h3><ol class="steps">' + steps + '</ol>' +
      '</div></div>';
    detailEl.hidden = false;
    $('detail-close').addEventListener('click', function () {
      state.detail = null;
      detailEl.hidden = true;
      render();
    });
    render();
    detailEl.scrollIntoView({ block: 'start' });
  }

  // House watchlist panel: every watchlist protocol, in board rank order.
  var watchRows = data.rows.filter(function (r) { return r.watchlist; });
  watchRows.sort(function (a, b) { return a.rank - b.rank; });
  $('watchlist').innerHTML = watchRows.map(function (r) {
    return '<li data-slug="' + esc(r.slug) + '" tabindex="0"><span class="wrank">#' + r.rank + '</span>' +
      '<span class="wname">' + esc(r.name) + '</span><b>' + money(r.implied_value_usd) + '</b></li>';
  }).join('');
  Array.prototype.forEach.call($('watchlist').querySelectorAll('li'), function (li) {
    var open = function () { openDetail(li.getAttribute('data-slug')); };
    li.addEventListener('click', open);
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  // Category multiples table: the market anchors behind every price.
  $('multiples').innerHTML = data.multiples.map(function (m) {
    return '<tr' + (m.peers === 0 ? ' class="fallback"' : '') + '><td>' + esc(m.category) + '</td>' +
      '<td class="num">' + (m.peers === 0 ? 'none' : m.peers) + '</td>' +
      '<td class="num">×' + m.multiple.toFixed(3) + '</td></tr>';
  }).join('') +
    '<tr class="global"><td>Snapshot-wide median (fallback)</td><td class="num">all</td>' +
    '<td class="num">×' + data.global_multiple.toFixed(3) + '</td></tr>';

  // Already-live strip and set-aside list.
  $('live').innerHTML = data.live.map(function (p) {
    return '<li><span>' + esc(p.name) + ' <span class="sym">' + esc(p.symbol || '') + '</span></span>' +
      '<b>' + money(p.mcap_usd) + ' mcap</b></li>';
  }).join('');
  $('excluded').innerHTML = data.excluded.map(function (p) {
    return '<li><span>' + esc(p.name) + '</span><span class="reason">' + esc(p.reason) + '</span></li>';
  }).join('');
  $('foot-line').textContent =
    'Implied values are this board\'s own claims, computed from the snapshot of ' + data.as_of +
    ' — not a prediction that any token will be issued, or when. Farm plans carry real smart-contract and market risk; sizes are learning positions, not advice.';

  // Controls.
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  $('f-category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  $('f-watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });

  // Deep links (also the screenshot rig).
  var params = new URLSearchParams(location.search);
  if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
  if (params.get('category')) { state.category = params.get('category'); $('f-category').value = state.category; }
  if (params.get('chain')) { state.chain = params.get('chain'); $('f-chain').value = state.chain; }
  if (params.get('sort')) { state.sort = params.get('sort'); $('f-sort').value = state.sort; }
  if (params.get('watchlist') === '1') { state.watch = true; $('f-watch').checked = true; }
  render();
  if (params.get('detail')) openDetail(params.get('detail'));
})();

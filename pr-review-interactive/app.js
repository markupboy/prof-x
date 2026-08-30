/* pr-review-interactive client.
 *
 * Renders findings from /api/state (review.json, polled every second with an
 * ETag), shows the anchored diff hunk from /api/patches, and sends user actions
 * to /api/message. A finding stays "pending" until the state file reports
 * lastHandledMessageId >= the id the server assigned to that message.
 */
(function () {
  'use strict';

  var POLL_MS = 1000;
  var STALE_MS = 5 * 60 * 1000;
  var SEVERITIES = ['Critical', 'Important', 'Suggestion'];

  var state = null;          // parsed review.json
  var patches = {};          // path -> unified patch
  var etag = null;
  var pending = {};          // key (finding id or 'global') -> {id, label, at}
  var cardCache = {};        // finding id -> JSON string of last rendered finding
  var drafts = {};           // finding id -> {mode: 'ask'|'reframe'|'comment'|'post', text}
  var focusedId = null;
  var failures = 0;
  var lastActivityLen = 0;
  var ended = false;
  var filters = { severity: { Critical: true, Important: true, Suggestion: true }, dismissed: false, posted: true };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var h = function (s) { return esc(String(s == null ? '' : s)); };

  // ---------- markdown (small, dependency-free) ----------
  function inline(s) {
    s = h(s);
    s = s.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function md(text) {
    if (!text) return '';
    var lines = String(text).replace(/\r\n/g, '\n').split('\n');
    var out = [], i = 0, para = [];
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    while (i < lines.length) {
      var l = lines[i];
      var fence = l.match(/^```(\w*)/);
      if (fence) {
        flush();
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + h(code.join('\n')) + '</code></pre>');
        continue;
      }
      var hd = l.match(/^(#{1,4})\s+(.*)/);
      if (hd) { flush(); out.push('<h' + (hd[1].length + 1) + '>' + inline(hd[2]) + '</h' + (hd[1].length + 1) + '>'); i++; continue; }
      if (/^\s*[-*]\s+/.test(l)) {
        flush(); var items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + items.join('') + '</ul>'); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(l)) {
        flush(); var oitems = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { oitems.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
        out.push('<ol>' + oitems.join('') + '</ol>'); continue;
      }
      if (/^>\s?/.test(l)) { flush(); out.push('<blockquote>' + inline(l.replace(/^>\s?/, '')) + '</blockquote>'); i++; continue; }
      if (/^\s*$/.test(l)) { flush(); i++; continue; }
      para.push(l); i++;
    }
    flush();
    return '<div class="md">' + out.join('') + '</div>';
  }

  // ---------- transport ----------
  function send(key, msg, label) {
    if (ended) return Promise.resolve();
    return fetch('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); return j; }); })
      .then(function (j) {
        pending[key] = { id: j.id, label: label, at: Date.now() };
        if (key !== 'global') { delete drafts[key]; delete cardCache[key]; }
        render();
      })
      .catch(function (e) { toast('Could not send: ' + e.message, 'err'); });
  }

  function poll() {
    var headers = etag ? { 'If-None-Match': etag } : {};
    fetch('/api/state', { headers: headers, cache: 'no-store' })
      .then(function (r) {
        failures = 0;
        if (r.status === 304) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        etag = r.headers.get('ETag');
        return r.json();
      })
      .then(function (j) { if (j) { state = j; onState(); } })
      .catch(function () {
        failures++;
        if (failures >= 2 && !ended) banner('warn', 'Disconnected from the local server — is the session still running in the terminal?');
      })
      .then(function () { setTimeout(poll, POLL_MS); });
  }

  function onState() {
    var handled = state.lastHandledMessageId || 0;
    Object.keys(pending).forEach(function (k) { if (pending[k].id <= handled) { delete pending[k]; delete cardCache[k]; } });
    if (state.ended) { ended = true; banner('done', 'Session ended. Review exported to ' + (state.exportedTo || 'pr_reviews/') + '.'); }
    else if (failures === 0) hideBanner();
    if (state.activity && state.activity.length > lastActivityLen) {
      if (lastActivityLen > 0) state.activity.slice(lastActivityLen).forEach(function (a) { toast(a.text, a.kind || ''); });
      lastActivityLen = state.activity.length;
    }
    render();
  }

  // ---------- rendering ----------
  function banner(kind, text) { var b = $('#banner'); b.className = 'banner ' + kind; b.textContent = text; b.hidden = false; }
  function hideBanner() { $('#banner').hidden = true; }
  function toast(text, kind) {
    var t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = text;
    $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, 6000);
  }

  function findingById(id) { return (state.findings || []).filter(function (f) { return f.id === id; })[0]; }
  function isQueued(f) { return !!f.queued && f.status !== 'POSTED'; }
  function isWip() { return !!(state.pr && state.pr.isWip); }
  function effStatus(f) { return isQueued(f) ? 'QUEUED' : (f.status || 'OPEN'); }

  function render() {
    if (!state) return;
    renderHeader();
    renderSummary();
    renderActivity();
    renderFilters();
    renderFindings();
    renderQueueBar();
  }

  function renderHeader() {
    var pr = state.pr || {};
    var title = pr.isWip ? ('WIP review · ' + (pr.headSha || '').slice(0, 7)) : ('PR #' + pr.number + ' — ' + (pr.title || ''));
    $('#title').textContent = title;
    document.title = (pr.isWip ? 'WIP ' : '#' + pr.number + ' ') + 'review';
    var meta = [];
    if (pr.url) meta.push('<a href="' + h(pr.url) + '" target="_blank" rel="noopener">' + h(pr.owner + '/' + pr.repo) + '</a>');
    if (pr.headRef) meta.push('<span class="ic">' + h(pr.headRef) + '</span>' + (pr.baseRef ? ' → <span class="ic">' + h(pr.baseRef) + '</span>' : ''));
    if (pr.headSha) meta.push('<span class="ic">' + h(pr.headSha.slice(0, 7)) + '</span>');
    if (pr.additions != null) meta.push('<span class="pill add">+' + h(pr.additions) + '</span><span class="pill del">&minus;' + h(pr.deletions) + '</span><span class="pill files">' + h(pr.changedFiles) + ' files</span>');
    if (state.linear && state.linear.key) meta.push('<a href="' + h(state.linear.url || '#') + '" target="_blank" rel="noopener">' + h(state.linear.key) + '</a>' + (state.linear.state ? ' <span style="color:#666">(' + h(state.linear.state) + ')</span>' : ''));
    if (state.reviewVersion && state.reviewVersion > 1) meta.push('<span>v' + h(state.reviewVersion) + '</span>');
    $('#meta').innerHTML = meta.join('<span style="color:#444">·</span>');
    $('#btn-export').disabled = ended || !!pending.global;
    $('#btn-end').disabled = ended || !!pending.global;
  }

  var summaryOpen = true;
  function renderSummary() {
    var s = state.summary, el = $('#summary');
    if (!s || (!s.description && !state.linear)) { el.hidden = true; return; }
    el.hidden = false;
    var html = '<div class="summary-toggle" data-act="toggle-summary">' + (summaryOpen ? '▾' : '▸') + ' Summary</div>';
    if (summaryOpen) {
      html += md(s.description || '');
      var scores = [];
      if (s.descriptionAccuracy) scores.push('<span><strong>Description accuracy</strong> ' + h(s.descriptionAccuracy) + '</span>');
      if (state.linear && state.linear.alignment) scores.push('<span><strong>Linear alignment</strong> ' + h(state.linear.alignment) + '</span>');
      if (scores.length) html += '<div class="scores">' + scores.join('') + '</div>';
      var cov = s.linearCoverage;
      if (cov) {
        var groups = [['met', 'Met'], ['partial', 'Partial'], ['notMet', 'Not met'], ['outOfScope', 'Out of scope'], ['scopeCreep', 'Scope creep']];
        var cells = groups.filter(function (g) { return cov[g[0]] && cov[g[0]].length; }).map(function (g) {
          return '<div><div class="lbl">' + g[1] + '</div><ul>' + cov[g[0]].map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul></div>';
        });
        if (cells.length) html += '<div class="coverage">' + cells.join('') + '</div>';
      }
    }
    el.innerHTML = html;
  }

  var activityOpen = false;
  function renderActivity() {
    var el = $('#activity');
    el.hidden = !activityOpen;
    $('#btn-activity').classList.toggle('active', activityOpen);
    if (!activityOpen) return;
    var rows = (state.activity || []).slice().reverse().map(function (a) {
      return '<div class="row"><span class="at">' + h((a.at || '').replace('T', ' ').slice(0, 19)) + '</span><span>' + inline(a.text || '') + '</span></div>';
    });
    el.innerHTML = rows.length ? rows.join('') : '<div style="color:#666">No activity yet.</div>';
  }

  function renderFilters() {
    var counts = { Critical: 0, Important: 0, Suggestion: 0 };
    (state.findings || []).forEach(function (f) { if (f.status !== 'DISMISSED' && counts[f.severity] != null) counts[f.severity]++; });
    SEVERITIES.forEach(function (s) {
      var c = $('[data-count="' + s + '"]'); if (c) c.textContent = counts[s];
      var chip = $('.chip[data-value="' + s + '"]'); if (chip) chip.classList.toggle('on', !!filters.severity[s]);
    });
    $('#show-dismissed').checked = filters.dismissed;
    $('#show-posted').checked = filters.posted;
  }

  function visible(f) {
    if (!filters.severity[f.severity]) return false;
    if (f.status === 'DISMISSED' && !filters.dismissed) return false;
    if (f.status === 'POSTED' && !filters.posted) return false;
    return true;
  }

  function renderFindings() {
    var main = $('#findings');
    var list = (state.findings || []).filter(visible);
    var seen = {};
    if (!list.length) {
      main.innerHTML = '<div class="empty">' + ((state.findings || []).length ? 'Nothing matches the current filters.' : 'No findings — clean review.') + '</div>';
      cardCache = {}; return;
    }
    if (main.querySelector('.empty')) main.innerHTML = '';
    var prev = null;
    list.forEach(function (f) {
      seen[f.id] = true;
      var key = JSON.stringify(f) + '|' + JSON.stringify(pending[f.id] || null) + '|' + JSON.stringify(drafts[f.id] || null) + '|' + (focusedId === f.id) + '|' + isWip();
      var node = main.querySelector('.finding-card[data-id="' + f.id + '"]');
      if (!node || cardCache[f.id] !== key) {
        var fresh = buildCard(f);
        if (node) node.replaceWith(fresh); else main.insertBefore(fresh, prev ? prev.nextSibling : main.firstChild);
        node = fresh; cardCache[f.id] = key;
        mountHunk(node, f);
        var ta = node.querySelector('textarea, input[type=text]'); if (ta && drafts[f.id] && drafts[f.id].focus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); drafts[f.id].focus = false; }
      } else if (node.previousSibling !== prev) {
        main.insertBefore(node, prev ? prev.nextSibling : main.firstChild);
      }
      prev = node;
    });
    $$('.finding-card', main).forEach(function (n) { if (!seen[n.getAttribute('data-id')]) { n.remove(); delete cardCache[n.getAttribute('data-id')]; } });
  }

  function anchorText(a) {
    if (!a || !a.path) return '';
    return a.path + (a.startLine ? ':' + a.startLine + (a.endLine && a.endLine !== a.startLine ? '-' + a.endLine : '') : '');
  }

  function buildCard(f) {
    var card = document.createElement('article');
    card.className = 'finding-card' + (focusedId === f.id ? ' focused' : '');
    card.setAttribute('data-id', f.id);
    card.setAttribute('data-severity', f.severity);
    card.setAttribute('data-status', f.status || 'OPEN');
    var st = effStatus(f);
    var p = pending[f.id];
    var html = '';

    html += '<div class="finding-hdr"><span class="finding-idx">#' + h(f.id) + '</span><div class="finding-title">' + inline(f.title || '') + '</div><div class="finding-badges">';
    html += '<select class="sev-select ' + h(f.severity) + '" data-act="severity"' + (f.status === 'POSTED' ? ' disabled' : '') + '>' + SEVERITIES.map(function (s) { return '<option' + (s === f.severity ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
    html += '<span class="status-chip ' + h(st) + '">' + h(st) + '</span>';
    if (f.introduced) html += '<span class="intro-chip">' + h(f.introduced) + '</span>';
    html += '</div></div>';

    var a = f.anchor || {};
    html += '<div class="finding-anchor">';
    if (a.path) html += '<a href="#" data-act="open-gh" title="Open in GitHub">' + h(anchorText(a)) + '</a>';
    var others = (f.files || []).filter(function (x) { return x !== anchorText(a); });
    if (others.length) html += '<span class="files">also: ' + others.map(h).join(', ') + '</span>';
    html += '<span class="nearest" data-role="nearest"></span>';
    html += '<span class="hunk-toggle" data-act="toggle-hunk" style="margin-left:auto">hide diff</span>';
    html += '</div>';
    html += '<div class="hunk" data-role="hunk"></div>';

    html += '<div class="finding-body">' + md(f.details || '');
    if (f.suggestedFix) html += '<div class="subhead">Suggested fix</div>' + md(f.suggestedFix);
    if (f.verification && f.verification.verdict) {
      var v = f.verification;
      var label = { CONFIRMED: 'Confirmed — real issue', FALSE_POSITIVE: 'False positive', UNCERTAIN: 'Uncertain' }[v.verdict] || v.verdict;
      html += '<div class="verification ' + h(v.verdict) + '"><div class="v-hdr">' + h(label);
      if (v.verdict === 'FALSE_POSITIVE' && f.status !== 'DISMISSED') html += '<button class="btn small" data-act="dismiss">Dismiss</button>';
      html += '</div>' + md(v.evidence || '') + '</div>';
    }
    if (f.thread && f.thread.length) {
      html += '<div class="thread">' + f.thread.map(function (m) { return '<div class="msg ' + h(m.role) + '"><div class="who">' + (m.role === 'user' ? 'you' : 'claude') + '</div>' + md(m.text || '') + '</div>'; }).join('') + '</div>';
    }
    if (f.error) html += '<div class="verification UNCERTAIN" style="margin-top:10px"><div class="v-hdr">Last action failed</div>' + md(f.error) + (f.error.indexOf('422') >= 0 && !isWip() && f.status !== 'POSTED' ? '<div style="margin-top:8px"><button class="btn small" data-act="post-file-level">Post as file-level comment instead</button></div>' : '') + '</div>';
    if (f.history && f.history.length) {
      html += '<div class="history"><details><summary>' + f.history.length + ' earlier version' + (f.history.length > 1 ? 's' : '') + '</summary>' + f.history.map(function (x) {
        return '<div class="h-item"><div class="h-meta">' + h(x.at || '') + (x.reason ? ' · ' + h(x.reason) : '') + '</div><div><strong>' + inline(x.title || '') + '</strong></div>' + md(x.details || '') + '</div>';
      }).join('') + '</details></div>';
    }
    html += '</div>';

    var d = drafts[f.id];
    if (d && d.mode === 'ask') {
      html += '<div class="inline-form"><span class="lbl">Ask Claude about this finding</span><textarea data-role="draft" placeholder="e.g. Is this guarded by the caller? What would the fix look like?">' + h(d.text || '') + '</textarea><button class="btn primary" data-act="send-ask">Ask</button><button class="btn ghost" data-act="cancel">Cancel</button></div>';
    } else if (d && d.mode === 'reframe') {
      html += '<div class="inline-form"><span class="lbl">How should this be reframed?</span><div class="chips">' + ['softer', 'as a question', 'shorter', 'more specific', 'for a junior author', 'lead with the fix'].map(function (c) { return '<button class="chip" data-act="chip">' + c + '</button>'; }).join('') + '</div><input type="text" data-role="draft" placeholder="or type an instruction" value="' + h(d.text || '') + '"><button class="btn primary" data-act="send-reframe">Reframe</button><button class="btn ghost" data-act="cancel">Cancel</button></div>';
    } else if (d && (d.mode === 'comment' || d.mode === 'post')) {
      html += '<div class="inline-form comment-editor"><span class="lbl">' + (d.mode === 'post' ? 'Comment to post now at ' : 'Comment to queue for the review at ') + '<b>' + h(anchorText(a)) + '</b></span><textarea data-role="draft">' + h(d.text || '') + '</textarea>';
      html += d.mode === 'post' ? '<button class="btn primary" data-act="confirm-post">Post now…</button>' : '<button class="btn primary" data-act="send-queue">' + (isQueued(f) ? 'Update queued comment' : 'Queue for review') + '</button>';
      html += '<button class="btn ghost" data-act="cancel">Cancel</button></div>';
    }

    html += '<div class="actions">';
    if (f.status !== 'POSTED') {
      html += '<button class="btn small" data-act="verify" title="v">Verify</button>';
      html += '<button class="btn small" data-act="reframe">Reframe</button>';
      html += '<button class="btn small" data-act="ask">Ask</button>';
      html += f.status === 'DISMISSED' ? '<button class="btn small" data-act="reopen">Reopen</button>' : '<button class="btn small" data-act="dismiss" title="d">Dismiss</button>';
    } else {
      html += '<button class="btn small" data-act="ask">Ask</button>';
    }
    html += '<span class="spacer"></span>';
    if (f.status === 'POSTED' && f.posted) html += '<span class="posted-link">posted' + (f.posted.url ? ' · <a href="' + h(f.posted.url) + '" target="_blank" rel="noopener">view on GitHub</a>' : '') + '</span>';
    else if (!isWip() && f.status !== 'DISMISSED') {
      html += isQueued(f) ? '<button class="btn small active" data-act="unqueue" title="q">Queued ✓</button><button class="btn small" data-act="edit-queued">Edit</button>' : '<button class="btn small" data-act="queue" title="q">Queue for PR</button>';
      html += '<button class="btn small" data-act="post">Post now</button>';
    }
    html += '</div>';

    if (p) {
      var stale = Date.now() - p.at > STALE_MS;
      html += '<div class="pending-overlay"><div class="pending-box' + (stale ? ' stale' : '') + '">' + (stale ? '' : '<span class="spinner"></span>') + h(stale ? 'No response yet — check the terminal.' : (p.label || 'Working…')) + '</div></div>';
    }
    card.innerHTML = html;
    return card;
  }

  function mountHunk(card, f) {
    var el = card.querySelector('[data-role="hunk"]'), a = f.anchor || {};
    if (!a.path) { el.innerHTML = '<div class="diff-empty">No anchor — this finding is not tied to a specific location.</div>'; return; }
    var patch = patches[a.path];
    if (!patch) { el.innerHTML = '<div class="diff-empty">No diff for <code>' + h(a.path) + '</code> in this PR.</div>'; return; }
    var s = a.startLine || 1, e = a.endLine || s;
    var info = renderHunk(el, patch, s, e);
    var n = card.querySelector('[data-role="nearest"]');
    if (info && info.nearest) n.textContent = '⚠ line ' + s + ' is not in the diff — showing nearest hunk (' + info.distance + ' lines away). GitHub will reject an inline comment here.';
    var row = el.querySelector('tr.diff-anchor');
    if (row) el.scrollTop = Math.max(0, row.offsetTop - 80);
  }

  function renderQueueBar() {
    var q = (state.findings || []).filter(isQueued);
    var bar = $('#queue-bar');
    bar.hidden = !q.length || isWip() || ended;
    $('#queue-count').textContent = q.length + ' queued for the review';
    $('#btn-submit').disabled = !!pending.global;
    $('#btn-submit').textContent = pending.global && pending.global.label ? pending.global.label : 'Submit review…';
  }

  // ---------- GitHub anchor link ----------
  function sha256hex(str) {
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', buf).then(function (d) { return Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); });
  }
  function openOnGitHub(f) {
    var pr = state.pr || {}, a = f.anchor || {};
    if (!pr.url || !a.path) return;
    sha256hex(a.path).then(function (hex) { window.open(pr.url + '/files#diff-' + hex + (a.startLine ? 'R' + a.startLine : ''), '_blank', 'noopener'); });
  }

  // ---------- modals ----------
  function openModal(title, bodyHTML, actions) {
    var root = $('#modal');
    root.innerHTML = '<div class="modal"><div class="modal-hdr">' + h(title) + '</div><div class="modal-body">' + bodyHTML + '</div><div class="modal-ftr">' + actions.map(function (x, i) { return '<button class="btn ' + (x.primary ? 'primary' : '') + '" data-modal-action="' + i + '">' + h(x.label) + '</button>'; }).join('') + '</div></div>';
    root.hidden = false;
    $$('[data-modal-action]', root).forEach(function (b) { b.onclick = function () { var act = actions[parseInt(b.getAttribute('data-modal-action'), 10)]; if (act.onClick(root) !== false) closeModal(); }; });
  }
  function closeModal() { var r = $('#modal'); r.hidden = true; r.innerHTML = ''; }

  function confirmPost(f, body, fileLevel) {
    var pr = state.pr, a = f.anchor || {};
    var where = fileLevel ? a.path + ' (file-level comment)' : anchorText(a);
    openModal('Post inline comment now', '<div class="kv">' + h(pr.owner + '/' + pr.repo) + ' · PR #' + h(pr.number) + ' · <b>' + h(where) + '</b> · commit ' + h((pr.headSha || '').slice(0, 7)) + '</div><textarea data-role="body">' + h(body) + '</textarea><div class="warn">This posts a single review comment on GitHub immediately, attributed to your account.</div>',
      [{ label: 'Cancel', onClick: function () { } }, { label: 'Post to GitHub', primary: true, onClick: function (root) {
        var text = $('[data-role="body"]', root).value.trim();
        if (!text) return false;
        var msg = { type: 'post_one', finding: f.id, body: text, confirmed: true };
        if (fileLevel) msg.allowFileLevel = true;
        send(f.id, msg, 'Posting comment to GitHub…');
      } }]);
  }

  function submitReview() {
    var q = (state.findings || []).filter(isQueued), pr = state.pr;
    if (!q.length) return;
    var items = q.map(function (f) {
      return '<div class="item" data-fid="' + f.id + '"><div class="item-hdr">#' + f.id + ' ' + inline(f.title) + ' <span class="status-chip ' + h(f.severity) + '">' + h(f.severity) + '</span></div><div class="kv"><b>' + h(anchorText(f.anchor)) + '</b></div><textarea data-role="item-body">' + h(defaultComment(f)) + '</textarea></div>';
    }).join('');
    openModal('Submit review to GitHub', '<div class="kv">' + h(pr.owner + '/' + pr.repo) + ' · PR #' + h(pr.number) + ' · commit ' + h((pr.headSha || '').slice(0, 7)) + ' · ' + q.length + ' inline comment' + (q.length > 1 ? 's' : '') + '</div>' +
      '<div class="subhead">Review summary (optional)</div><textarea data-role="review-body" style="min-height:70px" placeholder="Overall notes for the author…"></textarea>' +
      '<div class="radio-row"><label><input type="radio" name="ev" value="COMMENT" checked> Comment</label><label><input type="radio" name="ev" value="REQUEST_CHANGES"> Request changes</label></div>' +
      '<div class="subhead">Inline comments</div>' + items +
      '<div class="warn">One GitHub review is created with all comments below. If GitHub rejects any anchor (line not in the diff), nothing is posted and the queue is kept.</div>',
      [{ label: 'Cancel', onClick: function () { } }, { label: 'Submit review', primary: true, onClick: function (root) {
        var out = $$('.item', root).map(function (n) { return { finding: parseInt(n.getAttribute('data-fid'), 10), body: $('[data-role="item-body"]', n).value.trim() }; });
        if (out.some(function (x) { return !x.body; })) { toast('Every queued comment needs a body.', 'err'); return false; }
        var ev = ($('input[name=ev]:checked', root) || {}).value || 'COMMENT';
        send('global', { type: 'submit_review', items: out, reviewBody: $('[data-role="review-body"]', root).value.trim(), event: ev, confirmed: true }, 'Submitting review…');
      } }]);
  }

  // ---------- actions ----------
  function defaultComment(f) {
    if (f.comment && f.comment.body) return f.comment.body;
    var body = (f.details || '').trim();
    if (f.suggestedFix) body += '\n\n**Suggested fix:** ' + f.suggestedFix.trim();
    return body;
  }
  function setDraft(f, mode, text) { drafts[f.id] = { mode: mode, text: text == null ? '' : text, focus: true }; delete cardCache[f.id]; render(); }
  function readDraft(card) { var el = card.querySelector('[data-role="draft"]'); return el ? el.value.trim() : ''; }

  function act(card, action, target) {
    var id = parseInt(card.getAttribute('data-id'), 10), f = findingById(id);
    if (!f) return;
    focusedId = id;
    switch (action) {
      case 'verify': send(id, { type: 'verify', finding: id }, 'Verifying against the code…'); break;
      case 'reframe': setDraft(f, 'reframe', ''); break;
      case 'ask': setDraft(f, 'ask', ''); break;
      case 'cancel': delete drafts[id]; delete cardCache[id]; render(); break;
      case 'chip': { var t = card.querySelector('[data-role="draft"]'); if (t) { t.value = target.textContent; t.focus(); } break; }
      case 'send-ask': { var q = readDraft(card); if (!q) return; send(id, { type: 'ask', finding: id, question: q }, 'Thinking…'); break; }
      case 'send-reframe': { var ins = readDraft(card); if (!ins) return; send(id, { type: 'reframe', finding: id, instruction: ins }, 'Reframing…'); break; }
      case 'dismiss': send(id, { type: 'set_status', finding: id, status: 'DISMISSED' }, 'Dismissing…'); break;
      case 'reopen': send(id, { type: 'set_status', finding: id, status: 'OPEN' }, 'Reopening…'); break;
      case 'severity': send(id, { type: 'set_severity', finding: id, severity: target.value }, 'Updating severity…'); break;
      case 'queue': case 'edit-queued': setDraft(f, 'comment', defaultComment(f)); break;
      case 'send-queue': { var b = readDraft(card); if (!b) return; send(id, { type: 'queue', finding: id, body: b }, 'Queuing…'); break; }
      case 'unqueue': send(id, { type: 'unqueue', finding: id }, 'Removing from queue…'); break;
      case 'post': setDraft(f, 'post', defaultComment(f)); break;
      case 'confirm-post': { var pb = readDraft(card); if (!pb) return; confirmPost(f, pb, false); break; }
      case 'post-file-level': confirmPost(f, defaultComment(f), true); break;
      case 'open-gh': openOnGitHub(f); break;
      case 'toggle-hunk': { var hk = card.querySelector('[data-role="hunk"]'); hk.classList.toggle('collapsed'); target.textContent = hk.classList.contains('collapsed') ? 'show diff' : 'hide diff'; break; }
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var action = t.getAttribute('data-act');
    if (action === 'toggle-summary') { summaryOpen = !summaryOpen; renderSummary(); return; }
    var card = t.closest('.finding-card');
    if (!card) return;
    if (t.tagName === 'A') e.preventDefault();
    if (t.tagName !== 'SELECT') act(card, action, t);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('.sev-select')) act(t.closest('.finding-card'), 'severity', t);
    if (t.id === 'show-dismissed') { filters.dismissed = t.checked; saveFilters(); render(); }
    if (t.id === 'show-posted') { filters.posted = t.checked; saveFilters(); render(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.matches('[data-role="draft"]')) return;
    var card = t.closest('.finding-card'), id = parseInt(card.getAttribute('data-id'), 10);
    if (drafts[id]) drafts[id].text = t.value;
  });
  document.addEventListener('focusin', function (e) { var c = e.target.closest && e.target.closest('.finding-card'); if (c) focusedId = parseInt(c.getAttribute('data-id'), 10); });
  $('#filters').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip[data-value]'); if (!chip) return;
    var v = chip.getAttribute('data-value'); filters.severity[v] = !filters.severity[v]; saveFilters(); render();
  });
  $('#btn-activity').onclick = function () { activityOpen = !activityOpen; renderActivity(); };
  $('#btn-export').onclick = function () { send('global', { type: 'export' }, 'Exporting…'); };
  $('#btn-end').onclick = function () {
    openModal('End session', '<p>This stops the local server, stops Claude listening to this page, and writes the review markdown to <code>pr_reviews/</code>. Queued-but-unsubmitted comments are kept in the JSON state but are <b>not</b> posted.</p>',
      [{ label: 'Cancel', onClick: function () { } }, { label: 'End session', primary: true, onClick: function () { send('global', { type: 'end' }, 'Ending…'); } }]);
  };
  $('#btn-submit').onclick = submitReview;
  $('#modal').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeModal(); });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    var cards = $$('.finding-card'); if (!cards.length) return;
    var idx = cards.findIndex(function (c) { return parseInt(c.getAttribute('data-id'), 10) === focusedId; });
    if (e.key === 'j' || e.key === 'k') {
      idx = e.key === 'j' ? Math.min(cards.length - 1, idx + 1) : Math.max(0, idx - 1);
      focusedId = parseInt(cards[idx].getAttribute('data-id'), 10);
      cards.forEach(function (c) { c.classList.toggle('focused', c === cards[idx]); });
      cardCache = {}; cards[idx].scrollIntoView({ block: 'start', behavior: 'smooth' }); return;
    }
    var card = cards[idx]; if (!card || pending[focusedId]) return;
    if (e.key === 'v') act(card, 'verify');
    if (e.key === 'd') act(card, findingById(focusedId).status === 'DISMISSED' ? 'reopen' : 'dismiss');
    if (e.key === 'q') act(card, findingById(focusedId).queued ? 'unqueue' : 'queue');
    if (e.key === 'Escape') { delete drafts[focusedId]; delete cardCache[focusedId]; render(); }
  });

  function saveFilters() { try { localStorage.setItem('pri-filters', JSON.stringify(filters)); } catch (e) { } }
  function loadFilters() { try { var f = JSON.parse(localStorage.getItem('pri-filters') || 'null'); if (f && f.severity) filters = f; } catch (e) { } }

  // Re-render periodically so stale pending boxes update.
  setInterval(function () { var any = Object.keys(pending).some(function (k) { return Date.now() - pending[k].at > STALE_MS; }); if (any) { Object.keys(pending).forEach(function (k) { delete cardCache[k]; }); render(); } }, 15000);

  // ---------- boot ----------
  loadFilters();
  fetch('/api/patches', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (p) { patches = p || {}; }).catch(function () { patches = {}; }).then(poll);
})();

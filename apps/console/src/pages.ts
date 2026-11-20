/** Minimal honest login + authority + mapping + roles console HTML (R1-02–R1-04). No React routes yet. */

export function loginPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial Local Console — Login</title>
  <style>
    :root { --ink:#1b2a22; --bg:#eef3ef; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; background:
      radial-gradient(circle at 10% 10%, #d9e7de, transparent 40%),
      linear-gradient(160deg, #e8efe9, #f7f4ee); color:var(--ink); min-height:100vh; }
    main { max-width:420px; margin:12vh auto; padding:2rem; background:var(--panel);
      border:1px solid #c9d6cc; box-shadow:0 12px 40px rgba(27,42,34,.08); }
    h1 { font-family:"IBM Plex Serif", Georgia, serif; font-size:1.6rem; margin:0 0 .4rem; }
    p { line-height:1.5; color:#405248; }
    label { display:block; font-size:.85rem; margin:.9rem 0 .25rem; }
    input { width:100%; box-sizing:border-box; padding:.55rem .65rem; border:1px solid #b7c5bb; }
    button { margin-top:1.1rem; background:var(--accent); color:#fff; border:0; padding:.65rem 1rem; cursor:pointer; }
    .note { margin-top:1rem; font-size:.8rem; color:var(--warn); }
    .err { color:#8b1e1e; font-size:.9rem; min-height:1.2em; }
  </style>
</head>
<body>
<main>
  <h1>WorkSocial</h1>
  <p>Local console login. Single-owner host session — no cloud IdP in R1-02.</p>
  <form id="login">
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" value="owner" required />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <div class="err" id="err"></div>
    <button type="submit">Sign in</button>
  </form>
  <p class="note">Default local password is documented in README (<code>local-owner-change-me</code>) unless <code>WORKSOCIAL_OWNER_PASSWORD</code> is set. This login does not connect any provider.</p>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': window.location.origin },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      document.getElementById('err').textContent = 'Login failed';
      return;
    }
    const data = await res.json();
    sessionStorage.setItem('ws_csrf', data.csrfToken);
    location.href = '/activation';
  });
</script>
</body>
</html>`;
}

export function authorityPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Authority</title>
  <style>
    :root { --ink:#1b2a22; --bg:#eef3ef; --panel:#fff; --accent:#2f6b4f; --stop:#8b1e1e; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:920px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    button.danger { background:var(--stop); }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; }
    .muted { color:#516258; font-size:.85rem; }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Owner controls</h2>
    <p class="muted">Stop switch is enforced by the action gateway before every external effect.</p>
    <div class="row">
      <span>Mode: <strong id="mode">—</strong></span>
      <span>Outbound: <strong id="stop">—</strong></span>
      <button id="btn-stop" class="danger" type="button">Stop outbound writes</button>
      <button id="btn-resume" type="button">Resume outbound</button>
      <button id="btn-logout" type="button">Sign out</button>
    </div>
  </section>
  <section>
    <h2>Provider status (honest labels)</h2>
    <p class="muted">connected ≠ authorized ≠ verified. Adapters are NOT_WIRED/FIXTURE in R1-03 — expect Not connected unless fixture-bound.</p>
    <table>
      <thead><tr><th>Provider</th><th>Connected</th><th>Authorized</th><th>Verified</th></tr></thead>
      <tbody id="providers"></tbody>
    </table>
  </section>
  <section>
    <h2>Standing policies / grants</h2>
    <pre id="grants" class="muted">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    const res = await fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
    return res;
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const stateRes = await api('/authority/state');
    if (!stateRes.ok) { location.href = '/login'; return; }
    const state = await stateRes.json();
    document.getElementById('mode').textContent = state.operatingMode;
    document.getElementById('stop').textContent = state.outboundStopped ? 'STOPPED' : 'allowed';
    const tbody = document.getElementById('providers');
    tbody.innerHTML = '';
    for (const p of state.providerStatuses) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + p.providerId + '</td>' +
        '<td><span class="pill">' + p.labels.connected + '</span></td>' +
        '<td><span class="pill">' + p.labels.authorized + '</span></td>' +
        '<td><span class="pill">' + p.labels.verified + '</span></td>';
      tbody.appendChild(tr);
    }
    document.getElementById('grants').textContent = JSON.stringify({
      standingPolicies: state.standingPolicies,
      capabilityGrants: state.capabilityGrants,
      note: state.honestLabelsNote
    }, null, 2);
  }
  document.getElementById('btn-stop').onclick = async () => {
    await api('/authority/stop-switch', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ outboundStopped: true }) });
    refresh();
  };
  document.getElementById('btn-resume').onclick = async () => {
    await api('/authority/stop-switch', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ outboundStopped: false }) });
    refresh();
  };
  document.getElementById('btn-logout').onclick = async () => {
    await api('/auth/logout', { method:'POST' });
    location.href = '/login';
  };
  refresh();
</script>
</body>
</html>`;
}

export function mappingPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Production mapping</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; margin:.1rem; }
    .warn { color:var(--warn); }
    pre { white-space:pre-wrap; font-size:.8rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Production mapping (R1-03)</h2>
    <p class="muted">Site/CMS/repo bindings, forms, booking and CRM ownership. Pilot writes need mapped ownership <em>and</em> prior read evidence.</p>
    <p class="warn">No live Zoho/CMS mutations in this build. Fixture / NOT_WIRED ≠ connected.</p>
    <div class="row">
      <button id="btn-seed" type="button">Seed fixture pilot</button>
      <button id="btn-prove" type="button">Record fixture read evidence</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="seed-note"></p>
  </section>
  <section>
    <h2>Binding / connection status</h2>
    <table>
      <thead><tr><th>Binding</th><th>Connected</th><th>Authorized</th><th>Verified</th><th>Ownership</th></tr></thead>
      <tbody id="bindings"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Adapters</h2>
    <table>
      <thead><tr><th>Adapter</th><th>Provider</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody id="adapters"></tbody>
    </table>
  </section>
  <section>
    <h2>Write paths / journeys / outcomes</h2>
    <p class="muted">Outcome labels (SUCCESS/FAILURE) feed <a href="/learning">learning-worker</a> proposals under review.</p>
    <pre id="detail">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  let lastWritePathId = null;
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const stateRes = await api('/mapping/state');
    if (!stateRes.ok) { location.href = '/login'; return; }
    const state = await stateRes.json();
    const tbody = document.getElementById('bindings');
    tbody.innerHTML = '';
    const bindings = state.mapping.bindings || [];
    if (!bindings.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No bindings yet. Seed the fixture pilot to start.</td></tr>';
    }
    for (const b of bindings) {
      const status = (state.bindingStatuses || []).find(x => x.providerId.endsWith(':' + b.bindingId)) || {};
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + b.displayName + ' <span class="pill">' + b.kind + '</span><br><span class="muted">' + b.resourceRef + '</span></td>' +
        '<td><span class="pill">' + (status.labels ? status.labels.connected : b.connectionState) + '</span></td>' +
        '<td><span class="pill">' + (status.labels ? status.labels.authorized : b.writeReadiness) + '</span></td>' +
        '<td><span class="pill">' + (status.labels ? status.labels.verified : b.verificationState) + '</span></td>' +
        '<td>' + (b.ownershipProven ? 'proven (read)' : 'unproven') + '</td>';
      tbody.appendChild(tr);
    }
    const adapters = document.getElementById('adapters');
    adapters.innerHTML = '';
    for (const a of state.adapters || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + a.adapterId + '</td><td>' + a.providerId + '</td><td><span class="pill">' + a.status + '</span></td><td class="muted">' + a.notes + '</td>';
      adapters.appendChild(tr);
    }
    if ((state.mapping.writePaths || []).length) {
      lastWritePathId = state.mapping.writePaths[0].writePathId;
    }
    document.getElementById('detail').textContent = JSON.stringify({
      writePaths: state.mapping.writePaths,
      journeys: state.mapping.journeys,
      readEvidence: state.mapping.readEvidence,
      writePathOutcomes: state.mapping.writePathOutcomes,
      learningHook: state.learningHook,
      note: state.honestLabelsNote
    }, null, 2);
  }
  document.getElementById('btn-seed').onclick = async () => {
    const res = await api('/mapping/seed-fixture-pilot', { method:'POST', headers:{'content-type':'application/json'}, body: '{}' });
    const body = await res.json();
    lastWritePathId = body.writePathId || lastWritePathId;
    document.getElementById('seed-note').textContent = body.note || '';
    refresh();
  };
  document.getElementById('btn-prove').onclick = async () => {
    if (!lastWritePathId) { document.getElementById('seed-note').textContent = 'Seed a fixture pilot first.'; return; }
    const res = await api('/mapping/prove-fixture-pilot', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ writePathId: lastWritePathId })
    });
    const body = await res.json();
    document.getElementById('seed-note').textContent = body.note || body.message || '';
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function rolesPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Roles</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:1100px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.85rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; margin:.1rem; }
    .warn { color:var(--warn); }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:280px; overflow:auto; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Thirty-role Claude runtime (R1-04)</h2>
    <p class="muted">A01–A30 role contracts with bounded fixture evaluations. Reasoning proposes; gateway authorizes.</p>
    <p class="warn">Default execution is fixture/offline. Temporal mission enqueue is <strong>NOT_WIRED</strong>. No blanket permission bypass.</p>
    <div class="row">
      <button id="btn-eval" type="button">Evaluate all 30 (fixture)</button>
      <button id="btn-run-a01" type="button">Run A01</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
    <p class="muted">CLI: <span id="cli">—</span> · Temporal: <span id="temporal">—</span></p>
  </section>
  <section>
    <h2>Role status / last run</h2>
    <table>
      <thead><tr><th>Role</th><th>Group</th><th>Last status</th><th>Mode</th><th>Summary</th></tr></thead>
      <tbody id="roles"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Last run evidence / learning hooks</h2>
    <p class="muted">SUCCESS/FAILURE outcomes feed <a href="/learning">learning-worker</a> proposals under review.</p>
    <pre id="evidence">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const stateRes = await api('/roles/state');
    if (!stateRes.ok) { location.href = '/login'; return; }
    const state = await stateRes.json();
    document.getElementById('cli').textContent = state.cli && state.cli.available
      ? (state.cli.version || 'detected')
      : (state.cli && state.cli.reason) || 'fixture';
    document.getElementById('temporal').textContent = state.temporalWiring || 'NOT_WIRED';
    const byId = {};
    for (const c of state.contracts || []) byId[c.roleId] = c;
    const tbody = document.getElementById('roles');
    tbody.replaceChildren();
    for (const r of state.roles || []) {
      const c = byId[r.roleId] || {};
      const tr = document.createElement('tr');
      const tdRole = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(r.roleId || '');
      tdRole.appendChild(pill);
      tdRole.appendChild(document.createTextNode(' ' + String(c.name || '')));
      const tdGroup = document.createElement('td');
      tdGroup.textContent = String(c.group || '');
      const tdStatus = document.createElement('td');
      const statusPill = document.createElement('span');
      statusPill.className = 'pill';
      statusPill.textContent = String(r.lastStatus || '');
      tdStatus.appendChild(statusPill);
      const tdMode = document.createElement('td');
      tdMode.textContent = String(r.lastExecutionMode || '—');
      const tdSummary = document.createElement('td');
      tdSummary.className = 'muted';
      // Model-controlled summaries must never enter innerHTML (XSS).
      tdSummary.textContent = String(r.lastSummary || 'never run');
      tr.appendChild(tdRole);
      tr.appendChild(tdGroup);
      tr.appendChild(tdStatus);
      tr.appendChild(tdMode);
      tr.appendChild(tdSummary);
      tbody.appendChild(tr);
    }
    document.getElementById('evidence').textContent = JSON.stringify({
      recentRuns: state.recentRuns,
      learningOutcomes: state.learningOutcomes,
      budget: state.budget,
      note: state.honestLabelsNote
    }, null, 2);
  }
  document.getElementById('btn-eval').onclick = async () => {
    document.getElementById('note').textContent = 'Running fixture evaluations…';
    const res = await api('/roles/evaluate-fixture', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || ('Evaluated ' + (body.evaluated || 0) + ' roles');
    refresh();
  };
  document.getElementById('btn-run-a01').onclick = async () => {
    const res = await api('/roles/run', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ roleId: 'A01', trigger: 'console_manual' })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.run && body.run.summary) || (body.mission && body.mission.detail) || '';
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function monitoringPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Monitoring</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:320px; overflow:auto; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Monitoring and lead capture (R1-05 + M5)</h2>
    <p class="muted">HTTP/DOM probes, form→CRM canaries, and M5 journeys: browser → verify → cleanup. Synthetic leads never enter commercial totals.</p>
    <p class="warn">Fixture mode is real offline evidence. Live Zoho is <strong>NOT_WIRED</strong>. Temporal <strong>NOT_WIRED</strong>. Catalog cases stay NOT_RUN. Not R1-complete.</p>
    <div class="row">
      <button id="btn-http" type="button">Run fixture HTTP</button>
      <button id="btn-dom" type="button">Run fixture DOM</button>
      <button id="btn-canary" type="button">Run form→CRM canary</button>
      <button id="btn-journey" type="button">Run M5 lead journey</button>
      <button id="btn-fail" type="button">Inject delivery failure</button>
      <button id="btn-repair" type="button">Incident→repair→verify</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Lead-capture status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="lead-status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Probe status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Correlated submission ↔ CRM / artifacts / repair</h2>
    <pre id="detail">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  let lastFailedJourneyId = null;
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  function fillRows(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    tbody.replaceChildren();
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const tdK = document.createElement('td');
      tdK.textContent = k;
      const tdV = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(v);
      tdV.appendChild(pill);
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    }
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, runsRes, leadRes, journeysRes] = await Promise.all([
      api('/probes/status'),
      api('/probes/runs'),
      api('/lead-capture/status'),
      api('/lead-capture/journeys?limit=5'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const runsBody = await runsRes.json();
    const lead = leadRes.ok ? await leadRes.json() : {};
    const journeysBody = journeysRes.ok ? await journeysRes.json() : { journeys: [] };
    if (lead.currentFailure && lead.currentFailure.journeyId) {
      lastFailedJourneyId = lead.currentFailure.journeyId;
    }
    fillRows('lead-status-rows', [
      ['Last SUCCESS', lead.lastSuccess ? (lead.lastSuccess.atIso + ' · ' + lead.lastSuccess.correlationId) : 'none'],
      ['Current FAILURE', lead.currentFailure ? (lead.currentFailure.stage + ': ' + (lead.currentFailure.details || []).join('; ')) : 'none'],
      ['Open repairs', String(lead.openRepairCount ?? 0)],
      ['Commerce lead count (excl. synthetic)', String((lead.commerce && lead.commerce.leadCount) || 0)],
      ['Synthetic excluded', String((lead.commerce && lead.commerce.syntheticExcludedCount) || 0)],
      ['Live Zoho', lead.liveZohoWiring || 'NOT_WIRED'],
      ['Playwright', lead.playwrightWiring || 'FIXTURE'],
      ['Temporal', lead.temporalWiring || 'NOT_WIRED'],
      ['R1-complete claim', String(lead.r1CompleteClaim === true)],
    ]);
    fillRows('status-rows', [
      ['Live Zoho wiring', status.liveZohoWiring],
      ['Playwright wiring', status.playwrightWiring],
      ['Run count', String(status.runCount ?? 0)],
      ['Fixture receipts', String(status.fixtureReceiptCount ?? 0)],
      ['Catalog case IDs', (status.acceptanceCaseIds || []).join(', ')],
    ]);
    const latest = (journeysBody.journeys || [])[0] || null;
    document.getElementById('detail').textContent = JSON.stringify({
      lastSuccess: lead.lastSuccess || null,
      currentFailure: lead.currentFailure || null,
      latestJourney: latest ? {
        journeyId: latest.journeyId,
        correlationId: latest.correlationId,
        status: latest.status,
        submission: latest.submission,
        crmReceipt: latest.crmReceipt,
        artifactRefs: latest.artifactRefs,
        repair: latest.repair,
        cleanup: latest.cleanup,
        durableOperationId: latest.durableOperationId,
        fieldVerifyPassed: latest.fieldVerifyPassed,
      } : null,
      recentProbeRuns: (runsBody.runs || []).slice(-5).reverse(),
      honestNote: lead.honestNote || status.note || status.honestNote,
    }, null, 2);
  }
  document.getElementById('btn-http').onclick = async () => {
    document.getElementById('note').textContent = 'Running fixture HTTP probe…';
    const res = await api('/probes/run-http', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = (body.run && body.run.verdict) ? ('HTTP ' + body.run.verdict) : (body.error || 'failed');
    refresh();
  };
  document.getElementById('btn-dom').onclick = async () => {
    document.getElementById('note').textContent = 'Running fixture DOM journey…';
    const res = await api('/probes/run-dom', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = (body.run && body.run.verdict) ? ('DOM ' + body.run.verdict) : (body.error || 'failed');
    refresh();
  };
  document.getElementById('btn-canary').onclick = async () => {
    document.getElementById('note').textContent = 'Running fixture form→CRM canary…';
    const res = await api('/probes/run-form-canary', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ ensureFixturePilot: true }) });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || ((body.run && body.run.verdict) ? ('Canary ' + body.run.verdict) : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-journey').onclick = async () => {
    document.getElementById('note').textContent = 'Running M5 lead journey (browser→CRM→verify→cleanup)…';
    const res = await api('/lead-capture/run-journey', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (body.journey ? ('Journey ' + body.journey.status) : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-fail').onclick = async () => {
    document.getElementById('note').textContent = 'Injecting CRM delivery failure…';
    const res = await api('/lead-capture/run-journey', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ failDelivery: true }) });
    const body = await res.json();
    if (body.journey) lastFailedJourneyId = body.journey.journeyId;
    document.getElementById('note').textContent = body.journey ? ('Failed at ' + (body.journey.currentFailure && body.journey.currentFailure.stage) + ' · ' + body.journey.journeyId) : (body.error || 'failed');
    refresh();
  };
  document.getElementById('btn-repair').onclick = async () => {
    if (!lastFailedJourneyId) {
      document.getElementById('note').textContent = 'No failed journey id — inject a delivery failure first.';
      return;
    }
    document.getElementById('note').textContent = 'Running incident→repair→verify (weaken-test must fail closed)…';
    const res = await api('/lead-capture/run-bounded-repair', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ journeyId: lastFailedJourneyId, attemptWeakenTest: true }) });
    const body = await res.json();
    document.getElementById('note').textContent = body.ok ? ('Recovered · weaken blocked=' + body.weakenTestBlocked) : (body.details || [body.error || 'failed']).join('; ');
    if (body.ok) lastFailedJourneyId = null;
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function learningPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Learning</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:960px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); font-size:.85rem; }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
    pre { white-space:pre-wrap; font-size:.8rem; background:#f4f7f5; padding:.75rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Multi-model learning (local OSS)</h2>
    <p class="muted">Learns from verified SUCCESS/FAILURE outcomes. Proposals only — cannot expand grants, spend, CRM write, or publish authority.</p>
    <p class="warn">Offline/fixture metrics ≠ production-canary-verified. No action-gateway write principal; no production effect credentials.</p>
    <div class="row">
      <button id="btn-train" type="button">Run offline train</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Model registry</h2>
    <table>
      <thead><tr><th>Model</th><th>Algorithm</th><th>License</th><th>Mode</th></tr></thead>
      <tbody id="models"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Last training run metrics</h2>
    <pre id="metrics">Loading…</pre>
  </section>
  <section>
    <h2>Proposed updates awaiting review</h2>
    <pre id="proposals">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, modelsRes, runsRes, proposalsRes] = await Promise.all([
      api('/learning/status'),
      api('/learning/models'),
      api('/learning/runs'),
      api('/learning/proposals'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const modelsBody = await modelsRes.json();
    const runsBody = await runsRes.json();
    const proposalsBody = await proposalsRes.json();
    const tbody = document.getElementById('models');
    tbody.replaceChildren();
    for (const m of modelsBody.models || status.models || []) {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(m.modelId || '');
      tdName.appendChild(pill);
      tdName.appendChild(document.createTextNode(' ' + String(m.displayName || '')));
      const tdAlgo = document.createElement('td');
      tdAlgo.textContent = String(m.algorithm || '');
      const tdLic = document.createElement('td');
      tdLic.textContent = String(m.license || '');
      const tdMode = document.createElement('td');
      tdMode.textContent = String(m.defaultRuntimeMode || '');
      tr.appendChild(tdName);
      tr.appendChild(tdAlgo);
      tr.appendChild(tdLic);
      tr.appendChild(tdMode);
      tbody.appendChild(tr);
    }
    document.getElementById('metrics').textContent = JSON.stringify({
      isolation: status.isolation,
      lastRun: status.lastRun,
      lastTrainingRunMetrics: runsBody.lastTrainingRunMetrics,
      honestNote: status.honestNote,
    }, null, 2);
    document.getElementById('proposals').textContent = JSON.stringify({
      awaitingReview: proposalsBody.awaitingReview || status.awaitingReview,
      note: proposalsBody.note,
    }, null, 2);
  }
  document.getElementById('btn-train').onclick = async () => {
    document.getElementById('note').textContent = 'Training from verified outcome ledgers…';
    const res = await api('/learning/train', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.honestNote || body.run?.note || (res.ok ? 'Train complete' : (body.reason || body.error || 'Train failed'));
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function knowledgePage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Knowledge</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:280px; overflow:auto; }
    input, select, textarea { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #b7c5bb; margin:.25rem 0 .6rem; }
    label { font-size:.85rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Knowledge and demand (R1-06)</h2>
    <p class="muted">Fact registry, instruction ingestion, trends/FAQ/rank signals with honest <strong>SUPPORTED / UNKNOWN / HYPOTHESIS</strong> labels.</p>
    <p class="warn">Model claims are never facts. Live SERP and Google Trends stay <strong>NOT_WIRED</strong>. Fixture adapters only.</p>
    <div class="row">
      <button id="btn-seed" type="button">Seed fixtures</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Register fact</h2>
    <label for="fact-statement">Statement</label>
    <textarea id="fact-statement" rows="2" placeholder="Business fact statement"></textarea>
    <div class="row">
      <div style="flex:1;min-width:160px">
        <label for="fact-method">Collection method</label>
        <select id="fact-method">
          <option value="owner_declared">owner_declared</option>
          <option value="fixture">fixture</option>
          <option value="unsourced">unsourced</option>
          <option value="model_generated">model_generated</option>
        </select>
      </div>
      <div style="flex:1;min-width:160px">
        <label for="fact-label">Requested label</label>
        <select id="fact-label">
          <option value="SUPPORTED">SUPPORTED</option>
          <option value="UNKNOWN">UNKNOWN</option>
          <option value="HYPOTHESIS">HYPOTHESIS</option>
        </select>
      </div>
    </div>
    <div class="row">
      <button id="btn-fact" type="button">Register fact</button>
      <button id="btn-ingest-claim" type="button">Ingest as model claim</button>
    </div>
  </section>
  <section>
    <h2>Facts</h2>
    <pre id="facts">Loading…</pre>
  </section>
  <section>
    <h2>Demand signals</h2>
    <pre id="demand">Loading…</pre>
  </section>
  <section>
    <h2>Instruction ingestions</h2>
    <pre id="ingestions">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, factsRes, demandRes, ingRes] = await Promise.all([
      api('/knowledge/status'),
      api('/knowledge/facts'),
      api('/knowledge/demand'),
      api('/knowledge/ingestions'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const factsBody = await factsRes.json();
    const demandBody = await demandRes.json();
    const ingBody = await ingRes.json();
    const tbody = document.getElementById('status-rows');
    tbody.replaceChildren();
    const rows = [
      ['Live SERP wiring', status.liveSerpWiring],
      ['Live Trends wiring', status.liveTrendsWiring],
      ['Facts', String(status.factCount ?? 0)],
      ['Demand signals', String(status.demandSignalCount ?? 0)],
      ['SUPPORTED / UNKNOWN / HYPOTHESIS', [status.supportedCount, status.unknownCount, status.hypothesisCount].join(' / ')],
      ['Ingestions', String(status.ingestionCount ?? 0)],
    ];
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const tdK = document.createElement('td');
      tdK.textContent = k;
      const tdV = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(v);
      tdV.appendChild(pill);
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    }
    document.getElementById('facts').textContent = JSON.stringify(factsBody.facts || [], null, 2);
    document.getElementById('demand').textContent = JSON.stringify(demandBody.demandSignals || [], null, 2);
    document.getElementById('ingestions').textContent = JSON.stringify(ingBody.ingestions || [], null, 2);
    document.getElementById('note').textContent = status.note || status.honestNote || '';
  }
  document.getElementById('btn-seed').onclick = async () => {
    document.getElementById('note').textContent = 'Seeding fixture knowledge corpus…';
    const res = await api('/knowledge/seed-fixtures', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (res.ok ? 'Seeded' : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-fact').onclick = async () => {
    const statement = document.getElementById('fact-statement').value;
    const collectionMethod = document.getElementById('fact-method').value;
    const requestedLabel = document.getElementById('fact-label').value;
    const evidenceLinks = (collectionMethod === 'owner_declared' || collectionMethod === 'fixture')
      ? [{ sourceRef: 'console://manual', collectionMethod, summary: 'Console registration evidence', fixtureOnly: true }]
      : [];
    const res = await api('/knowledge/facts', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ statement, collectionMethod, requestedLabel, sourceSystem: 'console', evidenceLinks })
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || body.reasons?.join('; ') || (res.ok ? 'Registered' : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-ingest-claim').onclick = async () => {
    const statement = document.getElementById('fact-statement').value;
    const res = await api('/knowledge/ingest-claim', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ statement, modelGenerated: true, sourceSystem: 'console_model' })
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (body.fact ? ('HYPOTHESIS ' + body.fact.factId) : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function seoPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — SEO &amp; search</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:280px; overflow:auto; }
    input, select { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #b7c5bb; margin:.25rem 0 .6rem; }
    label { font-size:.85rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>SEO and search (R1-07)</h2>
    <p class="muted">Page audits, SEO proposals, schema validation, fixture semantic search, gateway-gated pilot page release.</p>
    <p class="warn">Live CMS publish is <strong>NOT_WIRED</strong>. Gateway acceptance ≠ verified. Schema truth requires <strong>SUPPORTED</strong> facts — never HYPOTHESIS. Set Authority mode to <strong>operate</strong>. Ensure fixture mapping, approve, release, then verify with read-back. Administrators only for release/verify.</p>
    <div class="row">
      <button id="btn-seed" type="button">Seed fixtures</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Semantic search</h2>
    <label for="search-q">Query</label>
    <input id="search-q" value="Meeting for 8 with a display in Jersey City" />
    <div class="row">
      <button id="btn-search" type="button">Search fixture catalog</button>
    </div>
    <pre id="search-out">—</pre>
  </section>
  <section>
    <h2>Proposal review / release</h2>
    <label for="prop-id">Proposal id</label>
    <input id="prop-id" placeholder="golden-prop-title" />
    <div class="row">
      <button id="btn-ensure-map" type="button">Ensure fixture mapping</button>
      <button id="btn-approve" type="button">Approve proposal</button>
      <button id="btn-release" type="button">Release pilot (gateway)</button>
      <button id="btn-verify" type="button">Verify with read-back</button>
    </div>
  </section>
  <section>
    <h2>Page audits</h2>
    <pre id="audits">Loading…</pre>
  </section>
  <section>
    <h2>Proposals</h2>
    <pre id="proposals">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, auditsRes, propsRes] = await Promise.all([
      api('/seo/status'),
      api('/seo/audits'),
      api('/seo/proposals'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const auditsBody = await auditsRes.json();
    const propsBody = await propsRes.json();
    const tbody = document.getElementById('status-rows');
    tbody.replaceChildren();
    const rows = [
      ['Live CMS publish', status.liveCmsPublishWiring],
      ['Audits', String(status.auditCount ?? 0)],
      ['Proposals', String(status.proposalCount ?? 0)],
      ['Schema validations', String(status.schemaValidationCount ?? 0)],
      ['Search index version', String(status.searchIndexVersion ?? 'none')],
      ['Release outcomes', String(status.releaseOutcomeCount ?? 0)],
    ];
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const tdK = document.createElement('td');
      tdK.textContent = k;
      const tdV = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(v);
      tdV.appendChild(pill);
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    }
    document.getElementById('audits').textContent = JSON.stringify(auditsBody.audits || [], null, 2);
    document.getElementById('proposals').textContent = JSON.stringify(propsBody.proposals || [], null, 2);
    document.getElementById('note').textContent = status.note || status.honestNote || '';
    const first = (propsBody.proposals || [])[0];
    if (first && !document.getElementById('prop-id').value) {
      document.getElementById('prop-id').value = first.proposalId;
    }
  }
  document.getElementById('btn-seed').onclick = async () => {
    document.getElementById('note').textContent = 'Seeding golden SEO fixtures…';
    const res = await api('/seo/seed-fixtures', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (res.ok ? 'Seeded' : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-search').onclick = async () => {
    const rawQuery = document.getElementById('search-q').value;
    const res = await api('/seo/search', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ rawQuery })
    });
    const body = await res.json();
    document.getElementById('search-out').textContent = JSON.stringify(body, null, 2);
  };
  document.getElementById('btn-ensure-map').onclick = async () => {
    const res = await api('/seo/ensure-fixture-mapping', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || body.reason || body.error || (res.ok ? 'Mapping ready' : 'failed');
  };
  document.getElementById('btn-approve').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    const res = await api('/seo/approve-proposal', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.reasons?.join('; ') || body.error || (res.ok ? 'Approved' : 'failed');
    refresh();
  };
  document.getElementById('btn-release').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    const res = await api('/seo/release-pilot', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('search-out').textContent = JSON.stringify({
      gateway: body.gatewayDecision,
      proposal: body.proposal,
      outcome: body.outcome,
      liveCmsPublishWiring: body.liveCmsPublishWiring,
      acceptanceEqualsVerified: body.acceptanceEqualsVerified,
    }, null, 2);
    refresh();
  };
  document.getElementById('btn-verify').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    // F12 fix: never copy desired/proposed → observed in the browser.
    // Ask the API for an independent fixture read-back, then verify with those fields.
    const readRes = await api('/seo/independent-read-back', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId })
    });
    const readBody = await readRes.json();
    if (!readRes.ok) {
      document.getElementById('note').textContent = readBody.reason || readBody.error || 'independent read failed';
      document.getElementById('search-out').textContent = JSON.stringify(readBody, null, 2);
      return;
    }
    const res = await api('/seo/verify-pilot', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId, observedFields: readBody.observedFields })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('search-out').textContent = JSON.stringify({ independentRead: readBody, verify: body }, null, 2);
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function contentPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Content &amp; distribution</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:280px; overflow:auto; }
    input { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #b7c5bb; margin:.25rem 0 .6rem; }
    label { font-size:.85rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Content and distribution (R1-08)</h2>
    <p class="muted">Article pipeline, destination variants, gateway-gated CMS/GBP/social receipts.</p>
    <p class="warn">Live CMS / GBP / social are <strong>NOT_WIRED</strong>. Gateway acceptance ≠ verified. Released claims require <strong>SUPPORTED</strong> facts. Canonical owned-site first; dependents wait for verified URL. Set Authority mode to <strong>operate</strong>.</p>
    <div class="row">
      <button id="btn-seed" type="button">Seed fixtures</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Release controls</h2>
    <label for="art-id">Article id</label>
    <input id="art-id" placeholder="golden-art-training" />
    <label for="var-id">Variant id</label>
    <input id="var-id" placeholder="golden-var-gbp" />
    <div class="row">
      <button id="btn-ensure-map" type="button">Ensure fixture mapping</button>
      <button id="btn-approve" type="button">Approve article</button>
      <button id="btn-release-cms" type="button">Release canonical (gateway)</button>
      <button id="btn-verify-cms" type="button">Verify canonical</button>
      <button id="btn-release-var" type="button">Release variant</button>
      <button id="btn-verify-var" type="button">Verify variant</button>
      <button id="btn-live-var" type="button">Try live variant (NOT_WIRED)</button>
    </div>
    <pre id="out">—</pre>
  </section>
  <section>
    <h2>Campaigns / articles / variants / receipts</h2>
    <pre id="ledger">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, campsRes, artsRes, varsRes, rcptsRes] = await Promise.all([
      api('/content/status'),
      api('/content/campaigns'),
      api('/content/articles'),
      api('/content/variants'),
      api('/content/receipts'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const camps = await campsRes.json();
    const arts = await artsRes.json();
    const vars = await varsRes.json();
    const rcpts = await rcptsRes.json();
    const tbody = document.getElementById('status-rows');
    tbody.replaceChildren();
    const rows = [
      ['Live CMS', status.liveCmsPublishWiring],
      ['Live GBP', status.liveGbpWiring],
      ['Live social', status.liveSocialWiring],
      ['Campaigns', String(status.campaignCount ?? 0)],
      ['Articles', String(status.articleCount ?? 0)],
      ['Variants', String(status.variantCount ?? 0)],
      ['Receipts', String(status.receiptCount ?? 0)],
      ['Release outcomes', String(status.releaseOutcomeCount ?? 0)],
    ];
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const tdK = document.createElement('td');
      tdK.textContent = k;
      const tdV = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(v);
      tdV.appendChild(pill);
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    }
    document.getElementById('ledger').textContent = JSON.stringify({
      campaigns: camps.campaigns || [],
      articles: arts.articles || [],
      variants: vars.variants || [],
      receipts: rcpts.receipts || [],
    }, null, 2);
    document.getElementById('note').textContent = status.note || status.honestNote || '';
    const firstArt = (arts.articles || [])[0];
    if (firstArt && !document.getElementById('art-id').value) {
      document.getElementById('art-id').value = firstArt.articleId;
    }
    const firstVar = (vars.variants || [])[0];
    if (firstVar && !document.getElementById('var-id').value) {
      document.getElementById('var-id').value = firstVar.variantId;
    }
  }
  document.getElementById('btn-seed').onclick = async () => {
    document.getElementById('note').textContent = 'Seeding golden content fixtures…';
    const res = await api('/content/seed-fixtures', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (res.ok ? 'Seeded' : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-ensure-map').onclick = async () => {
    const res = await api('/content/ensure-fixture-mapping', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || body.reason || body.error || (res.ok ? 'Mapping ready' : 'failed');
  };
  document.getElementById('btn-approve').onclick = async () => {
    const articleId = document.getElementById('art-id').value;
    const res = await api('/content/approve-article', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ articleId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.reasons?.join('; ') || body.error || (res.ok ? 'Approved' : 'failed');
    refresh();
  };
  document.getElementById('btn-release-cms').onclick = async () => {
    const articleId = document.getElementById('art-id').value;
    const res = await api('/content/release-canonical', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ articleId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-verify-cms').onclick = async () => {
    const articleId = document.getElementById('art-id').value;
    // F12 fix: independent fixture read-back — never copy desired fields from the browser ledger.
    const readRes = await api('/content/independent-read-back', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ kind: 'canonical', articleId })
    });
    const readBody = await readRes.json();
    if (!readRes.ok) {
      document.getElementById('note').textContent = readBody.reason || readBody.error || 'independent read failed';
      document.getElementById('out').textContent = JSON.stringify(readBody, null, 2);
      return;
    }
    const res = await api('/content/verify-canonical', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ articleId, observedFields: readBody.observedFields })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify({ independentRead: readBody, verify: body }, null, 2);
    refresh();
  };
  document.getElementById('btn-release-var').onclick = async () => {
    const variantId = document.getElementById('var-id').value;
    const res = await api('/content/release-variant', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ variantId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-verify-var').onclick = async () => {
    const variantId = document.getElementById('var-id').value;
    const readRes = await api('/content/independent-read-back', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ kind: 'variant', variantId })
    });
    const readBody = await readRes.json();
    if (!readRes.ok) {
      document.getElementById('note').textContent = readBody.reason || readBody.error || 'independent read failed';
      document.getElementById('out').textContent = JSON.stringify(readBody, null, 2);
      return;
    }
    const res = await api('/content/verify-variant', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ variantId, observedFields: readBody.observedFields })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify({ independentRead: readBody, verify: body }, null, 2);
    refresh();
  };
  document.getElementById('btn-live-var').onclick = async () => {
    const variantId = document.getElementById('var-id').value;
    const res = await api('/content/release-variant', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ variantId, preferLive: true })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function inboxPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Inbox &amp; concierge</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; --stop:#8b1e1e; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    button.danger { background:var(--stop); }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); }
    .pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:280px; overflow:auto; }
    input { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #b7c5bb; margin:.25rem 0 .6rem; }
    label { font-size:.85rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Inbox and after-hours concierge (R1-09)</h2>
    <p class="muted">Fixture inbox, supported-fact replies, Zoho lead logging, human takeover, morning handoff.</p>
    <p class="warn">Live inbox providers and live Zoho are <strong>NOT_WIRED</strong>. Takeover increments conversation version and cancels queued agent sends. No reservation without booking evidence. Set Authority mode to <strong>operate</strong>.</p>
    <div class="row">
      <button id="btn-seed" type="button">Seed fixtures</button>
      <button id="btn-ensure-map" type="button">Ensure fixture mapping</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Conversation controls</h2>
    <label for="conv-id">Conversation id</label>
    <input id="conv-id" placeholder="golden-conv-after-hours" />
    <label for="draft-id">Draft id</label>
    <input id="draft-id" placeholder="filled after draft" />
    <label for="msg-id">Queued message id</label>
    <input id="msg-id" placeholder="filled after queue" />
    <div class="row">
      <button id="btn-draft" type="button">Draft reply</button>
      <button id="btn-queue" type="button">Queue reply</button>
      <button id="btn-send" type="button">Send via gateway</button>
      <button id="btn-takeover" type="button" class="danger">Take over</button>
      <button id="btn-lead" type="button">Log fixture lead</button>
      <button id="btn-handoff" type="button">Create handoff</button>
      <button id="btn-live" type="button">Try live send (NOT_WIRED)</button>
    </div>
    <pre id="out">—</pre>
  </section>
  <section>
    <h2>Conversations / messages / leads / handoffs</h2>
    <pre id="ledger">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, convRes, msgRes, leadRes, hoRes] = await Promise.all([
      api('/inbox/status'),
      api('/inbox/conversations'),
      api('/inbox/messages'),
      api('/inbox/leads'),
      api('/inbox/handoffs'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const convs = await convRes.json();
    const msgs = await msgRes.json();
    const leads = await leadRes.json();
    const hos = await hoRes.json();
    const tbody = document.getElementById('status-rows');
    tbody.replaceChildren();
    const rows = [
      ['Live inbox', status.liveInboxWiring],
      ['Live CRM lead', status.liveCrmLeadWiring],
      ['Conversations', String(status.conversationCount ?? 0)],
      ['Messages', String(status.messageCount ?? 0)],
      ['Queued', String(status.queuedCount ?? 0)],
      ['Leads', String(status.leadCount ?? 0)],
      ['Handoffs', String(status.handoffCount ?? 0)],
      ['Replies paused', String(status.repliesPaused ?? false)],
    ];
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const tdK = document.createElement('td');
      tdK.textContent = k;
      const tdV = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = String(v);
      tdV.appendChild(pill);
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    }
    document.getElementById('ledger').textContent = JSON.stringify({
      conversations: convs.conversations || [],
      messages: msgs.messages || [],
      leads: leads.leads || [],
      handoffs: hos.handoffs || [],
    }, null, 2);
    document.getElementById('note').textContent = status.note || status.honestNote || '';
    const first = (convs.conversations || [])[0];
    if (first && !document.getElementById('conv-id').value) {
      document.getElementById('conv-id').value = first.conversationId;
    }
    const queued = (msgs.messages || []).find(m => m.sendStatus === 'queued');
    if (queued && !document.getElementById('msg-id').value) {
      document.getElementById('msg-id').value = queued.messageId;
    }
  }
  document.getElementById('btn-seed').onclick = async () => {
    const res = await api('/inbox/seed-fixtures', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (res.ok ? 'Seeded' : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-ensure-map').onclick = async () => {
    const res = await api('/inbox/ensure-fixture-mapping', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || body.reason || body.error || (res.ok ? 'Mapping ready' : 'failed');
  };
  document.getElementById('btn-draft').onclick = async () => {
    const conversationId = document.getElementById('conv-id').value;
    const res = await api('/inbox/draft-reply', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ conversationId })
    });
    const body = await res.json();
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    if (body.draft?.draftId) document.getElementById('draft-id').value = body.draft.draftId;
    document.getElementById('note').textContent = body.reasons?.join('; ') || body.error || (res.ok ? 'Drafted' : 'failed');
  };
  document.getElementById('btn-queue').onclick = async () => {
    const conversationId = document.getElementById('conv-id').value;
    const draftId = document.getElementById('draft-id').value;
    const res = await api('/inbox/queue-reply', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ conversationId, draftId })
    });
    const body = await res.json();
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    if (body.message?.messageId) document.getElementById('msg-id').value = body.message.messageId;
    document.getElementById('note').textContent = body.reasons?.join('; ') || body.error || (res.ok ? 'Queued' : 'failed');
    refresh();
  };
  document.getElementById('btn-send').onclick = async () => {
    const messageId = document.getElementById('msg-id').value;
    const res = await api('/inbox/send-reply', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ messageId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-takeover').onclick = async () => {
    const conversationId = document.getElementById('conv-id').value;
    const res = await api('/inbox/takeover', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ conversationId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || body.reasons?.join('; ') || body.error || (res.ok ? 'Taken over' : 'failed');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-lead').onclick = async () => {
    const conversationId = document.getElementById('conv-id').value;
    const res = await api('/inbox/log-lead', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ conversationId, locationNeed: 'Jersey City', sizeNeed: '12' })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-handoff').onclick = async () => {
    const conversationId = document.getElementById('conv-id').value;
    const res = await api('/inbox/handoff', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({
        conversationId,
        reason: 'Morning follow-up requested',
        customerQuestions: ['Training room Friday'],
        verifiedAnswers: ['Shared booking link — not a reservation'],
        requestedAction: 'Call back'
      })
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.error || (res.ok ? 'Handoff created' : 'failed');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-live').onclick = async () => {
    const messageId = document.getElementById('msg-id').value;
    const res = await api('/inbox/send-reply', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ messageId, preferLive: true })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

export function repairPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WorkSocial — Bounded repair</title>
  <style>
    :root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; --stop:#8b1e1e; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
      linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
    header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.7); }
    h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
    main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
    section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
    h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
    .row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
    button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
    button.danger { background:var(--stop); }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:.35rem .25rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
    .muted { color:#516258; font-size:.85rem; }
    .warn { color:var(--warn); }
    pre { white-space:pre-wrap; font-size:.8rem; max-height:280px; overflow:auto; }
    input { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #b7c5bb; margin:.25rem 0 .6rem; }
    label { font-size:.85rem; }
  </style>
</head>
<body>
<header>
  <h1>WorkSocial</h1>
  <p class="muted" id="who">Checking session…</p>
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/knowledge">Knowledge</a> · <a href="/seo">SEO &amp; search</a> · <a href="/content">Content</a> · <a href="/inbox">Inbox</a> · <a href="/repair">Repair</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Bounded repair and release (R1-10)</h2>
    <p class="muted">Injected fixture defect → proposal → independent review → gateway release → canary verify.</p>
    <p class="warn">Repairs that weaken tests, touch policies/gateway, exceed two attempts, or self-approve <strong>fail closed</strong>. Live CMS repair is <strong>NOT_WIRED</strong>. Set Authority mode to <strong>operate</strong>.</p>
    <div class="row">
      <button id="btn-seed" type="button">Seed fixtures</button>
      <button id="btn-ensure-map" type="button">Ensure fixture mapping</button>
      <button id="btn-refresh" type="button">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Status</h2>
    <table>
      <thead><tr><th>Signal</th><th>Value</th></tr></thead>
      <tbody id="status-rows"><tr><td colspan="2" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Repair controls</h2>
    <label for="prop-id">Proposal id</label>
    <input id="prop-id" placeholder="golden-prop-restore-cta" />
    <div class="row">
      <button id="btn-inject" type="button" class="danger">Inject defect</button>
      <button id="btn-review" type="button">A25 independent review</button>
      <button id="btn-release" type="button">Release via gateway</button>
      <button id="btn-verify" type="button">Verify canary</button>
      <button id="btn-live" type="button">Try live CMS (NOT_WIRED)</button>
    </div>
    <pre id="out">—</pre>
  </section>
  <section>
    <h2>Incidents / tickets / proposals / asset</h2>
    <pre id="ledger">Loading…</pre>
  </section>
</main>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  async function refresh() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    document.getElementById('who').textContent = s.username + ' · ' + s.role + ' · local session';
    const [statusRes, incRes, tktRes, propRes, assetRes] = await Promise.all([
      api('/repair/status'),
      api('/repair/incidents'),
      api('/repair/tickets'),
      api('/repair/proposals'),
      api('/repair/fixture-asset'),
    ]);
    const status = await statusRes.json();
    const incidents = (await incRes.json()).incidents || [];
    const tickets = (await tktRes.json()).tickets || [];
    const proposals = (await propRes.json()).proposals || [];
    const asset = (await assetRes.json()).asset;
    const rows = [
      ['Live CMS repair', status.liveCmsRepairWiring],
      ['Incidents', status.incidentCount],
      ['Tickets', status.ticketCount],
      ['Proposals', status.proposalCount],
      ['Verified', status.verifiedCount],
      ['Catalog case IDs', (status.acceptanceCaseIds || []).join(', ')],
    ];
    document.getElementById('status-rows').innerHTML = rows.map(([k,v]) =>
      '<tr><td>'+k+'</td><td>'+v+'</td></tr>').join('');
    document.getElementById('note').textContent = status.honestNote || '';
    if (proposals[0]) document.getElementById('prop-id').value = proposals[0].proposalId;
    document.getElementById('ledger').textContent = JSON.stringify({
      incidents, tickets, proposals, asset
    }, null, 2);
  }
  document.getElementById('btn-seed').onclick = async () => {
    const res = await api('/repair/seed-fixtures', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || '';
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-ensure-map').onclick = async () => {
    const res = await api('/repair/ensure-fixture-mapping', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || body.reason || '';
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-inject').onclick = async () => {
    const res = await api('/repair/inject-defect', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    const body = await res.json();
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-review').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    const res = await api('/repair/independent-review', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId, approved: true, reason: 'Console A25 independent review' })
    });
    const body = await res.json();
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-release').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    const res = await api('/repair/release', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-verify').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    const res = await api('/repair/verify', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId })
    });
    const body = await res.json();
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-live').onclick = async () => {
    const proposalId = document.getElementById('prop-id').value;
    const res = await api('/repair/release', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ proposalId, preferLive: true })
    });
    const body = await res.json();
    document.getElementById('note').textContent = (body.note || '') + ' · ' + (body.details || []).join('; ');
    document.getElementById('out').textContent = JSON.stringify(body, null, 2);
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body>
</html>`;
}

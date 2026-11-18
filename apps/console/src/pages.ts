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
    location.href = '/roles';
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
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
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
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
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
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
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
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
</header>
<main>
  <section>
    <h2>Monitoring and tests (R1-05)</h2>
    <p class="muted">HTTP/DOM probes and form-to-CRM canaries with correlated receipts. Synthetic leads never enter commercial totals.</p>
    <p class="warn">Fixture mode is real offline evidence. Live Zoho is <strong>NOT_WIRED</strong> without owner credentials. Catalog cases stay NOT_RUN.</p>
    <div class="row">
      <button id="btn-http" type="button">Run fixture HTTP</button>
      <button id="btn-dom" type="button">Run fixture DOM</button>
      <button id="btn-canary" type="button">Run form→CRM canary</button>
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
    <h2>Last evidence / recent runs</h2>
    <pre id="detail">Loading…</pre>
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
    const [statusRes, runsRes] = await Promise.all([
      api('/probes/status'),
      api('/probes/runs'),
    ]);
    if (!statusRes.ok) { location.href = '/login'; return; }
    const status = await statusRes.json();
    const runsBody = await runsRes.json();
    const tbody = document.getElementById('status-rows');
    tbody.replaceChildren();
    const rows = [
      ['Live Zoho wiring', status.liveZohoWiring],
      ['Playwright wiring', status.playwrightWiring],
      ['Run count', String(status.runCount ?? 0)],
      ['Fixture receipts', String(status.fixtureReceiptCount ?? 0)],
      ['Catalog case IDs', (status.acceptanceCaseIds || []).join(', ')],
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
    document.getElementById('detail').textContent = JSON.stringify({
      lastEvidence: status.lastEvidence || runsBody.lastEvidence,
      recentRuns: (runsBody.runs || []).slice(-10).reverse(),
      note: status.note || status.honestNote,
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
  <p class="muted"><a href="/roles">Roles</a> · <a href="/mapping">Production mapping</a> · <a href="/monitoring">Monitoring</a> · <a href="/learning">Learning</a> · <a href="/authority">Authority</a></p>
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

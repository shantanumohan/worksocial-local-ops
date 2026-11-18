/** Minimal honest login + authority console HTML (R1-02). No React routes yet. */

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
    location.href = '/authority';
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
    <p class="muted">connected ≠ authorized ≠ verified. R1-02 has no live providers — expect Not connected.</p>
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

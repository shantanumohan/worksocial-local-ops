/** M4 owner staging console surfaces — safe text rendering, no desired→observed verify cheat. */

const SHARED_CSS = `
:root { --ink:#1b2a22; --panel:#fff; --accent:#2f6b4f; --warn:#8a5a00; --stop:#8b1e1e; --ok:#1f6b45; }
body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; background:
  radial-gradient(circle at 12% 0%, #d9e7de, transparent 42%),
  linear-gradient(180deg,#e7efe9,#f6f3ec); color:var(--ink); }
header { padding:1.25rem 1.5rem; border-bottom:1px solid #c9d6cc; background:rgba(255,255,255,.72); }
h1 { font-family:"IBM Plex Serif",Georgia,serif; margin:0; font-size:1.45rem; }
main { max-width:980px; margin:0 auto; padding:1.5rem; display:grid; gap:1rem; }
section { background:var(--panel); border:1px solid #c9d6cc; padding:1rem 1.1rem; }
h2 { margin:.2rem 0 .6rem; font-size:1.05rem; }
.row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
button { background:var(--accent); color:#fff; border:0; padding:.5rem .85rem; cursor:pointer; }
button.secondary { background:#405248; }
button.danger { background:var(--stop); }
table { width:100%; border-collapse:collapse; font-size:.9rem; }
th, td { text-align:left; padding:.4rem .3rem; border-bottom:1px solid #e0e7e2; vertical-align:top; }
.muted { color:#516258; font-size:.85rem; }
.warn { color:var(--warn); }
.ok { color:var(--ok); }
.pill { display:inline-block; padding:.15rem .45rem; border:1px solid #b7c5bb; font-size:.75rem; }
nav a { margin-right:.65rem; }
input, select { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #b7c5bb; margin:.25rem 0 .6rem; }
label { font-size:.85rem; }
`;

function ownerNav(): string {
  return `<p class="muted" id="who">Checking session…</p>
  <nav class="muted">
    <a href="/activation">Activation</a>
    <a href="/connections">Connections</a>
    <a href="/sites">Sites</a>
    <a href="/missions">Missions</a>
    <a href="/review">Review desk</a>
    <a href="/evidence">Evidence</a>
    ·
    <a href="/authority">Authority</a>
    <a href="/seo">SEO</a>
    <a href="/mapping">Mapping</a>
    <a href="/roles">Roles</a>
  </nav>`;
}

function apiBootScript(apiOrigin: string): string {
  return `
  const API = ${JSON.stringify(apiOrigin)};
  async function api(path, opts = {}) {
    const headers = Object.assign({ origin: window.location.origin }, opts.headers || {});
    const csrf = sessionStorage.getItem('ws_csrf');
    if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    return fetch(API + path, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  function textCell(tr, value) {
    const td = document.createElement('td');
    td.textContent = value == null ? '' : String(value);
    tr.appendChild(td);
    return td;
  }
  function pillCell(tr, value) {
    const td = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = value == null ? '' : String(value);
    td.appendChild(pill);
    tr.appendChild(td);
    return td;
  }
  async function ensureSession() {
    const session = await api('/auth/session');
    if (!session.ok) { location.href = '/login'; return null; }
    const s = await session.json();
    sessionStorage.setItem('ws_csrf', s.csrfToken);
    const who = document.getElementById('who');
    if (who) who.textContent = s.username + ' · ' + s.role + ' · local session';
    return s;
  }
`;
}

export function activationPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial — Activation</title><style>${SHARED_CSS}</style></head>
<body>
<header>
  <h1>WorkSocial</h1>
  ${ownerNav()}
</header>
<main>
  <section>
    <h2>Activation guide</h2>
    <p class="muted">First-time owner path: trusted workspace → connections → pilot site → read-and-draft. Fixture connections are honest — not live providers.</p>
    <p class="warn">Temporal remains NOT_WIRED. This is not an R1-complete claim. External effects: fixture/simulator only.</p>
    <div class="row">
      <button id="btn-start" type="button">Start activation</button>
      <button id="btn-seed" type="button" class="secondary">Seed full demo journey</button>
      <button id="btn-refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Progress</h2>
    <p class="muted" id="progress">—</p>
    <table>
      <thead><tr><th>Step</th><th>Status</th><th>Note</th></tr></thead>
      <tbody id="steps"><tr><td colspan="3" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
${apiBootScript(apiOrigin)}
  async function refresh() {
    if (!(await ensureSession())) return;
    const res = await api('/owner/activation');
    if (!res.ok) { location.href = '/login'; return; }
    const body = await res.json();
    const tbody = document.getElementById('steps');
    tbody.replaceChildren();
    const checklist = body.checklist;
    if (!checklist) {
      const tr = document.createElement('tr');
      textCell(tr, 'Not started');
      textCell(tr, '—');
      textCell(tr, 'Click Start activation or Seed full demo journey');
      tbody.appendChild(tr);
      document.getElementById('progress').textContent = '0 / —';
      return;
    }
    const p = body.progress || {};
    document.getElementById('progress').textContent =
      (p.complete || 0) + ' / ' + (p.total || checklist.steps.length) +
      (p.nextStepId ? (' · next: ' + p.nextStepId) : ' · complete');
    for (const step of checklist.steps) {
      const tr = document.createElement('tr');
      textCell(tr, step.title);
      pillCell(tr, step.status);
      textCell(tr, step.note || '');
      tbody.appendChild(tr);
    }
  }
  document.getElementById('btn-start').onclick = async () => {
    const res = await api('/owner/activation/start', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ timezone: 'America/New_York' })
    });
    const body = await res.json();
    document.getElementById('note').textContent = res.ok ? 'Activation started' : (body.error || 'failed');
    refresh();
  };
  document.getElementById('btn-seed').onclick = async () => {
    document.getElementById('note').textContent = 'Seeding demo…';
    const res = await api('/owner/seed-demo', {
      method:'POST', headers:{'content-type':'application/json'}, body:'{}'
    });
    const body = await res.json();
    if (res.ok) {
      document.getElementById('note').textContent =
        'Demo ready. Mission: ' + (body.missionSummary?.title || '') +
        ' · Continue at Review desk.';
    } else {
      document.getElementById('note').textContent = body.error || 'seed failed';
    }
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body></html>`;
}

export function connectionsPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial — Connections</title><style>${SHARED_CSS}</style></head>
<body>
<header>
  <h1>WorkSocial</h1>
  ${ownerNav()}
</header>
<main>
  <section>
    <h2>Connections</h2>
    <p class="muted">Connected ≠ authorized ≠ verified. Write readiness is separate. GSC/GA4 default to FIXTURE unless credentials exist.</p>
    <div class="row">
      <button id="btn-ensure" type="button">Ensure fixture connections</button>
      <button id="btn-refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Provider connections</h2>
    <table>
      <thead><tr><th>Connection</th><th>Mode</th><th>Account</th><th>Write ready</th><th>Note</th></tr></thead>
      <tbody id="rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
${apiBootScript(apiOrigin)}
  async function refresh() {
    if (!(await ensureSession())) return;
    const res = await api('/owner/connections');
    if (!res.ok) { location.href = '/login'; return; }
    const body = await res.json();
    const tbody = document.getElementById('rows');
    tbody.replaceChildren();
    const list = body.connections || [];
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'muted';
      td.textContent = 'No connections yet. Ensure fixture connections to continue.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const c of list) {
      const tr = document.createElement('tr');
      textCell(tr, c.displayName + ' (' + c.kind + ')');
      pillCell(tr, c.mode);
      textCell(tr, c.accountLabel || '—');
      pillCell(tr, c.writeReady ? 'yes' : 'no');
      textCell(tr, c.note || '');
      tbody.appendChild(tr);
    }
  }
  document.getElementById('btn-ensure').onclick = async () => {
    const res = await api('/owner/connections/ensure-fixture', {
      method:'POST', headers:{'content-type':'application/json'}, body:'{}'
    });
    const body = await res.json();
    document.getElementById('note').textContent = body.note || (res.ok ? 'Ready' : (body.error || 'failed'));
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body></html>`;
}

export function sitesPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial — Sites</title><style>${SHARED_CSS}</style></head>
<body>
<header>
  <h1>WorkSocial</h1>
  ${ownerNav()}
</header>
<main>
  <section>
    <h2>Sites</h2>
    <p class="muted">Register the pilot site and page. Staging CMS simulator binds automatically for fixture environments.</p>
    <label for="displayName">Display name</label>
    <input id="displayName" value="WorkSocial pilot site" />
    <label for="domain">Domain</label>
    <input id="domain" value="fixture.worksocial.local" />
    <label for="path">Pilot page path</label>
    <input id="path" value="/pilot" />
    <label for="site-select">Selected site</label>
    <select id="site-select"><option value="">— none —</option></select>
    <div class="row">
      <button id="btn-register" type="button">Register pilot site</button>
      <button id="btn-capture" type="button" class="secondary">Capture page + GSC/GA4 evidence</button>
      <button id="btn-refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Registered sites</h2>
    <table>
      <thead><tr><th>Name</th><th>Domain</th><th>Pilot page</th><th>Environment</th><th>Source</th></tr></thead>
      <tbody id="rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
${apiBootScript(apiOrigin)}
  async function refresh() {
    if (!(await ensureSession())) return;
    const res = await api('/owner/sites');
    if (!res.ok) { location.href = '/login'; return; }
    const body = await res.json();
    const tbody = document.getElementById('rows');
    tbody.replaceChildren();
    const select = document.getElementById('site-select');
    const prior = select.value;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '— none —';
    select.appendChild(empty);
    const list = body.sites || [];
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5; td.className = 'muted';
      td.textContent = 'No sites yet.';
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    for (const s of list) {
      const opt = document.createElement('option');
      opt.value = s.siteId;
      opt.textContent = s.displayName + ' (' + s.domain + ')';
      select.appendChild(opt);
      const tr = document.createElement('tr');
      textCell(tr, s.displayName);
      textCell(tr, s.domain);
      textCell(tr, s.pilotPagePath + ' · ' + s.pilotPageTitle);
      pillCell(tr, s.environment);
      textCell(tr, s.sourceBindingLabel);
      tbody.appendChild(tr);
    }
    // Prefer prior selection, else newest site (last appended).
    if (prior && list.some(s => s.siteId === prior)) select.value = prior;
    else select.value = list[list.length - 1].siteId;
  }
  document.getElementById('btn-register').onclick = async () => {
    const res = await api('/owner/sites', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({
        displayName: document.getElementById('displayName').value,
        domain: document.getElementById('domain').value,
        pilotPagePath: document.getElementById('path').value,
      })
    });
    const body = await res.json();
    document.getElementById('note').textContent = res.ok
      ? ('Registered ' + body.site.displayName)
      : (body.error || 'failed');
    refresh();
  };
  document.getElementById('btn-capture').onclick = async () => {
    const selectedSiteId = document.getElementById('site-select').value;
    if (!selectedSiteId) {
      document.getElementById('note').textContent = 'Select a site first';
      return;
    }
    const res = await api('/owner/collectors/capture', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ siteId: selectedSiteId })
    });
    const body = await res.json();
    if (res.ok) {
      document.getElementById('note').textContent =
        'Snapshot ' + body.snapshot.measurementMode +
        ' · GSC ' + body.gsc.measurementMode +
        ' · GA4 ' + body.ga4.measurementMode;
    } else {
      document.getElementById('note').textContent = body.reason || body.error || 'failed';
    }
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body></html>`;
}

export function missionsPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial — Missions</title><style>${SHARED_CSS}</style></head>
<body>
<header>
  <h1>WorkSocial</h1>
  ${ownerNav()}
</header>
<main>
  <section>
    <h2>Missions</h2>
    <p class="muted">Owner-safe mission cards. Create a pilot staging improvement after a site exists.</p>
    <label for="mission-site">Target site</label>
    <select id="mission-site"><option value="">— none —</option></select>
    <div class="row">
      <button id="btn-create" type="button">Create pilot mission</button>
      <button id="btn-refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Mission list</h2>
    <table>
      <thead><tr><th>Title</th><th>Status</th><th>Summary</th><th>Fixture</th></tr></thead>
      <tbody id="rows"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Selected mission</h2>
    <p class="muted" id="detail">Select a mission title to inspect before/desired fields.</p>
  </section>
</main>
<script>
${apiBootScript(apiOrigin)}
  async function showMission(missionId) {
    const res = await api('/owner/missions/' + encodeURIComponent(missionId));
    const body = await res.json();
    const el = document.getElementById('detail');
    el.replaceChildren();
    if (!res.ok) {
      el.textContent = body.error || 'not found';
      return;
    }
    const lines = [
      body.summary.title,
      'Status: ' + body.summary.status,
      body.summary.summary,
      'Before title: ' + (body.before?.title || '—'),
      'Desired title: ' + body.mission.desiredFields.title,
      'Desired meta: ' + body.mission.desiredFields.metaDescription,
      'Change: ' + (body.change?.status || 'none'),
    ];
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      el.appendChild(p);
    }
  }
  async function refresh() {
    if (!(await ensureSession())) return;
    const [missionsRes, sitesRes] = await Promise.all([
      api('/owner/missions'),
      api('/owner/sites'),
    ]);
    if (!missionsRes.ok) { location.href = '/login'; return; }
    const missionsBody = await missionsRes.json();
    const sitesBody = await sitesRes.json();
    const sites = sitesBody.sites || [];
    const siteSelect = document.getElementById('mission-site');
    const priorSite = siteSelect.value;
    siteSelect.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '— none —';
    siteSelect.appendChild(empty);
    for (const s of sites) {
      const opt = document.createElement('option');
      opt.value = s.siteId;
      opt.textContent = s.displayName + ' (' + s.domain + ')';
      siteSelect.appendChild(opt);
    }
    if (priorSite && sites.some(s => s.siteId === priorSite)) siteSelect.value = priorSite;
    else if (sites.length) siteSelect.value = sites[sites.length - 1].siteId;
    const tbody = document.getElementById('rows');
    tbody.replaceChildren();
    const list = missionsBody.missions || [];
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4; td.className = 'muted';
      td.textContent = 'No missions yet.';
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    for (const m of list) {
      const tr = document.createElement('tr');
      const titleTd = document.createElement('td');
      const link = document.createElement('button');
      link.type = 'button';
      link.textContent = m.title;
      link.onclick = () => showMission(m.missionId);
      titleTd.appendChild(link);
      tr.appendChild(titleTd);
      pillCell(tr, m.status);
      textCell(tr, m.summary);
      pillCell(tr, m.fixtureOnly ? 'yes' : 'no');
      tr.dataset.missionId = m.missionId || '';
      tbody.appendChild(tr);
    }
  }
  document.getElementById('btn-create').onclick = async () => {
    const siteId = document.getElementById('mission-site').value;
    if (!siteId) {
      document.getElementById('note').textContent = 'Select a site first';
      return;
    }
    const res = await api('/owner/missions', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ siteId })
    });
    const body = await res.json();
    document.getElementById('note').textContent = res.ok
      ? ('Created: ' + body.summary.title)
      : (body.reason || body.error || 'failed');
    refresh();
  };
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body></html>`;
}

export function reviewDeskPage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial — Review desk</title><style>${SHARED_CSS}</style></head>
<body>
<header>
  <h1>WorkSocial</h1>
  ${ownerNav()}
</header>
<main>
  <section>
    <h2>Review desk</h2>
    <p class="muted">May this exact staging revision proceed? Approve exact fields, then apply and verify with independent read-back — never by copying desired→observed in the browser.</p>
    <p class="warn">ACCEPTED_PENDING ≠ VERIFIED. Staging CMS is a simulator unless live credentials exist.</p>
    <div class="row">
      <button id="btn-refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p class="muted" id="note"></p>
  </section>
  <section>
    <h2>Queue</h2>
    <table>
      <thead><tr><th>Mission</th><th>Before → Desired</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="rows"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
${apiBootScript(apiOrigin)}
  async function act(path, missionId, extra) {
    const res = await api(path, {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(Object.assign({ missionId }, extra || {}))
    });
    const body = await res.json();
    document.getElementById('note').textContent =
      body.note || body.reason || body.error || (res.ok ? 'ok' : 'failed');
    refresh();
  }
  async function refresh() {
    if (!(await ensureSession())) return;
    const res = await api('/owner/review');
    if (!res.ok) { location.href = '/login'; return; }
    const body = await res.json();
    const tbody = document.getElementById('rows');
    tbody.replaceChildren();
    const queue = body.queue || [];
    if (!queue.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4; td.className = 'muted';
      td.textContent = 'Review queue empty. Seed demo or create a mission.';
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    for (const item of queue) {
      const tr = document.createElement('tr');
      textCell(tr, item.title);
      textCell(tr, (item.beforeTitle || '—') + ' → ' + item.desiredTitle);
      pillCell(tr, item.status);
      const actions = document.createElement('td');
      const addBtn = (label, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.marginRight = '0.35rem';
        b.onclick = fn;
        actions.appendChild(b);
      };
      if (item.status === 'NEEDS_REVIEW') {
        addBtn('Approve exact', () => act('/owner/review', item.missionId, { decision: 'APPROVE_EXACT' }));
        addBtn('Request revision', () => act('/owner/review', item.missionId, { decision: 'REQUEST_REVISION' }));
        addBtn('Reject', () => act('/owner/review', item.missionId, { decision: 'REJECT' }));
      }
      if (item.status === 'DRAFT') {
        addBtn('Resubmit revision', async () => {
          const title = prompt('Revised title', item.desiredTitle);
          if (!title) return;
          const res = await api('/owner/missions/revise', {
            method:'POST', headers:{'content-type':'application/json'},
            body: JSON.stringify({
              missionId: item.missionId,
              desiredFields: {
                title,
                metaDescription: 'Revised meta for staging.',
                h1: title,
                bodyExcerpt: 'Revised body excerpt for staging.',
              }
            })
          });
          const body = await res.json();
          document.getElementById('note').textContent = body.reason || body.error || (res.ok ? 'ok' : 'failed');
          refresh();
        });
      }
      if (item.status === 'APPROVED') {
        addBtn('Apply staging', () => act('/owner/staging/apply', item.missionId));
      }
      if (item.status === 'ACCEPTED_PENDING') {
        addBtn('Independent verify', () => act('/owner/staging/verify', item.missionId));
      }
      if (item.status === 'RECOVERY_REQUIRED') {
        addBtn('Recover', () => act('/owner/staging/recover', item.missionId));
      }
      tr.appendChild(actions);
      tbody.appendChild(tr);
    }
  }
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body></html>`;
}

export function evidencePage(apiOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial — Evidence</title><style>${SHARED_CSS}</style></head>
<body>
<header>
  <h1>WorkSocial</h1>
  ${ownerNav()}
</header>
<main>
  <section>
    <h2>Evidence and changes</h2>
    <p class="muted">Page snapshots, deterministic checks, GSC/GA4 observations, staging apply, and independent read-back. Measurement mode is labeled FIXTURE or LIVE.</p>
    <div class="row">
      <button id="btn-refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p class="muted" id="status"></p>
  </section>
  <section>
    <h2>Evidence log</h2>
    <table>
      <thead><tr><th>When</th><th>Kind</th><th>Title</th><th>Mode</th><th>Summary</th></tr></thead>
      <tbody id="rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
${apiBootScript(apiOrigin)}
  async function refresh() {
    if (!(await ensureSession())) return;
    const [evRes, stRes] = await Promise.all([
      api('/owner/evidence'),
      api('/owner/status'),
    ]);
    if (!evRes.ok) { location.href = '/login'; return; }
    const ev = await evRes.json();
    const st = await stRes.json();
    document.getElementById('status').textContent =
      'Sites ' + st.siteCount +
      ' · Missions ' + st.missionCount +
      ' · Evidence ' + st.evidenceCount +
      ' · CMS ' + st.stagingCmsMode +
      ' · Temporal ' + st.temporalWiring;
    const tbody = document.getElementById('rows');
    tbody.replaceChildren();
    const list = ev.evidence || [];
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5; td.className = 'muted';
      td.textContent = 'No evidence yet.';
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    for (const item of list) {
      const tr = document.createElement('tr');
      textCell(tr, item.createdAtIso);
      pillCell(tr, item.kind);
      textCell(tr, item.title);
      pillCell(tr, item.measurementMode || '—');
      textCell(tr, item.summary);
      tbody.appendChild(tr);
    }
  }
  document.getElementById('btn-refresh').onclick = () => refresh();
  refresh();
</script>
</body></html>`;
}

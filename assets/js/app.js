const BASE    = './api/index.php?path=';
const API_KEY = 'evaluasi-secret-2025';

let state = {
  currentEvalId: null,
  allEval: [],
  dtEval: null,
  dtIssue: null,
};

// ── API HELPERS ──────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const GET    = path     => api('GET',    path);
const POST   = (path,b) => api('POST',   path, b);
const PUT    = (path,b) => api('PUT',    path, b);
const DELETE = path     => api('DELETE', path);

const toast = (icon, title) => Swal.fire({
  icon, title, toast: true, position: 'top-end',
  showConfirmButton: false, timer: 2200, timerProgressBar: true,
});
const fmtDate = iso => iso ? iso.split('-').reverse().join('-') : '-';
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── VIEWS ────────────────────────────────────────────────────
function showView(name, ctx = {}) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === name));

  const titles = {
    'list'      : ['Evaluation List',   'Master data evaluasi & issue'],
    'form-eval' : [ctx.mode === 'edit' ? 'Edit Evaluation' : 'Add Evaluation', ''],
    'detail'    : ['Evaluation Detail', ''],
    'form-issue': [ctx.mode === 'edit' ? 'Edit Issue' : 'Add Issue', ''],
  };
  const [t, s] = titles[name] || ['', ''];
  document.getElementById('pageTitle').textContent    = t;
  document.getElementById('pageSubtitle').textContent = s;

  if (name === 'list')   location.hash = 'list';
  if (name === 'detail') location.hash = 'detail/' + (ctx.id || state.currentEvalId || '');

  if (name === 'list')       loadList();
  if (name === 'form-eval')  initFormEval(ctx);
  if (name === 'detail')     initDetail();
  if (name === 'form-issue') initFormIssue(ctx);
}

// ── LIST ─────────────────────────────────────────────────────
async function loadList() {
  try {
    state.allEval = await GET('evaluasi');
    renderEvalTable(state.allEval);
  } catch(e) { toast('error', e.message); }
}

function renderEvalTable(rows) {
  if (state.dtEval) { state.dtEval.destroy(); state.dtEval = null; }

  const tbody = document.getElementById('eval-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">
      <span class="material-symbols-rounded">inbox</span>
      <p>Belum ada data. Klik <strong>Add</strong> untuk mulai.</p>
    </div></td></tr>`;
    return;
  }

  document.getElementById('eval-badge-count').textContent = rows.length + ' data';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="id-chip" onclick="goDetail('${r.id}')">${r.id}</span></td>
      <td>${esc(r.nama)}</td>
      <td class="text-center"><span class="issue-chip">${r.total_issue} issue</span></td>
      <td class="text-center">
        <div class="d-flex justify-content-center gap-1">
          <button class="act-btn" onclick="goDetail('${r.id}')" title="Detail">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="act-btn warn" onclick="showView('form-eval',{mode:'edit',id:'${r.id}'})" title="Edit">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button class="act-btn danger" onclick="deleteEval('${r.id}')" title="Delete">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>
    </tr>`).join('');

  state.dtEval = $('#tbl-eval').DataTable({
    autoWidth: false, responsive: true,
    order: [[0,'asc']], pageLength: 10, lengthMenu: [5,10,25,50],
    dom: "<'row mb-2'<'col-sm-6 d-flex align-items-center gap-2'l><'col-sm-6 d-flex justify-content-end'f>>" +
         "<'row'<'col-12'tr>>" +
         "<'row mt-2'<'col-sm-5'i><'col-sm-7 d-flex justify-content-end'p>>",
    language: { search: '', searchPlaceholder: 'Cari data…', lengthMenu: 'Show _MENU_',
      info: 'Menampilkan _START_–_END_ dari _TOTAL_ data', infoEmpty: 'Tidak ada data', zeroRecords: 'Data tidak ditemukan' },
    columnDefs: [{ targets: [0,2,3], orderable: false }],
    initComplete: function() {
      const sel = $(this.api().table().container()).find('.dataTables_length select');
      sel.addClass('form-select').css('width','auto');
      sel.select2({ theme:'bootstrap-5', minimumResultsForSearch: Infinity, width:'auto', dropdownAutoWidth: true });
    }
  });
}

async function deleteEval(id) {
  const res = await Swal.fire({
    title: 'Hapus evaluasi ini?', text: 'Semua issue terkait ikut terhapus.',
    icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#ef4444', confirmButtonText: 'Ya, hapus!',
  });
  if (!res.isConfirmed) return;
  try { await DELETE('evaluasi/' + id); toast('success', 'Data berhasil dihapus'); loadList(); }
  catch(e) { toast('error', e.message); }
}

// ── FORM EVAL ────────────────────────────────────────────────
async function initFormEval(ctx) {
  const isEdit = ctx.mode === 'edit';
  document.getElementById('form-eval-title').textContent = isEdit ? 'Edit Evaluation' : 'Add Evaluation';
  document.getElementById('eval-nama').value       = '';
  document.getElementById('eval-nama-err').textContent = '';
  document.getElementById('eval-id-hidden').value  = '';
  document.getElementById('eval-id-display').value = '';
  document.getElementById('eval-id-row').style.display = 'none';
  document.getElementById('btn-save-eval').innerHTML =
    `<span class="material-symbols-rounded">check</span> ${isEdit ? 'Update' : 'Save'}`;

  if (isEdit && ctx.id) {
    try {
      const ev = await GET('evaluasi/' + ctx.id);
      document.getElementById('eval-id-hidden').value  = ev.id;
      document.getElementById('eval-id-display').value = ev.id;
      document.getElementById('eval-nama').value        = ev.nama;
      document.getElementById('eval-id-row').style.display = 'block';
    } catch(e) { toast('error', e.message); showView('list'); }
  }
}

async function saveEval() {
  const id   = document.getElementById('eval-id-hidden').value;
  const nama = document.getElementById('eval-nama').value.trim();
  const errEl = document.getElementById('eval-nama-err');
  const ctrl  = document.getElementById('eval-nama');
  errEl.textContent = ''; ctrl.classList.remove('invalid');
  if (!nama) { ctrl.classList.add('invalid'); errEl.textContent = 'Nama wajib diisi'; return; }

  const btn = document.getElementById('btn-save-eval');
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    if (id) { await PUT('evaluasi/' + id, { nama }); toast('success', 'Data berhasil diupdate'); }
    else     { await POST('evaluasi', { nama });       toast('success', 'Data berhasil ditambahkan'); }
    const lastEval = localStorage.getItem('ev_last_eval');
    if (id && lastEval) { state.currentEvalId = lastEval; showView('detail'); }
    else showView('list');
  } catch(e) { ctrl.classList.add('invalid'); errEl.textContent = e.message; }
  finally {
    btn.innerHTML = `<span class="material-symbols-rounded">check</span> ${id ? 'Update' : 'Save'}`;
    btn.disabled = false;
  }
}

// ── DETAIL ───────────────────────────────────────────────────
async function initDetail() {
  try {
    if (!state.allEval.length) state.allEval = await GET('evaluasi');
    const sel = document.getElementById('eval-selector');
    if ($(sel).hasClass('select2-hidden-accessible')) $(sel).select2('destroy');
    sel.innerHTML = state.allEval.map(e =>
      `<option value="${e.id}" ${e.id === state.currentEvalId ? 'selected' : ''}>${e.id} — ${esc(e.nama)} (${e.total_issue} Issue)</option>`
    ).join('');
    const id = state.currentEvalId || state.allEval[0]?.id;
    if (id) { state.currentEvalId = id; sel.value = id; }
    $(sel).select2({ theme: 'bootstrap-5', width: '100%', dropdownAutoWidth: false })
          .on('change', function() { loadDetail(this.value); });
    if (id) loadDetail(id);
  } catch(e) { toast('error', e.message); }
}

async function loadDetail(id) {
  state.currentEvalId = id;
  localStorage.setItem('ev_last_eval', id);
  location.hash = 'detail/' + id;
  try {
    const [ev, issues] = await Promise.all([GET('evaluasi/' + id), GET('evaluasi/' + id + '/issues')]);
    document.getElementById('detail-eval-name').textContent = ev.nama;
    renderIssueTable(issues);
  } catch(e) { toast('error', e.message); }
}

function renderIssueTable(rows) {
  if (state.dtIssue) { state.dtIssue.destroy(); state.dtIssue = null; }

  const tbody = document.getElementById('issue-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <span class="material-symbols-rounded">task_alt</span>
      <p>Belum ada issue. Klik <strong>Add Issue</strong> untuk mulai.</p>
    </div></td></tr>`;
    return;
  }

  document.getElementById('issue-badge-count').textContent = rows.length + ' issue';
  tbody.innerHTML = rows.map((r,i) => `
    <tr>
      <td class="text-center" style="color:var(--text-muted);font-size:.78rem">${i+1}</td>
      <td><div class="cell-name-main" style="white-space:pre-wrap;word-break:break-word">${esc(r.issue)}</div></td>
      <td style="word-break:break-word">
        ${esc(r.note?.trim()) ? `<span style="font-size:.8rem;color:var(--text-muted)">${esc(r.note.trim())}</span>` : '<span style="color:var(--text-muted);font-size:.8rem">—</span>'}
      </td>
      <td class="text-center" style="font-size:.8rem">${fmtDate(r.deadline)}</td>
      <td class="text-center">${r.status === 'Sudah' ? '<span class="badge-done">Done</span>' : '<span class="badge-pending">Pending</span>'}</td>
      <td class="text-center">
        <div class="d-flex justify-content-center gap-1">
          <button class="act-btn warn" onclick="editIssue(${r.id})" title="Edit">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button class="act-btn danger" onclick="deleteIssue(${r.id})" title="Delete">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>
    </tr>`).join('');

  state.dtIssue = $('#tbl-issue').DataTable({
    autoWidth: false, responsive: true,
    pageLength: 100, lengthMenu: [10,25,50,100], order: [],
    dom: "<'row mb-2'<'col-sm-6 d-flex align-items-center gap-2'l><'col-sm-6 d-flex justify-content-end'f>>" +
         "<'row'<'col-12'tr>>" +
         "<'row mt-2'<'col-sm-5'i><'col-sm-7 d-flex justify-content-end'p>>",
    language: { search: '', searchPlaceholder: 'Cari issue…', lengthMenu: 'Show _MENU_',
      info: 'Menampilkan _START_–_END_ dari _TOTAL_ issue', infoEmpty: 'Tidak ada issue', zeroRecords: 'Issue tidak ditemukan' },
    columnDefs: [{ targets: [0,5], orderable: false }],
    initComplete: function() {
      const sel = $(this.api().table().container()).find('.dataTables_length select');
      sel.addClass('form-select').css('width','auto');
      sel.select2({ theme:'bootstrap-5', minimumResultsForSearch: Infinity, width:'auto', dropdownAutoWidth: true });
    }
  });
}

function goDetail(id) { state.currentEvalId = id; showView('detail'); }
function editCurrentEval() { showView('form-eval', { mode: 'edit', id: state.currentEvalId }); }

// ── FORM ISSUE ───────────────────────────────────────────────
async function initFormIssue(ctx) {
  const isEdit = ctx.mode === 'edit';
  document.getElementById('form-issue-title').textContent = isEdit ? 'Edit Issue' : 'Add Issue';
  document.getElementById('issue-text').value     = '';
  document.getElementById('issue-note').value     = '';
  document.getElementById('issue-deadline').value = '';
  document.getElementById('issue-id-hidden').value      = '';
  document.getElementById('issue-eval-id-hidden').value = state.currentEvalId;
  document.querySelectorAll('[name="issue-status"]').forEach(r => r.checked = r.value === 'Belum');
  ['issue-text-err','issue-deadline-err','issue-status-err'].forEach(id => document.getElementById(id).textContent = '');
  document.getElementById('btn-save-issue').innerHTML =
    `<span class="material-symbols-rounded">check</span> ${isEdit ? 'Update Issue' : 'Save Issue'}`;

  if (isEdit && ctx.id) {
    try {
      const iss = await GET('issues/' + ctx.id);
      document.getElementById('issue-id-hidden').value      = iss.id;
      document.getElementById('issue-eval-id-hidden').value = iss.evaluasi_id;
      document.getElementById('issue-text').value     = iss.issue;
      document.getElementById('issue-note').value     = iss.note || '';
      document.getElementById('issue-deadline').value = iss.deadline;
      document.querySelectorAll('[name="issue-status"]').forEach(r => r.checked = r.value === iss.status);
    } catch(e) { toast('error', e.message); showView('detail'); }
  }
}

function editIssue(id) { showView('form-issue', { mode: 'edit', id }); }

async function saveIssue() {
  const id       = document.getElementById('issue-id-hidden').value;
  const evalId   = document.getElementById('issue-eval-id-hidden').value;
  const issue    = document.getElementById('issue-text').value.trim();
  const note     = document.getElementById('issue-note').value.trim();
  const deadline = document.getElementById('issue-deadline').value;
  const status   = document.querySelector('[name="issue-status"]:checked')?.value;

  let valid = true;
  [['issue-text',issue,'Issue wajib diisi'],['issue-deadline',deadline,'Deadline wajib diisi']].forEach(([fid,val,msg]) => {
    const el = document.getElementById(fid), er = document.getElementById(fid+'-err');
    if (!val) { el.classList.add('invalid'); er.textContent = msg; valid = false; }
    else { el.classList.remove('invalid'); er.textContent = ''; }
  });
  if (!valid) return;

  const btn = document.getElementById('btn-save-issue');
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    const body = { evaluasi_id: evalId, issue, note: note||null, deadline, status };
    if (id) { await PUT('issues/' + id, body); toast('success', 'Issue berhasil diupdate'); }
    else     { await POST('issues', body);       toast('success', 'Issue berhasil ditambahkan'); }
    showView('detail');
  } catch(e) { toast('error', e.message); }
  finally {
    btn.innerHTML = `<span class="material-symbols-rounded">check</span> ${id ? 'Update Issue' : 'Save Issue'}`;
    btn.disabled = false;
  }
}

async function deleteIssue(id) {
  const res = await Swal.fire({
    title: 'Hapus issue ini?', icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#ef4444', confirmButtonText: 'Ya, hapus!',
  });
  if (!res.isConfirmed) return;
  try { await DELETE('issues/' + id); toast('success', 'Issue berhasil dihapus'); loadDetail(state.currentEvalId); }
  catch(e) { toast('error', e.message); }
}

// ── SIDEBAR ──────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
document.getElementById('sbToggle').addEventListener('click', () => sidebar.classList.toggle('collapsed'));
document.getElementById('sbToggleMob').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  document.getElementById('overlay').classList.toggle('show', !sidebar.classList.contains('collapsed'));
});
document.getElementById('overlay').addEventListener('click', () => {
  sidebar.classList.add('collapsed');
  document.getElementById('overlay').classList.remove('show');
});
if (window.innerWidth > 768) sidebar.classList.remove('collapsed');

// ── DARK MODE ────────────────────────────────────────────────
const themeBtn   = document.getElementById('themeBtn');
const themeIcon  = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const applyTheme = dark => {
  document.body.classList.toggle('dark', dark);
  themeIcon.textContent  = dark ? 'light_mode' : 'dark_mode';
  themeLabel.textContent = dark ? 'Light Mode' : 'Dark Mode';
};
const saved = localStorage.getItem('ev_theme');
applyTheme(saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme:dark)').matches));
themeBtn.addEventListener('click', () => {
  const dark = !document.body.classList.contains('dark');
  localStorage.setItem('ev_theme', dark ? 'dark' : 'light');
  applyTheme(dark);
});

// ── INIT FROM HASH ───────────────────────────────────────────
function initFromHash() {
  const hash = location.hash.replace('#', '');
  const [view, id] = hash.split('/');
  if (view === 'detail' && id) { state.currentEvalId = id; showView('detail'); }
  else showView('list');
}
window.addEventListener('hashchange', initFromHash);
initFromHash();

import { fetchUserRepos, updateRepoVisibility } from './api.js';

// Application State
const state = {
  repos: [],
  token: '',
};

// DOM Selectors
const elements = {
  tokenInput: document.getElementById('tokenInput'),
  fetchBtn: document.getElementById('fetchBtn'),
  filterSelect: document.getElementById('visibilityFilter'),
  logs: document.getElementById('logs'),
  repoCount: document.getElementById('repoCount'),
  repoTableBody: document.getElementById('repoTableBody'),
  selectAll: document.getElementById('selectAll'),
  bulkActions: document.getElementById('bulkActions'),
  bulkPrivateBtn: document.getElementById('bulkPrivateBtn'),
  bulkPublicBtn: document.getElementById('bulkPublicBtn'),
};

function log(msg) {
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  elements.logs.appendChild(p);
  elements.logs.scrollTop = elements.logs.scrollHeight;
}

function updateBulkActionBar() {
  const checked = document.querySelectorAll('.repo-select:checked');
  elements.bulkActions.classList.toggle('hidden', checked.length === 0);
}

function renderTable() {
  const filter = elements.filterSelect.value;
  const filtered = state.repos.filter((repo) => {
    if (filter === 'public') return !repo.private;
    if (filter === 'private') return repo.private;
    return true;
  });

  elements.repoCount.textContent = filtered.length;

  elements.repoTableBody.innerHTML = filtered
    .map(
      (r) => `
      <tr class="hover:bg-gray-900/60 transition">
        <td class="p-3"><input type="checkbox" class="repo-select" data-full-name="${r.full_name}" /></td>
        <td class="p-3 font-semibold text-white">${r.name}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-xs ${
            r.private
              ? 'bg-amber-950 text-amber-300 border border-amber-800'
              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
          }">
            ${r.private ? 'Private' : 'Public'}
          </span>
        </td>
        <td class="p-3 text-gray-400">${r.stargazers_count}</td>
        <td class="p-3 text-gray-400">${new Date(r.pushed_at).toLocaleDateString()}</td>
        <td class="p-3 text-right">
          <button 
            data-action="toggle-single" 
            data-full-name="${r.full_name}" 
            data-target-private="${!r.private}"
            class="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 text-gray-300 transition">
            Make ${r.private ? 'Public' : 'Private'}
          </button>
        </td>
      </tr>
    `
    )
    .join('');

  elements.selectAll.checked = false;
  updateBulkActionBar();
}

async function handleFetch() {
  state.token = elements.tokenInput.value.trim();
  if (!state.token) return alert('Enter a GitHub PAT');

  log('Fetching repositories...');
  try {
    state.repos = await fetchUserRepos(state.token);
    log(`Loaded ${state.repos.length} repositories.`);
    renderTable();
  } catch (err) {
    log(`Fetch error: ${err.message}`);
  }
}

async function handleBatchMutation(makePrivate) {
  const selectedCheckboxes = Array.from(document.querySelectorAll('.repo-select:checked'));
  const targets = selectedCheckboxes.map((cb) => cb.dataset.fullName);
  const targetLabel = makePrivate ? 'private' : 'public';

  log(`Starting batch update for ${targets.length} repos to ${targetLabel}...`);

  for (const fullName of targets) {
    try {
      await updateRepoVisibility(state.token, fullName, makePrivate);
      const repo = state.repos.find((r) => r.full_name === fullName);
      if (repo) repo.private = makePrivate;
      log(`✓ ${fullName} -> ${targetLabel}`);
    } catch (err) {
      log(`✗ Failed ${fullName}: ${err.message}`);
    }
  }

  log(`Batch update completed.`);
  renderTable();
}

// Event Listeners
elements.fetchBtn.addEventListener('click', handleFetch);
elements.filterSelect.addEventListener('change', renderTable);
elements.bulkPrivateBtn.addEventListener('click', () => handleBatchMutation(true));
elements.bulkPublicBtn.addEventListener('click', () => handleBatchMutation(false));

elements.selectAll.addEventListener('change', (e) => {
  document.querySelectorAll('.repo-select').forEach((cb) => (cb.checked = e.target.checked));
  updateBulkActionBar();
});

elements.repoTableBody.addEventListener('change', (e) => {
  if (e.target.classList.contains('repo-select')) {
    updateBulkActionBar();
  }
});

// Event Delegation for Single Row Toggles
elements.repoTableBody.addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-action="toggle-single"]');
  if (!button) return;

  const { fullName, targetPrivate } = button.dataset;
  const isPrivate = targetPrivate === 'true';
  const targetLabel = isPrivate ? 'private' : 'public';

  log(`Updating ${fullName} to ${targetLabel}...`);
  try {
    await updateRepoVisibility(state.token, fullName, isPrivate);
    const repo = state.repos.find((r) => r.full_name === fullName);
    if (repo) repo.private = isPrivate;
    log(`✓ ${fullName} is now ${targetLabel}`);
    renderTable();
  } catch (err) {
    log(`✗ Failed: ${err.message}`);
  }
});
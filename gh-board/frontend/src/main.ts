// Auto-generated Go bindings from Wails
import { FetchRepos, SetVisibilityBatch } from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';

// Local UI state
let repos: main.Repository[] = [];
let token = '';

// DOM Elements
const elements = {
  tokenInput: document.getElementById('tokenInput') as HTMLInputElement,
  fetchBtn: document.getElementById('fetchBtn') as HTMLButtonElement,
  filterSelect: document.getElementById('visibilityFilter') as HTMLSelectElement,
  logs: document.getElementById('logs') as HTMLDivElement,
  repoCount: document.getElementById('repoCount') as HTMLSpanElement,
  repoTableBody: document.getElementById('repoTableBody') as HTMLTableSectionElement,
  selectAll: document.getElementById('selectAll') as HTMLInputElement,
  bulkActions: document.getElementById('bulkActions') as HTMLDivElement,
  bulkPrivateBtn: document.getElementById('bulkPrivateBtn') as HTMLButtonElement,
  bulkPublicBtn: document.getElementById('bulkPublicBtn') as HTMLButtonElement,
};

// 1. Logger helper
function log(msg: string) {
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  elements.logs.appendChild(p);
  elements.logs.scrollTop = elements.logs.scrollHeight;
}

// 2. Toggle the visibility of the bulk actions button group
function updateBulkState() {
  const checked = document.querySelectorAll<HTMLInputElement>('.repo-select:checked');
  elements.bulkActions.classList.toggle('hidden', checked.length === 0);
}

// 3. Render the repo table based on active filter
function renderTable() {
  const filter = elements.filterSelect.value;
  const filtered = repos.filter((r) => {
    if (filter === 'public') return !r.private;
    if (filter === 'private') return r.private;
    return true;
  });

  elements.repoCount.textContent = filtered.length.toString();

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
  updateBulkState();
}

// 1. Fetch Repositories via Go Backend
elements.fetchBtn.addEventListener('click', async () => {
  token = elements.tokenInput.value.trim();
  if (!token) return alert('Enter a PAT');

  log('Calling Go backend to fetch repos...');
  try {
    repos = await FetchRepos(token);
    log(`Successfully fetched ${repos.length} repositories.`);
    renderTable();
  } catch (err: any) {
    log(`Go Error: ${err}`);
  }
});

// 2. Batch Update Visibility via Go Backend
async function runBatchMutation(makePrivate: boolean) {
  const selected = Array.from(
    document.querySelectorAll<HTMLInputElement>('.repo-select:checked')
  ).map((cb) => cb.dataset.fullName!);

  const targetLabel = makePrivate ? 'private' : 'public';
  log(`Batch updating ${selected.length} repositories to ${targetLabel}...`);

  try {
    const results = await SetVisibilityBatch(token, selected, makePrivate);
    for (const res of results) {
      if (res.success) {
        log(`✓ ${res.full_name} -> ${targetLabel}`);
        const r = repos.find((repo) => repo.full_name === res.full_name);
        if (r) r.private = makePrivate;
      } else {
        log(`✗ Failed ${res.full_name}: ${res.error}`);
      }
    }
  } catch (err: any) {
    log(`Batch error: ${err}`);
  }

  renderTable();
}

// 1. Button and Filter Event Listeners
elements.bulkPrivateBtn.addEventListener('click', () => runBatchMutation(true));
elements.bulkPublicBtn.addEventListener('click', () => runBatchMutation(false));
elements.filterSelect.addEventListener('change', renderTable);

// 2. Select All Checkbox
elements.selectAll.addEventListener('change', (e) => {
  const isChecked = (e.target as HTMLInputElement).checked;
  document.querySelectorAll<HTMLInputElement>('.repo-select').forEach((cb) => (cb.checked = isChecked));
  updateBulkState();
});

// 3. Individual Checkbox Change
elements.repoTableBody.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).classList.contains('repo-select')) {
    updateBulkState();
  }
});

// 4. Single-Row Quick Toggle Button
elements.repoTableBody.addEventListener('click', async (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="toggle-single"]');
  if (!button) return;

  const fullName = button.dataset.fullName!;
  const targetPrivate = button.dataset.targetPrivate === 'true';

  log(`Updating ${fullName}...`);
  try {
    const results = await SetVisibilityBatch(token, [fullName], targetPrivate);
    if (results[0]?.success) {
      log(`✓ ${fullName} updated.`);
      const r = repos.find((repo) => repo.full_name === fullName);
      if (r) r.private = targetPrivate;
      renderTable();
    } else {
      log(`✗ Failed: ${results[0]?.error}`);
    }
  } catch (err: any) {
    log(`Error: ${err}`);
  }
});
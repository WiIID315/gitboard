import { FetchRepos, SetVisibilityBatch, InitiateDeviceFlow, PollForToken } from '../wailsjs/go/main/App';
import { BrowserOpenURL } from '../wailsjs/runtime/runtime';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  stargazers_count: number;
  pushed_at: string;
}

let repos: Repository[] = [];
let accessToken = localStorage.getItem('gh_token') || '';
let verificationUri = '';

const elements = {
  authSection: document.getElementById('authSection') as HTMLDivElement,
  userSection: document.getElementById('userSection') as HTMLDivElement,
  loginBtn: document.getElementById('loginBtn') as HTMLButtonElement,
  logoutBtn: document.getElementById('logoutBtn') as HTMLButtonElement,
  fetchBtn: document.getElementById('fetchBtn') as HTMLButtonElement,
  authModal: document.getElementById('authModal') as HTMLDivElement,
  userCodeDisplay: document.getElementById('userCodeDisplay') as HTMLSpanElement,
  openBrowserBtn: document.getElementById('openBrowserBtn') as HTMLButtonElement,
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

// 2. Toggle Auth UI based on whether a token exists
function updateAuthState() {
  const isAuthenticated = !!accessToken;
  elements.authSection.classList.toggle('hidden', isAuthenticated);
  elements.userSection.classList.toggle('hidden', !isAuthenticated);

  if (isAuthenticated && repos.length === 0) {
    loadRepositories();
  }
}

// 3. Toggle bulk actions toolbar
function updateBulkState() {
  const checked = document.querySelectorAll<HTMLInputElement>('.repo-select:checked');
  elements.bulkActions.classList.toggle('hidden', checked.length === 0);
}

// 4. Render Table
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

// 5. Fetch repositories using active access token
async function loadRepositories() {
  if (!accessToken) return;
  log('Fetching repositories from GitHub...');
  try {
    repos = await FetchRepos(accessToken);
    log(`Fetched ${repos.length} repositories.`);
    renderTable();
  } catch (err: any) {
    log(`Error fetching repos: ${err}`);
  }
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
    const results = await SetVisibilityBatch(accessToken, [fullName], targetPrivate);
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

// 1. OAuth Sign In Flow
elements.loginBtn.addEventListener('click', async () => {
  log('Requesting GitHub device authorization code...');
  try {
    const res = await InitiateDeviceFlow();
    verificationUri = res.verification_uri;

    // Display the code in UI
    elements.userCodeDisplay.textContent = res.user_code;
    elements.authModal.classList.remove('hidden');

    // Automatically copy code to clipboard & open browser
    await navigator.clipboard.writeText(res.user_code);
    log(`Code ${res.user_code} copied to clipboard! Opening browser...`);
    BrowserOpenURL(verificationUri);

    // Poll backend until user finishes in browser
    const token = await PollForToken(res.device_code, res.interval);
    accessToken = token;
    localStorage.setItem('gh_token', token);
    elements.authModal.classList.add('hidden');
    log('Authentication successful!');
    updateAuthState();
  } catch (err: any) {
    log(`Auth error: ${err}`);
    elements.authModal.classList.add('hidden');
  }
});

// 2. Open Verification Page Button in Modal
elements.openBrowserBtn.addEventListener('click', () => {
  if (verificationUri) {
    BrowserOpenURL(verificationUri);
  }
});

// 3. Sign Out
elements.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('gh_token');
  accessToken = '';
  repos = [];
  elements.repoTableBody.innerHTML = '';
  elements.repoCount.textContent = '0';
  log('Signed out.');
  updateAuthState();
});

// 4. Manual Refresh Button
elements.fetchBtn.addEventListener('click', loadRepositories);

// 5. Batch Mutation Logic
async function runBatchMutation(makePrivate: boolean) {
  const selected = Array.from(
    document.querySelectorAll<HTMLInputElement>('.repo-select:checked')
  ).map((cb) => cb.dataset.fullName!);

  const targetLabel = makePrivate ? 'private' : 'public';
  log(`Batch updating ${selected.length} repositories to ${targetLabel}...`);

  try {
    const results = await SetVisibilityBatch(accessToken, selected, makePrivate);
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

elements.bulkPrivateBtn.addEventListener('click', () => runBatchMutation(true));
elements.bulkPublicBtn.addEventListener('click', () => runBatchMutation(false));
elements.filterSelect.addEventListener('change', renderTable);

// 6. Select All & Table Interaction
elements.selectAll.addEventListener('change', (e) => {
  const isChecked = (e.target as HTMLInputElement).checked;
  document.querySelectorAll<HTMLInputElement>('.repo-select').forEach((cb) => (cb.checked = isChecked));
  updateBulkState();
});

elements.repoTableBody.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).classList.contains('repo-select')) {
    updateBulkState();
  }
});

// 7. Single Row Quick Toggle
elements.repoTableBody.addEventListener('click', async (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="toggle-single"]');
  if (!button) return;

  const fullName = button.dataset.fullName!;
  const targetPrivate = button.dataset.targetPrivate === 'true';

  log(`Updating ${fullName}...`);
  try {
    const results = await SetVisibilityBatch(accessToken, [fullName], targetPrivate);
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

// Initialize authentication status on startup
updateAuthState();
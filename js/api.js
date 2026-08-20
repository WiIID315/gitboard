const BASE_URL = 'https://api.github.com';

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

export async function fetchUserRepos(token) {
  const response = await fetch(`${BASE_URL}/user/repos?per_page=100&affiliation=owner&sort=updated`, {
    headers: getHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function updateRepoVisibility(token, fullName, makePrivate) {
  const response = await fetch(`${BASE_URL}/repos/${fullName}`, {
    method: 'PATCH',
    headers: getHeaders(token),
    body: JSON.stringify({ private: makePrivate }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
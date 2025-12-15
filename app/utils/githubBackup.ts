const BACKUP_FILENAME = "authenticator_backup.enc";

async function githubRequest(
  path: string,
  pat: string,
  options: RequestInit = {}
) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res;
}

/**
 * Upload an encrypted backup to a new private gist.
 * Returns the created gist ID.
 */
export async function uploadGistBackup(pat: string, cipherText: string): Promise<string> {
  const body = {
    description: "Authenticator backup",
    public: false,
    files: {
      [BACKUP_FILENAME]: {
        content: cipherText,
      },
    },
  };

  const res = await githubRequest("/gists", pat, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return json.id;
}

/**
 * Fetch the most recent backup gist and return its content, or null if none found.
 */
export async function getGistBackup(pat: string): Promise<string | null> {
  // Get user's gists
  const res = await githubRequest("/gists", pat);
  const gists = await res.json();

  if (!Array.isArray(gists) || gists.length === 0) return null;

  // Find newest gist containing the backup file
  let latest: any = null;
  for (const g of gists) {
    if (!g.files) continue;
    if (g.files[BACKUP_FILENAME]) {
      if (!latest) latest = g;
      else {
        const a = new Date(g.updated_at || g.created_at || 0);
        const b = new Date(latest.updated_at || latest.created_at || 0);
        if (a > b) latest = g;
      }
    }
  }

  if (!latest) return null;

  // Fetch full gist to read file content
  const detailRes = await githubRequest(`/gists/${latest.id}`, pat);
  const detail = await detailRes.json();

  const file = detail.files?.[BACKUP_FILENAME];
  if (!file || typeof file.content !== "string") return null;

  return file.content.trim();
}


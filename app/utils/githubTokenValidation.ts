/**
 * Validates a GitHub Personal Access Token (PAT)
 * - Checks token format
 * - Verifies token with GitHub API
 * - Ensures required "gist" scope exists
 */

export type GitHubTokenValidationResult = {
  valid: boolean;
  reason?: string;
  scopes?: string[];
  username?: string;
};

export function isValidGitHubTokenFormat(token: string): boolean {
  if (!token) return false;

  return (
    token.startsWith("ghp_") ||
    token.startsWith("github_pat_")
  ) && token.length >= 40;
}

export async function validateGitHubToken(
  token: string
): Promise<GitHubTokenValidationResult> {
  if (!isValidGitHubTokenFormat(token)) {
    return {
      valid: false,
      reason: "Token format is invalid",
    };
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status === 401) {
      return {
        valid: false,
        reason: "Token is invalid or revoked",
      };
    }

    if (!res.ok) {
      return {
        valid: false,
        reason: `GitHub API error (${res.status})`,
      };
    }

    const scopesHeader =
      res.headers.get("x-oauth-scopes") ||
      res.headers.get("X-OAuth-Scopes");

    const scopes = scopesHeader
      ? scopesHeader.split(",").map(s => s.trim())
      : [];

    if (!scopes.includes("gist")) {
      return {
        valid: false,
        scopes,
        reason: "Token is missing required 'gist' scope",
      };
    }

    const user = await res.json();

    return {
      valid: true,
      scopes,
      username: user?.login,
    };
  } catch (err) {
    return {
      valid: false,
      reason: "Network error validating token",
    };
  }
}

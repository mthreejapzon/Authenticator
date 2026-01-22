import { Alert, Platform } from "react-native";

/**
 * Validates GitHub Personal Access Token format
 */
export function isValidGitHubTokenFormat(token: string): boolean {
  if (!token || token.length < 40) {
    return false;
  }

  // GitHub token prefixes
  const validPrefixes = [
    'ghp_',      // Personal Access Token
    'gho_',      // OAuth Access Token
    'ghu_',      // User-to-Server Token
    'ghs_',      // Server-to-Server Token
    'ghr_',      // Refresh Token
    'github_pat_', // Fine-grained Personal Access Token
  ];

  return validPrefixes.some(prefix => token.startsWith(prefix));
}

/**
 * Validates GitHub PAT by making an authenticated API call
 * Returns an object with validation status and optional error message
 */
export async function validateGitHubToken(token: string): Promise<{
  isValid: boolean;
  error?: string;
  hasGistScope?: boolean;
  username?: string;
  tokenType?: string;
}> {
  try {
    // First check format
    if (!isValidGitHubTokenFormat(token)) {
      return {
        isValid: false,
        error: "Invalid token format. Token should start with 'ghp_', 'github_pat_', or similar prefix.",
      };
    }

    // Validate token by calling GitHub API
    const response = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          isValid: false,
          error: "Invalid token. Authentication failed.",
        };
      } else if (response.status === 403) {
        return {
          isValid: false,
          error: "Token access forbidden. Check token permissions.",
        };
      } else {
        return {
          isValid: false,
          error: `GitHub API error: ${response.status}`,
        };
      }
    }

    const userData = await response.json();

    // Check token scopes via headers
    const scopes = response.headers.get('X-OAuth-Scopes') || '';
    const hasGistScope = scopes.includes('gist');

    // Determine token type
    let tokenType = 'classic';
    if (token.startsWith('github_pat_')) {
      tokenType = 'fine-grained';
    }

    return {
      isValid: true,
      hasGistScope,
      username: userData.login,
      tokenType,
    };
  } catch (error) {
    console.error('Token validation error:', error);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Show validation result to user with appropriate message
 */
export function showValidationResult(
  result: Awaited<ReturnType<typeof validateGitHubToken>>
): void {
  if (!result.isValid) {
    const message = `Token Validation Failed\n\n${result.error}`;
    if (Platform.OS === 'web') {
      window.alert(message);
    } else {
      Alert.alert('Invalid Token', result.error || 'Unknown error');
    }
    return;
  }

  // Success message
  let message = `✅ Token validated successfully!\n\n`;
  message += `Account: ${result.username}\n`;
  message += `Type: ${result.tokenType === 'fine-grained' ? 'Fine-grained PAT' : 'Classic PAT'}\n`;

  if (result.hasGistScope) {
    message += `\n✓ Gist permission enabled - backups will work!`;
  } else {
    message += `\n⚠️ No Gist permission - token will only be used for encryption key derivation.`;
  }

  if (Platform.OS === 'web') {
    window.alert(message);
  } else {
    Alert.alert('Token Validated', message);
  }
}

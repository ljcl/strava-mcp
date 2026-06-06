import fs from "node:fs/promises";
import path from "node:path";

// Calculate paths — monorepo root is 3 levels up from apps/server/src/
const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");

// Token file location - uses /app/data in Docker (mounted volume) or ./data locally
const dataDir = process.env.TOKEN_DATA_DIR || path.join(projectRoot, "data");
const tokenFilePath = path.join(dataDir, "tokens.json");

// Buffer time before expiration to trigger refresh (5 minutes)
const EXPIRATION_BUFFER_SECONDS = 5 * 60;

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in seconds
  athlete_id?: number; // Athlete ID from OAuth response
}

export interface TokenStatus {
  authenticated: boolean;
  expires_at?: string; // ISO 8601 date string
  expires_in_minutes?: number;
  athlete_id?: number;
  auth_url?: string;
}

/**
 * Ensures the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {
    // Directory might already exist, that's fine
  }
}

/**
 * Loads tokens from persistent storage (tokens.json) or falls back to environment variables.
 * @returns TokenData if tokens are available, null otherwise
 */
async function loadTokens(): Promise<TokenData | null> {
  // First, try to load from tokens.json
  try {
    const content = await fs.readFile(tokenFilePath, "utf-8");
    const data = JSON.parse(content) as TokenData;

    if (data.access_token && data.refresh_token && data.expires_at) {
      console.error(`[TokenManager] Loaded tokens from ${tokenFilePath}`);
      console.error(
        `[TokenManager] Token expires: ${new Date(
          data.expires_at * 1000,
        ).toLocaleString()}`,
      );

      // Update process.env so the rest of the app can use them
      process.env.STRAVA_ACCESS_TOKEN = data.access_token;
      process.env.STRAVA_REFRESH_TOKEN = data.refresh_token;

      return data;
    }
  } catch {
    // File doesn't exist or is invalid, fall back to env vars
    console.error(
      "[TokenManager] No tokens.json found, falling back to environment variables",
    );
  }

  // Fall back to environment variables
  const accessToken = process.env.STRAVA_ACCESS_TOKEN;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  if (accessToken && refreshToken) {
    console.error("[TokenManager] Using tokens from environment variables");
    // We don't know the expiration time from env vars, so assume expired to trigger refresh
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: 0, // Force refresh on first use
    };
  }

  console.error("[TokenManager] No tokens available");
  return null;
}

/**
 * Saves tokens to persistent storage (tokens.json)
 */
export async function saveTokens(tokens: TokenData): Promise<void> {
  await ensureDataDir();

  try {
    await fs.writeFile(tokenFilePath, JSON.stringify(tokens, null, 2), "utf-8");
    console.error(`[TokenManager] Tokens saved to ${tokenFilePath}`);
    console.error(
      `[TokenManager] New expiration: ${new Date(
        tokens.expires_at * 1000,
      ).toLocaleString()}`,
    );
  } catch (error) {
    console.error("[TokenManager] Failed to save tokens:", error);
    throw error;
  }
}

/**
 * Checks if the token is expired or will expire soon
 */
function isTokenExpired(tokens: TokenData): boolean {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokens.expires_at;
  const isExpired = now >= expiresAt - EXPIRATION_BUFFER_SECONDS;

  if (isExpired) {
    const expiredAgo = now - expiresAt;
    if (expiredAgo > 0) {
      console.error(
        `[TokenManager] Token expired ${Math.floor(
          expiredAgo / 60,
        )} minutes ago`,
      );
    } else {
      console.error(
        `[TokenManager] Token expires in ${Math.floor(
          -expiredAgo / 60,
        )} minutes (within buffer)`,
      );
    }
  }

  return isExpired;
}

/**
 * Refreshes the access token using the refresh token
 */
async function refreshTokens(tokens: TokenData): Promise<TokenData> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in environment",
    );
  }

  console.error("[TokenManager] Refreshing access token...");

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    const newTokens: TokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };

    // Update process.env for the rest of the app
    process.env.STRAVA_ACCESS_TOKEN = newTokens.access_token;
    process.env.STRAVA_REFRESH_TOKEN = newTokens.refresh_token;

    // Persist to file
    await saveTokens(newTokens);

    console.error("[TokenManager] Token refresh successful");
    return newTokens;
  } catch (error) {
    console.error("[TokenManager] Token refresh failed:", error);
    throw new Error(
      `Failed to refresh token: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Ensures we have a valid (non-expired) access token.
 * Loads tokens, checks expiration, and refreshes if needed.
 * This should be called on server startup.
 */
export async function ensureValidToken(): Promise<void> {
  console.error("[TokenManager] Checking token validity...");

  const tokens = await loadTokens();

  if (!tokens) {
    console.error(
      "[TokenManager] No tokens available. Visit /auth/start to authenticate.",
    );
    return; // Don't throw - allow server to start without tokens for OAuth flow
  }

  if (isTokenExpired(tokens)) {
    console.error(
      "[TokenManager] Token expired or expiring soon, refreshing...",
    );
    await refreshTokens(tokens);
  } else {
    const expiresIn = tokens.expires_at - Math.floor(Date.now() / 1000);
    console.error(
      `[TokenManager] Token is valid for ${Math.floor(
        expiresIn / 60,
      )} more minutes`,
    );
  }
}

/**
 * Gets the current token status for the /auth/status endpoint
 */
export async function getTokenStatus(): Promise<TokenStatus> {
  const tokens = await loadTokens();

  if (!tokens?.access_token) {
    return {
      authenticated: false,
      auth_url: "/auth/start",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = tokens.expires_at - now;
  const expiresInMinutes = Math.floor(expiresInSeconds / 60);

  return {
    authenticated: true,
    expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    expires_in_minutes: expiresInMinutes,
    athlete_id: tokens.athlete_id,
  };
}

/**
 * Exchanges an OAuth authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenData> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in environment",
    );
  }

  console.error("[TokenManager] Exchanging authorization code for tokens...");

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OAuth token exchange failed: HTTP ${response.status}: ${errorText}`,
    );
  }

  const data = await response.json();

  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete?.id,
  };

  // Update process.env for the rest of the app
  process.env.STRAVA_ACCESS_TOKEN = tokens.access_token;
  process.env.STRAVA_REFRESH_TOKEN = tokens.refresh_token;

  // Persist to file
  await saveTokens(tokens);

  console.error("[TokenManager] OAuth token exchange successful");
  return tokens;
}

# Strava MCP

A Model Context Protocol (MCP) server that connects Large Language Models to your Strava data. Ask natural language questions about your activities, segments, routes, and more.

## Features

- Access recent activities, profile, and stats
- Fetch detailed activity streams (power, heart rate, cadence, etc.)
- Explore, view, star, and manage segments
- View detailed activity and segment effort information
- List and view details of saved routes
- Export routes in GPX or TCX format
- AI-friendly JSON responses via MCP
- Interactive activity charts (heart rate, power, altitude, pace) rendered in MCP-compatible hosts
- Automatic token refresh
- Streamable HTTP transport for remote deployment

## Quick Start (Docker)

### 1. Create a Strava API Application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application:
   - Enter your application details (name, website, description)
   - Set "Authorization Callback Domain" to your public URL hostname (e.g., `strava-mcp.example.com`)
   - Note your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
PUBLIC_URL=https://your-public-url.example.com
```

### 3. Start the Server

```bash
docker compose up -d
```

### 4. Authorize with Strava

Visit `https://your-public-url/auth/start` in your browser. After authorizing, tokens are saved automatically.

Check status anytime at `https://your-public-url/auth/status`.

### 5. Connect to Claude Desktop

Add to your Claude configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "strava": {
      "type": "url",
      "url": "https://your-public-url/mcp"
    }
  }
}
```

Restart Claude Desktop to load the new configuration.

## Connecting to AI Tools

Most AI tools (Claude Desktop, Claude Code, etc.) need an HTTPS URL to reach your MCP server. Since the server runs on your local network, you'll need a tunnel to expose it.

### Tailscale Funnel (Recommended)

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) exposes a local port to the internet over HTTPS with no configuration:

```bash
tailscale funnel --bg 3000
# → https://your-machine.tail1234.ts.net
```

Set `PUBLIC_URL` in your `.env` to the resulting URL.

### Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```

### Architecture

```text
AI Tool (Claude Desktop, Claude Code, etc.)
    │  HTTPS
HTTPS Tunnel (Tailscale / Cloudflare)
    │  HTTP (localhost:3000)
Strava MCP Server (Docker / Bun)
    │  HTTPS
Strava API
```

## Local Development

For running without Docker or Tailscale Funnel:

### Prerequisites

- [Bun](https://bun.sh/) runtime
- A Strava Account

### Setup

```bash
# Install dependencies
bun install

# Run the setup script for localhost-based OAuth
cd apps/server
bun run setup-auth

# Start the development server
bun run dev:http
```

The setup script will guide you through the OAuth flow using `localhost` as the redirect URI.

### Configure Claude Desktop (Local)

```json
{
  "mcpServers": {
    "strava": {
      "type": "url",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Environment Variables

| Variable               | Required | Description                                                |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `STRAVA_CLIENT_ID`     | Yes      | Your Strava Application Client ID                          |
| `STRAVA_CLIENT_SECRET` | Yes      | Your Strava Application Client Secret                      |
| `PUBLIC_URL`           | Yes*     | Public URL for OAuth callback (required for web auth)      |
| `STRAVA_ACCESS_TOKEN`  | No       | Initial access token (from `bun run setup-auth`)                  |
| `STRAVA_REFRESH_TOKEN` | No       | Initial refresh token (from `bun run setup-auth`)                 |
| `ROUTE_EXPORT_PATH`    | No       | Absolute path for saving exported route files              |
| `TOKEN_DATA_DIR`       | No       | Override token storage directory (default: `./data`)       |
| `PORT`                 | No       | Server port (default: `3000`)                              |

*Required for Docker/web-based OAuth. Not needed when using `bun run setup-auth` locally.

## Token Handling

The server implements automatic token management:

- **On startup**: Checks token validity and refreshes if expired
- **During operation**: Automatically refreshes on 401 errors
- **Persistence**: Tokens are saved to `data/tokens.json` (survives container restarts)
- **Re-authorization**: Visit `/auth/start` anytime to re-authorize

You only need to authorize once. The refresh token is used to obtain new access tokens automatically.

## Natural Language Examples

Ask your AI assistant questions like these:

**Recent Activity & Profile:**
- "Show me my recent Strava activities"
- "What were my last 3 rides?"
- "Get my Strava profile information"

**Activity Streams & Data:**
- "Get the heart rate data from my morning run yesterday"
- "Show me the power data from my last ride"
- "What was my cadence profile for my weekend century ride?"

**Stats:**
- "What are my running stats for this year on Strava?"
- "How far have I cycled in total?"

**Segments:**
- "List the segments I starred near Boulder, Colorado"
- "Get details for the 'Alpe du Zwift' segment"
- "Star the 'Flagstaff Road Climb' segment for me"

**Routes:**
- "List my saved Strava routes"
- "Export my 'Boulder Loop' route as a GPX file"

## API Reference

The server exposes the following MCP tools:

### Activity Tools

| Tool | Description |
| ---- | ----------- |
| `get-recent-activities` | Fetch recent activities |
| `get-all-activities` | Fetch all activities with filtering |
| `get-activity-details` | Get detailed info for a specific activity |
| `get-activity-streams` | Get time-series data (HR, power, GPS, etc.) |
| `get-activity-laps` | Get lap data for an activity |
| `get-activity-photos` | Get photos from an activity |

### Athlete Tools

| Tool | Description |
| ---- | ----------- |
| `get-athlete-profile` | Get authenticated athlete's profile |
| `get-athlete-stats` | Get activity statistics (recent, YTD, all-time) |
| `get-athlete-zones` | Get heart rate and power zones |
| `list-athlete-clubs` | List clubs the athlete is a member of |

### Segment Tools

| Tool | Description |
| ---- | ----------- |
| `list-starred-segments` | List starred segments |
| `get-segment` | Get detailed segment info |
| `explore-segments` | Search for segments in a geographic area |
| `star-segment` | Star or unstar a segment |
| `get-segment-effort` | Get details for a specific segment effort |
| `list-segment-efforts` | List athlete's efforts on a segment |

### Route Tools

| Tool | Description |
| ---- | ----------- |
| `list-athlete-routes` | List created routes |
| `get-route` | Get detailed route info |
| `export-route-gpx` | Export route as GPX file |
| `export-route-tcx` | Export route as TCX file |

### Visualization Tools

| Tool | Description |
| ---- | ----------- |
| `view-activity-chart` | Interactive chart with HR, power, pace, altitude overlays |
| `get-activity-streams-raw` | Raw stream data for the activity chart UI (app-only) |

## Development

```bash
bun run build        # Build all packages (Turborepo)
bun run test         # Run all tests (Turborepo)
bun run lint         # Lint all packages (Biome)
bun run lint:fix     # Auto-fix lint issues
bun run dev          # Dev mode (Turborepo)

# Server only
cd apps/server
bun run test         # Run server tests (Vitest)
bun run test:watch   # Watch mode
```

## Troubleshooting

**AI tool can't reach the server** — MCP requires an HTTPS URL. Use a tunnel (Tailscale Funnel or Cloudflare Tunnel) to expose your local server. See [Connecting to AI Tools](#connecting-to-ai-tools).

**OAuth callback fails** — Ensure `PUBLIC_URL` in your `.env` matches the tunnel URL exactly, and that the same hostname is set as the "Authorization Callback Domain" in your [Strava API settings](https://www.strava.com/settings/api).

**Token errors or expired tokens** — Visit `/auth/start` on your server to re-authorize. Tokens are refreshed automatically, but a full re-auth may be needed if the refresh token has been revoked.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

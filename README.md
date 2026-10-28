# Adyvance MCP

Connect AI apps like Claude, ChatGPT, Cursor and VS Code to your Adyvance shop through the
[Model Context Protocol](https://modelcontextprotocol.io). Ask about orders, products, customers
and stock in plain words. With your yes each time, the AI app can also update orders, products and
stock.

This repository holds the setup guide and `adyvance-mcp`, a small bridge for AI apps that can only
start local MCP servers. The MCP server itself runs inside Adyvance, so there is nothing to host.

## Before you start

1. Your shop's plan must include **Connect AI tools (MCP)**.
2. In the Adyvance admin, open **Apps → Developer → MCP server**. Copy the **server address**
   shown there (for example `https://mcp.adyvance.com/mcp`).

There are two ways to connect:

| Way | For | What you need |
| --- | --- | --- |
| **Sign in with Adyvance** | Claude.ai, Claude Desktop connectors, ChatGPT | The server address. You approve the app in Adyvance. |
| **API key** | Claude Code, Cursor, VS Code, Claude Desktop config file | The server address and an API key from **Apps → Developer → API keys** |

## Sign in with Adyvance

### Claude.ai (and Claude Desktop connectors)

1. Open **Settings → Connectors → Add custom connector**.
2. Paste the server address and choose **Add**.
3. Choose **Connect**. Sign in to Adyvance, pick the shop and what Claude may do, then choose
   **Allow**.

### ChatGPT

1. Open **Settings → Apps & Connectors → Advanced**, and turn on developer mode.
2. Create a connector with the server address, using OAuth sign-in.
3. Sign in to Adyvance and approve.

Every approved app shows up under **Connected AI apps** on the MCP server page, where you can
disconnect it at any time.

## API key

On **Apps → Developer → MCP server**, choose **Make an MCP key**. The config snippets on that
page fill themselves in with the new key. Copy the key when it is shown, because it is shown only
once.

You can tailor each key:

- **Permission set:** Read only, Orders & delivery, Catalog & stock, Full access, or pick each
  permission yourself.
- **Stores:** every store, or only the stores you choose.
- **Requests a minute:** the plan's 120, or a lower limit of your own.
- **Expiry** and **allowed IP addresses**.

You can change all of these later without changing the key.

In the examples below, use the server address from your admin if it differs, and replace
`YOUR_API_KEY` with your key.

### Claude Code

```sh
claude mcp add --transport http adyvance https://mcp.adyvance.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### Cursor: `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "adyvance": {
      "url": "https://mcp.adyvance.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

### VS Code: `.vscode/mcp.json`

```json
{
  "servers": {
    "adyvance": {
      "type": "http",
      "url": "https://mcp.adyvance.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

### Claude Desktop: `claude_desktop_config.json` (needs Node.js 18+)

```json
{
  "mcpServers": {
    "adyvance": {
      "command": "npx",
      "args": ["-y", "github:adyvanceofficial/adyvance-mcp"],
      "env": {
        "ADYVANCE_MCP_URL": "https://mcp.adyvance.com/mcp",
        "ADYVANCE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Use the same bridge for any other AI app that runs local (stdio) MCP servers.

## What the AI app can do

Each tool needs its permission on the key or the approved app. An AI app only sees the tools it is
allowed to use.

| Tool | What it does | Permission |
| --- | --- | --- |
| `list_stores` | The stores this connection can reach | (any) |
| `search_orders`, `get_order` | Find orders by number, customer, status, payment or date; open one | See orders |
| `search_products`, `get_product`, `list_categories` | Find and open products, list categories | See products |
| `search_customers`, `get_customer` | Find and open customers | See customers |
| `check_stock` | Stock per variant, or only low and out-of-stock items | See stock |
| `update_order_status` | Change an order's status | Update orders |
| `update_order_details` | Set an order's note, add or remove tags | Update orders |
| `create_product` | Add a simple product (draft or active) | Edit products |
| `update_product` | Change title, status, tags or description | Edit products |
| `update_variant` | Change a price, compare-at price, SKU or availability | Edit products |
| `adjust_stock` | Add, remove or count stock | Adjust stock |

Amounts from the shop are in paisa (100 paisa = Rs 1). Tools that set prices take rupees
(`price_npr`).

## How changes stay safe

- **Preview first.** A tool that changes something first answers with a preview and a
  `confirm_token`. It runs only when the AI app calls it again with that token, after you agree.
  The token works for 10 minutes and only for exactly the same change. If the record changed in
  the meantime, the AI app has to ask for a new preview.
- **Never more than you.** A key or an approved app can do only what it was given and what its
  owner's role allows, checked again on every request. If someone leaves the team, their keys and
  apps stop working at once.
- **Limits you set.** Store limits, request limits, expiry and IP addresses apply to MCP the same
  way they apply to the REST API.
- **Disconnect any time.** Revoke a key, or disconnect an app, and it stops on its next request.

## The bridge

`adyvance-mcp` reads MCP messages on stdin, sends them to your server address with your API key,
and writes the answers to stdout. It has no dependencies.

```sh
ADYVANCE_MCP_URL=https://mcp.adyvance.com/mcp \
ADYVANCE_API_KEY=YOUR_API_KEY \
npx -y github:adyvanceofficial/adyvance-mcp
```

| Setting | Meaning |
| --- | --- |
| `ADYVANCE_MCP_URL` (or `--url`) | The server address. Must be https (http only for localhost). |
| `ADYVANCE_API_KEY` | An Adyvance API key (`ady_live_…` or `ady_test_…`) |
| `--version`, `--help` | Print the version or help |

Messages for people go to stderr, so they never mix with MCP traffic.

## Troubleshooting

| You see | Do this |
| --- | --- |
| "Adyvance refused the API key" | The key is wrong, revoked, expired, or not allowed from this IP address. Make a new key. |
| "not included in this shop's plan" | Upgrade the plan to one that includes Connect AI tools (MCP). |
| "Not allowed: …" | Give the key or app that permission in Apps → Developer. |
| "Too many requests" | Wait a minute, or raise the key's own request limit. |
| A store is "not found" | The key is limited to other stores. |

## License

MIT. See [LICENSE](LICENSE).

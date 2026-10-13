# Security Policy

Oh-my-epiq is an MIT-licensed community project with no SLA and no paid
security response. That said, please report vulnerabilities responsibly.

## Reporting a vulnerability

Use **GitHub private vulnerability reporting** on this repository
(Security tab → Report a vulnerability). Do not open a public issue for
anything that could put other users' boards at risk. If private reporting
isn't enabled, contact the maintainer privately before opening a public issue.

## What is security-sensitive

- **Owner token** (`~/.ome-global/gui-access.json`, file mode 600): a
  32-byte secret that signs devices in. Anyone holding it owns the board.
- **Pairing codes**: single-use, expire after 15 minutes.
- **Sign-in links**: treat them as passwords, especially via a Cloudflare tunnel / any public URL.

## Safe defaults

The board server listens on loopback only (`local` mode) unless you pick
another access mode. LAN/Tailscale modes bind exactly one address, never
`0.0.0.0`. Non-loopback requests need a signed-in device, and the origin
guard refuses foreign origins (DNS-rebinding protection).

## If a secret leaks

Run `ome gui --rotate-token` to replace the owner token (old sign-in
links stop working), then re-pair your devices.

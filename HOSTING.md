# Hosting

Run this as one Node.js 24+ web service with persistent disk storage. It is not a static website.

1. Deploy this repository to your chosen Node host. The optional `render.yaml` is a Render configuration; review its current charges before using it.
2. Use `node src/server.js` as the start command and `/health` as the health check.
3. Set `HOST=0.0.0.0`, use the host's `PORT`, and set `DATA_PATH` to a persistent disk path.
4. Set `PUBLIC_ORIGIN` to your HTTPS domain. Configure your own bot credentials privately in the host environment.
5. Add your domain through the hosting dashboard and follow its exact DNS instructions.

Use a single instance with SQLite. Back up the database consistently, including active WAL state, and keep credentials out of Git. A deployment must preserve the data disk.

The repository contains protected operator endpoints for self-hosted maintenance. They grant no access to the community service; no configured operator credentials are distributed. Normal runner setup uses a runner key, not operator access.

See [SETUP.md](SETUP.md) for provider callbacks and first-time setup.

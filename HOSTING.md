# Always-online hosting: optional Render setup

This configuration moves the tracker service and its chat connectors to a paid server. Direct LiveSplit companions still run on each runner's PC. Keep GoDaddy as the domain registrar/DNS provider; hosting can be elsewhere.

No service has been purchased or deployed. The included `render.yaml` defines one paid Node web service and a 1 GB persistent disk. Render lists entry-level compute at $7/month, with storage and any additional usage billed separately. Review the current checkout estimate before creating it. Paid instances do not idle-sleep; deployments, maintenance and failures can still interrupt service. This configuration is for a small pilot, not a tested capacity guarantee.

## Deploy after choosing hosting

1. Create a private GitHub repository. Upload the contents of the clean sharing ZIP's `zombies-tracker` folder at the repository root. Never upload `.env`, `data/`, `companion/config.json` or `companion/state.json`. No repository or upload has been created automatically.
2. Sign in to Render, authorize access to that repository, and create a Blueprint using `render.yaml`. Review the paid service/disk estimate before deployment.
3. Wait for the service health check to pass. Use the service's assigned HTTPS `onrender.com` URL to test the dashboard. This is a dynamic Web Service, not a Static Site.
4. The generated ADMIN_KEY is available in the service's environment settings. Configure bot credentials privately in those same settings using the variable names in `.env.example`. Do not put real tokens into render.yaml.
5. The service respects Render's PORT variable, listens on 0.0.0.0, and stores SQLite at `/var/data/tracker.sqlite`. Keep one instance with its persistent disk. Backups must be SQLite-consistent; do not copy a live main database file without its WAL state.

## Connect your GoDaddy domain

Use a subdomain such as `tracker.yourdomain.com` if the root domain already serves another website.

1. In the Render service settings, add your exact hostname under Custom Domains.
2. Render supplies the DNS instructions for that hostname. In GoDaddy DNS, enter exactly the record type, name and target shown by Render. For a subdomain this is typically a CNAME named `tracker` pointing to the assigned Render hostname. Do not include https://, a port, or a path in the DNS target.
3. For a root domain, follow Render's specific root-domain instructions rather than guessing an IP address. Keep unrelated email and other DNS records unchanged.
4. Verify the domain in Render and wait for its managed HTTPS certificate. DNS changes alone do not deploy the application.

## Switch your runners and bots

The hosted instance has a separate database from localhost. Existing local accounts and history do not move automatically. Either perform a planned consistent database migration or register a new hosted tracker account and use its new runner key. Do not silently replace an active hosted database.

- In the hosted dashboard, generate a companion configuration using the hosted HTTPS address and that instance's runner key. Stop the companion, replace its configuration, then reopen it. Keep LiveSplit's TCP server local.
- A therun.gg connection runs from the hosted service; configure it on the hosted account.
- Set Discord's Interactions Endpoint URL to `https://YOUR-HOST/discord/interactions` and register commands with the same Discord application credentials.
- Twitch and YouTube connectors run while the service is active once their environment variables are set. Test each with your own authorized chat accounts before community rollout.
- Keep the local tracker available until migration is verified. Do not delete its database as part of DNS setup.

## Public rollout remains separate

The current alpha uses self-declared tracker usernames and manual channel configuration. Before opening unrestricted community registration, finish platform identity ownership verification, account recovery, provider-specific public OAuth onboarding, and registration abuse controls; then perform real-account and load testing. A hosted URL does not complete those features.

## Official references

- [Pricing](https://render.com/pricing)
- [Paid service behavior](https://render.com/docs/faq)
- [Persistent disks](https://render.com/docs/disks)
- [Custom domains and DNS](https://render.com/docs/custom-domains)
- [Blueprint configuration reference](https://render.com/docs/blueprint-spec)

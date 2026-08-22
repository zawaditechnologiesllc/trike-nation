# Delivery-update cron Worker

Calls `POST /api/cron/delivery-updates` on the Go Cart Grip API once a day. The
backend then emails every in-flight order its day 7 / 12 / 20 progress update.

```bash
cd workers/cron
npm install

# Point it at the API (edit vars.API_URL in wrangler.jsonc) and set the secret
# that the backend expects in CRON_SECRET:
npx wrangler secret put CRON_SECRET

npm run deploy      # deploys and registers the cron trigger
npm run tail        # live logs
```

Visiting the Worker's URL runs the sweep immediately — useful to verify the
secret and API URL after deploying. The sweep is idempotent: each milestone is
recorded on the order, so re-running it never re-sends an email.

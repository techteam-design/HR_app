import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The app is dynamic (every page reads the session) and uses no ISR or
// revalidation, so prerendered pages are served from the Worker's static
// assets: no extra R2 bucket, KV or Durable Object is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});

import alchemy from "alchemy";
import { Nextjs } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("better-slop-docs", {
  stage: process.env.STAGE,
  stateStore: process.env.CI
    ? (scope) => new CloudflareStateStore(scope)
    : undefined,
});

export const website = await Nextjs("website", {
  adopt: true,
  domains: ["better-slop.com"],
});

console.log({
  url: website.url,
});

await app.finalize();

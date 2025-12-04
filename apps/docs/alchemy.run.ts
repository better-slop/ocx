import alchemy from "alchemy";
import { Nextjs } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const stage = process.env.STAGE ?? "dev";
const isProd = stage === "prod";

const app = await alchemy("better-slop-docs", {
  stage,
  stateStore: process.env.CI
    ? (scope) => new CloudflareStateStore(scope)
    : undefined,
});

export const website = await Nextjs("website", {
  adopt: true,
  domains: isProd ? ["better-slop.com"] : [`${stage}.better-slop.com`],
});

console.log({
  url: website.url,
});

await app.finalize();

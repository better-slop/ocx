import alchemy from "alchemy";
import { Nextjs } from "alchemy/cloudflare";

const app = await alchemy("better-slop-docs");

export const website = await Nextjs("website", {});

console.log({
  url: website.url,
});

await app.finalize();

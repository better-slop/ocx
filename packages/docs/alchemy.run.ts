import alchemy from "alchemy";
import { GitHubComment } from "alchemy/github";
import { CloudflareStateStore } from "alchemy/state";
import { R2Bucket, TanStackStart } from "alchemy/cloudflare";

const app = await alchemy("docs", {
	stateStore:
		process.env.NODE_ENV === "production" || process.env.CI
			? (scope) => new CloudflareStateStore(scope)
			: undefined, // default FileSystemStateStore in dev
});

const r2 = await R2Bucket("r2");

export const website = await TanStackStart("website", {
	bindings: {
		R2: r2,
	},
});

console.log({
	url: website.url,
});

if (process.env.PULL_REQUEST) {
	const previewUrl = website.url;

	await GitHubComment("pr-preview-comment", {
		owner: process.env.GITHUB_REPOSITORY_OWNER || "your-username",
		repository: process.env.GITHUB_REPOSITORY_NAME || "docs",
		issueNumber: Number(process.env.PULL_REQUEST),
		body: `
## 🚀 Preview Deployed

Your preview is ready!

**Preview URL:** ${previewUrl}

This preview was built from commit ${process.env.GITHUB_SHA}

---
<sub>🤖 This comment will be updated automatically when you push new commits to this PR.</sub>`,
	});
}

await app.finalize();

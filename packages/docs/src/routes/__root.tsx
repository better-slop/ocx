import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import Header from "../components/Header";

import appCss from "../styles.css?url";

import { RootProvider } from "fumadocs-ui/provider/tanstack";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Better Slop Docs",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<RootProvider>
					<Header />
					{children}
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}

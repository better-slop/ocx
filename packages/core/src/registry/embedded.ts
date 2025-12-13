import type { RegistryItemV1 } from "./types";

const EMBEDDED_TOOL_FILES = {
  hello: new URL("./embedded/tools/hello.ts", import.meta.url),
} as const;

export type EmbeddedItemName = keyof typeof EMBEDDED_TOOL_FILES;

export function listEmbeddedItems(): EmbeddedItemName[] {
  return Object.keys(EMBEDDED_TOOL_FILES) as EmbeddedItemName[];
}

export async function getEmbeddedRegistryItem(
  name: string,
): Promise<RegistryItemV1 | null> {
  const direct = name.trim();
  const withoutNamespace = direct.includes("/") ? (direct.split("/").at(-1) ?? "") : direct;

  if (withoutNamespace in EMBEDDED_TOOL_FILES) {
    const key = withoutNamespace as EmbeddedItemName;
    const fileUrl = EMBEDDED_TOOL_FILES[key];
    const content = await Bun.file(fileUrl).text();

    return {
      schemaVersion: 1,
      kind: "tool",
      name: key,
      description: "Embedded ocx registry item",
      files: [
        {
          path: "index.ts",
          content,
        },
      ],
      entry: "index.ts",
    };
  }

  return null;
}

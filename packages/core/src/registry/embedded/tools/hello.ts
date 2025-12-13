import { tool } from "@opencode-ai/plugin/tool";

const z = tool.schema;

export default tool({
  description: "A minimal hello-world tool installed by ocx.",
  args: {
    name: z
      .string()
      .optional()
      .describe("Optional name to greet (defaults to 'world')"),
  },
  async execute(args) {
    const name = args.name?.trim() ? args.name.trim() : "world";
    return `hello, ${name}`;
  },
});

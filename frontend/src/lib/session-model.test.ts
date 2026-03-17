import { describe, expect, it } from "vitest";

import { resolveSessionModelDisplay } from "./session-model";

describe("resolveSessionModelDisplay", () => {
  it("prefers active override fields over base model fields", () => {
    expect(
      resolveSessionModelDisplay({
        model: "claude-sonnet-4-6",
        modelProvider: "anthropic",
        modelOverride: "gpt-5.4",
        providerOverride: "openai-codex",
      }),
    ).toBe("openai-codex/gpt-5.4");
  });

  it("composes provider/model when session payload stores them separately", () => {
    expect(
      resolveSessionModelDisplay({
        model: "claude-opus-4-6",
        modelProvider: "anthropic",
      }),
    ).toBe("anthropic/claude-opus-4-6");
  });

  it("keeps already-qualified model ids unchanged", () => {
    expect(
      resolveSessionModelDisplay({
        model: "anthropic/claude-sonnet-4-6",
        modelProvider: "anthropic",
      }),
    ).toBe("anthropic/claude-sonnet-4-6");
  });

  it("returns null when no model is present", () => {
    expect(resolveSessionModelDisplay({ providerOverride: "openai-codex" })).toBeNull();
  });
});

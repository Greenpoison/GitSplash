import { describe, expect, it } from "vitest";
import { translateGitError } from "./gitErrors";

describe("translateGitError", () => {
  it("translates a push rejection with a hint", () => {
    const result = translateGitError(
      "! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'origin'",
    );
    expect(result.message).toMatch(/can't fast-forward/);
    expect(result.hint).toMatch(/fetch/i);
  });

  it("captures the branch name in an existing-branch error", () => {
    const result = translateGitError("fatal: A branch named 'feature/foo' already exists.");
    expect(result.message).toContain('"feature/foo"');
  });

  it("captures the operation kind in an overwrite error", () => {
    const result = translateGitError(
      "error: Your local changes to the following files would be overwritten by checkout",
    );
    expect(result.message).toContain("checkout");
  });

  it("falls through unchanged for unrecognized errors", () => {
    const raw = "fatal: some completely novel git error nobody has seen before";
    const result = translateGitError(raw);
    expect(result).toEqual({ message: raw });
  });
});

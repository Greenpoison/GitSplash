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

  it("explains a concurrent-process index.lock error", () => {
    const result = translateGitError(
      "fatal: Unable to create 'C:/repo/.git/index.lock': File exists.",
    );
    expect(result.message).toMatch(/already running/i);
    expect(result.hint).toMatch(/stale index\.lock/i);
  });

  it("explains a transient reference-does-not-exist error", () => {
    const result = translateGitError("error: fetching ref refs/remotes/origin/master failed: reference does not exist");
    expect(result.message).toMatch(/timing issue/i);
    expect(result.hint).toMatch(/try the same action again/i);
  });

  it("explains a protected-branch rejection", () => {
    const result = translateGitError("remote: error: GH006: Protected branch update failed");
    expect(result.message).toMatch(/protected/i);
    expect(result.hint).toMatch(/pull request/i);
  });

  it("explains a repository-not-found error", () => {
    const result = translateGitError("remote: Repository not found.\nfatal: repository 'https://github.com/x/y.git/' not found");
    expect(result.message).toMatch(/doesn't exist/i);
    expect(result.hint).toMatch(/access/i);
  });

  it("explains an SSL certificate error", () => {
    const result = translateGitError("fatal: unable to access 'https://github.com/x/y.git/': SSL certificate problem: unable to get local issuer certificate");
    expect(result.message).toMatch(/SSL certificate/i);
    expect(result.hint).toMatch(/corporate/i);
  });

  it("explains a missing local branch on push", () => {
    const result = translateGitError("error: src refspec feature/typo does not match any");
    expect(result.message).toMatch(/no local branch/i);
  });

  it("explains a dirty tree blocking a rebase", () => {
    const result = translateGitError("cannot pull with rebase: You have unstaged changes.");
    expect(result.message).toMatch(/clean working tree/i);
  });
});

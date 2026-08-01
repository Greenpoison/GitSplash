import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useBackgroundOpsStore } from "./backgroundOpsStore";

describe("useBackgroundOpsStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBackgroundOpsStore.setState({ ops: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a running op on start", () => {
    const id = useBackgroundOpsStore.getState().start("Cloning foo…");
    const ops = useBackgroundOpsStore.getState().ops;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ id, label: "Cloning foo…", status: "running" });
  });

  it("updates the op's status and detail on finish", () => {
    const id = useBackgroundOpsStore.getState().start("Cloning foo…");
    useBackgroundOpsStore.getState().finish(id, "success", "Cloned foo");
    const op = useBackgroundOpsStore.getState().ops.find((o) => o.id === id);
    expect(op).toMatchObject({ status: "success", detail: "Cloned foo" });
  });

  it("removes a finished op after the linger delay", () => {
    const id = useBackgroundOpsStore.getState().start("Cloning foo…");
    useBackgroundOpsStore.getState().finish(id, "success", "Cloned foo");
    expect(useBackgroundOpsStore.getState().ops).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(useBackgroundOpsStore.getState().ops).toHaveLength(0);
  });

  it("keeps independent ops separate", () => {
    const a = useBackgroundOpsStore.getState().start("Cloning a…");
    const b = useBackgroundOpsStore.getState().start("Cloning b…");
    useBackgroundOpsStore.getState().finish(a, "error", "Failed to clone a");
    const ops = useBackgroundOpsStore.getState().ops;
    expect(ops.find((o) => o.id === a)).toMatchObject({ status: "error" });
    expect(ops.find((o) => o.id === b)).toMatchObject({ status: "running" });
  });
});

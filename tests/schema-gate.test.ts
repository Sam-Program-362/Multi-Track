import { describe, expect, it, vi } from "vitest";
import { createSchemaGate } from "../src/db/schema-gate";

describe("schema gate", () => {
  it("reports success and caches it, so the DDL runs once per process", async () => {
    const apply = vi.fn(async () => {});
    const gate = createSchemaGate(apply);

    await expect(gate.ensure()).resolves.toEqual({ ok: true });
    await expect(gate.ensure()).resolves.toEqual({ ok: true });
    await expect(gate.ensure()).resolves.toEqual({ ok: true });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure and retries on the next call", async () => {
    let attempts = 0;
    const apply = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("connection terminated unexpectedly");
    });
    const gate = createSchemaGate(apply);

    const first = await gate.ensure();
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error).toContain("connection terminated");
    expect(gate.lastError()).toContain("connection terminated");

    // A transient blip must not poison the process.
    const second = await gate.ensure();
    expect(second).toEqual({ ok: true });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(gate.lastError()).toBeNull();

    // ...and success is then cached.
    await gate.ensure();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("shares one attempt between concurrent callers", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apply = vi.fn(() => pending);
    const gate = createSchemaGate(apply);

    const a = gate.ensure();
    const b = gate.ensure();
    release();
    await expect(Promise.all([a, b])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("turns a synchronously throwing apply into a status", async () => {
    const gate = createSchemaGate(() => {
      throw new Error("boom");
    });
    const status = await gate.ensure();
    expect(status).toEqual({ ok: false, error: "boom" });
  });

  it("reset() forces a fresh attempt", async () => {
    const apply = vi.fn(async () => {});
    const gate = createSchemaGate(apply);
    await gate.ensure();
    gate.reset();
    await gate.ensure();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("keeps idempotent DDL semantics under repeated failures", async () => {
    let fail = true;
    const apply = vi.fn(async () => {
      if (fail) throw new Error("db unavailable");
    });
    const gate = createSchemaGate(apply);
    for (let i = 0; i < 3; i += 1) {
      expect((await gate.ensure()).ok).toBe(false);
    }
    fail = false;
    expect(await gate.ensure()).toEqual({ ok: true });
    expect(apply).toHaveBeenCalledTimes(4);
  });
});

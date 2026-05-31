import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WatchlistStore } from "../src/server/scanner/watchlist-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "watchlist-test-"));
  process.env.JOURNAL_DB_PATH = join(tmpDir, "test.db");
});

afterEach(() => {
  delete process.env.JOURNAL_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("WatchlistStore", () => {
  it("starts empty", () => {
    const store = new WatchlistStore();
    expect(store.list()).toEqual([]);
  });

  it("adds a single symbol", () => {
    const store = new WatchlistStore();
    store.add("HPG");
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].symbol).toBe("HPG");
    expect(list[0].timeframe).toBe("1d");
  });

  it("adds comma-separated batch", () => {
    const store = new WatchlistStore();
    store.add("HPG, VCB, FPT");
    expect(store.list()).toHaveLength(3);
    expect(
      store
        .list()
        .map((s) => s.symbol)
        .sort(),
    ).toEqual(["FPT", "HPG", "VCB"]);
  });

  it("normalises input to uppercase", () => {
    const store = new WatchlistStore();
    store.add("hpg,vcb");
    expect(
      store
        .list()
        .map((s) => s.symbol)
        .sort(),
    ).toEqual(["HPG", "VCB"]);
  });

  it("no duplicates — re-adding same symbol updates timeframe", () => {
    const store = new WatchlistStore();
    store.add("HPG", "1d");
    store.add("HPG", "1h");
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].timeframe).toBe("1h");
  });

  it("removes a symbol", () => {
    const store = new WatchlistStore();
    store.add("HPG, VCB");
    store.remove("HPG");
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].symbol).toBe("VCB");
  });

  it("remove non-existent symbol is a no-op", () => {
    const store = new WatchlistStore();
    store.add("HPG");
    store.remove("XYZ");
    expect(store.list()).toHaveLength(1);
  });

  it("clear wipes all rows", () => {
    const store = new WatchlistStore();
    store.add("HPG, VCB, FPT");
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it("persists across store instances (same DB file)", () => {
    const store1 = new WatchlistStore();
    store1.add("HPG, VCB");

    const store2 = new WatchlistStore();
    expect(store2.list()).toHaveLength(2);
  });

  it("filters empty/whitespace tokens in batch", () => {
    const store = new WatchlistStore();
    store.add("HPG,  ,, FPT , ");
    expect(store.list()).toHaveLength(2);
  });
});

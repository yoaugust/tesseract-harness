import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readLastHostChoice } from "@/lib/hostPreferences";
import {
  buildRemotePairingUrl,
  normalizeRemoteOrigin,
  readRemoteComputerBinding,
  readRemoteOrigin,
  saveRemoteComputerBinding,
  writeRemoteOrigin,
} from "./remotePairing";

beforeAll(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});

beforeEach(() => window.localStorage.clear());

describe("remote pairing", () => {
  it("builds an encoded connect URL for one host", () => {
    const value = buildRemotePairingUrl("https://mac.example.test/", {
      host_id: "host/one",
      name: "Agasthya's Mac",
    });
    const url = new URL(value);
    expect(url.origin).toBe("https://mac.example.test");
    expect(url.pathname).toBe("/remote/connect");
    expect(url.searchParams.get("host_id")).toBe("host/one");
    expect(url.searchParams.get("host_name")).toBe("Agasthya's Mac");
  });

  it("accepts only a bare http(s) origin", () => {
    expect(normalizeRemoteOrigin("https://mac.example.test/")).toBe("https://mac.example.test");
    expect(normalizeRemoteOrigin("http://127.0.0.1:6767")).toBe("http://127.0.0.1:6767");
    expect(normalizeRemoteOrigin("https://mac.example.test/path")).toBeNull();
    expect(normalizeRemoteOrigin("javascript:alert(1)")).toBeNull();
  });

  it("persists the paired computer and seeds the existing host picker", () => {
    saveRemoteComputerBinding({ host_id: "host_1", name: "Laptop" });
    expect(readRemoteComputerBinding()).toMatchObject({
      version: 1,
      hostId: "host_1",
      hostName: "Laptop",
    });
    expect(readLastHostChoice()).toBe("host_1");
  });

  it("persists the public origin independently", () => {
    expect(readRemoteOrigin("https://fallback.test")).toBe("https://fallback.test");
    writeRemoteOrigin("https://mac.example.test");
    expect(readRemoteOrigin("https://fallback.test")).toBe("https://mac.example.test");
  });
});

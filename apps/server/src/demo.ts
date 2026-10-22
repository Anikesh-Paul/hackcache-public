// Per-visitor Demo worlds (build plan §2.4). Each anonymous visitor owns one
// workspace, `w<userId>`, holding a fresh copy of the seed. Every row the
// server writes is readable and updatable by that visitor only.
import { Permission, Role } from "node-appwrite";
import type { DemoStarted } from "@tagada/appwrite";
import { seedWorld, type World } from "@tagada/seed";

export type { DemoStarted };

export type OwnedRow = { $id: string; workspaceId: string; $permissions: string[] } & Record<string, unknown>;

/** Rows to write, by table ID. */
export type WorldRows = Record<string, OwnedRow[]>;

export type WorldStore = {
  /** True once a workspace's world is completely written. */
  exists(workspaceId: string): Promise<boolean>;
  /** Deletes every row of the workspace, in every table. */
  remove(workspaceId: string): Promise<void>;
  /** Creates or overwrites the rows. The workspace row must land last. */
  write(world: WorldRows): Promise<void>;
};

export type DemoDeps = {
  /** The Appwrite user a session JWT belongs to, or null when it is not valid. */
  userFromJwt: (jwt: string) => Promise<string | null>;
  worlds: WorldStore;
};

export function workspaceIdFor(userId: string): string {
  return `w${userId}`;
}

function seedFor(userId: string): World {
  return seedWorld({ workspaceId: workspaceIdFor(userId), ownerUserId: userId });
}

/** The seed for this visitor, every row owned by them alone. */
export function ownedWorld(userId: string, world = seedFor(userId)): WorldRows {
  const permissions = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))];
  return Object.fromEntries(
    Object.entries(world).map(([tableId, rows]) => [
      tableId,
      rows.map((row: { $id: string; workspaceId: string }) => ({ ...row, $permissions: [...permissions] })),
    ]),
  );
}

async function seed(worlds: WorldStore, userId: string): Promise<DemoStarted> {
  const world = seedFor(userId);
  await worlds.write(ownedWorld(userId, world));
  const { workspaces, customers, invoices, promises } = world;
  return { workspaceId: workspaceIdFor(userId), seeded: true, world: { workspaces, customers, invoices, promises } };
}

/** Seeds the visitor's world unless it is already there. `exists` skips the lookup when already known. */
export async function startDemo(worlds: WorldStore, userId: string, exists?: boolean): Promise<DemoStarted> {
  const workspaceId = workspaceIdFor(userId);
  if (exists ?? (await worlds.exists(workspaceId))) return { workspaceId, seeded: false };
  return seed(worlds, userId);
}

/**
 * The user ID an Appwrite JWT says it is for, read without checking the
 * signature. Only a hint, to start work early; never trusted on its own.
 */
export function claimedUserId(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { userId?: unknown };
    return typeof claims.userId === "string" ? claims.userId : null;
  } catch {
    return null;
  }
}

/** Deletes the visitor's world and seeds it again. Nobody else's rows are touched. */
export async function resetDemo(worlds: WorldStore, userId: string): Promise<DemoStarted> {
  await worlds.remove(workspaceIdFor(userId));
  return seed(worlds, userId);
}

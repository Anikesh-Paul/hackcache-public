// Per-visitor Demo worlds (build plan §2.4). Each anonymous visitor owns one
// workspace, `w<userId>`, holding a fresh copy of the seed. Every row the
// server writes is readable and updatable by that visitor only.
import { Permission, Role } from "node-appwrite";
import type { DemoStarted } from "@tagada/appwrite";
import { seedWorld, type World } from "@tagada/seed";
import type { FileStore } from "./pay.ts";
import type { PayTokens } from "./pay-token.ts";

export type { DemoStarted };

export type OwnedRow = { $id: string; workspaceId: string; $permissions: string[] } & Record<string, unknown>;

/** A row as listed back. `$permissions` is only present when this process wrote it. */
export type StoredRow = { $id: string; workspaceId: string } & Record<string, unknown>;

/** Rows to write, by table ID. */
export type WorldRows = Record<string, OwnedRow[]>;

export type WorldStore = {
  /** True once the workspace row is written, which happens last. */
  exists(workspaceId: string): Promise<boolean>;
  /** Deletes every row of the workspace, in every table. */
  remove(workspaceId: string): Promise<void>;
  /** Creates or overwrites the rows, all tables at once. */
  write(world: WorldRows): Promise<void>;
  /** Creates one row, unless a row with its ID is already there: then nothing is written. */
  create(tableId: string, row: OwnedRow): Promise<"created" | "exists">;
  /** One row by ID, or null. */
  get(tableId: string, rowId: string): Promise<StoredRow | null>;
  /** Changes some columns of one row. */
  update(tableId: string, rowId: string, patch: Record<string, unknown>): Promise<void>;
  /** Deletes one row; a row already gone is not an error. */
  delete(tableId: string, rowId: string): Promise<void>;
  /** Every row of one table in one workspace, optionally narrowed by equal columns. A demo world fits in one page. */
  list(tableId: string, workspaceId: string, where?: Record<string, string>): Promise<StoredRow[]>;
};

export type DemoDeps = {
  /** The Appwrite user a session JWT belongs to, or null when it is not valid. */
  userFromJwt: (jwt: string) => Promise<string | null>;
  worlds: WorldStore;
  /** Runs work after the answer has gone; it must log its own failure. */
  later: (task: Promise<void>) => void;
  /** Signs each Invoice's pay link. */
  tokens: PayTokens;
};

export function workspaceIdFor(userId: string): string {
  return `w${userId}`;
}

/** The seed for this visitor, every Invoice with its signed pay link. */
function seedFor(userId: string, tokens: PayTokens): World {
  const workspaceId = workspaceIdFor(userId);
  const world = seedWorld({ workspaceId, ownerUserId: userId });
  return {
    ...world,
    invoices: world.invoices.map((invoice) => ({
      ...invoice,
      payToken: tokens.sign({ workspaceId, invoiceId: invoice.$id }),
    })),
  };
}

/** The seed for this visitor, every row owned by them alone. */
export function ownedWorld(userId: string, world: World): Record<keyof World, OwnedRow[]> {
  const permissions = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))];
  return Object.fromEntries(
    Object.entries(world).map(([tableId, rows]) => [
      tableId,
      rows.map((row: { $id: string; workspaceId: string }) => ({ ...row, $permissions: [...permissions] })),
    ]),
  ) as Record<keyof World, OwnedRow[]>;
}

/**
 * Writes what the first screens read (Customers, Invoices, Promises), then
 * answers; the lines, events, bank and cash rows follow, and the workspace
 * row last. Until it lands the world does not "exist", so a reload in that
 * second seeds again, which only rewrites the same rows.
 */
async function seed({ worlds, later, tokens }: DemoDeps, userId: string): Promise<DemoStarted> {
  const world = seedFor(userId, tokens);
  const { workspaces, customers, invoices, promises, ...rest } = ownedWorld(userId, world);
  await worlds.write({ customers, invoices, promises });
  later(
    worlds
      .write(rest)
      .then(() => worlds.write({ workspaces }))
      .catch((e: unknown) => console.error(`seeding the rest of ${workspaceIdFor(userId)} failed`, e)),
  );
  return {
    workspaceId: workspaceIdFor(userId),
    seeded: true,
    world: {
      workspaces: world.workspaces,
      customers: world.customers,
      invoices: world.invoices,
      promises: world.promises,
    },
  };
}

/** Seeds the visitor's world unless it is already there. `exists` skips the lookup when already known. */
export async function startDemo(deps: DemoDeps, userId: string, exists?: boolean): Promise<DemoStarted> {
  const workspaceId = workspaceIdFor(userId);
  if (exists ?? (await deps.worlds.exists(workspaceId))) return { workspaceId, seeded: false };
  return seed(deps, userId);
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
export async function resetDemo(deps: DemoDeps, userId: string): Promise<DemoStarted> {
  await deps.worlds.remove(workspaceIdFor(userId));
  return seed(deps, userId);
}

/**
 * Delete my workspace: every UPI screenshot its Customers sent, then every
 * row, then a fresh world in its place. Only the visitor's own workspace.
 */
export async function deleteWorkspace(deps: DemoDeps, files: FileStore, userId: string): Promise<DemoStarted> {
  const workspaceId = workspaceIdFor(userId);
  // The files first: once the rows are gone, nothing says which screenshots were this workspace's.
  const proofs = await deps.worlds.list("proof_checks", workspaceId);
  const fileIds = [...new Set(proofs.map((row) => row.fileId).filter((id): id is string => typeof id === "string" && id !== ""))];
  await Promise.all(fileIds.map((fileId) => files.deleteScreenshot(fileId)));
  await deps.worlds.remove(workspaceId);
  return seed(deps, userId);
}

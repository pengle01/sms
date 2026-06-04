// Global test setup
import { vi } from "vitest";

// Mock Prisma client for unit tests — integration tests use a real DB
vi.mock("@/server/db", () => ({
  db: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    attendance: { findMany: vi.fn(), upsert: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    referral: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    grade: { findMany: vi.fn(), upsert: vi.fn() },
    notice: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    globalSetting: { findUnique: vi.fn() },
    staffProfile: { findUnique: vi.fn() },
    studentProfile: { findUnique: vi.fn() },
    parentProfile: { findUnique: vi.fn() },
    exitPermit: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    dutyRosterEntry: { findMany: vi.fn() },
    activityParticipant: { findFirst: vi.fn() },
    timetableSlot: { findFirst: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

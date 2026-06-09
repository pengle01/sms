import { createTRPCRouter } from "../init";
import { attendanceRouter } from "./attendance";
import { referralsRouter } from "./referrals";
import { notificationsRouter } from "./notifications";
import { gradesRouter } from "./grades";
import { noticesRouter } from "./notices";
import { settingsRouter } from "./settings";
import { studentsRouter, parentsRouter } from "./students";
import { groupsRouter } from "./groups";
import { preferencesRouter } from "./preferences";
import { accessCodesRouter } from "./accessCodes";
import { toiletRouter } from "./toilet";
import { messagesRouter } from "./messages";

export const appRouter = createTRPCRouter({
  attendance: attendanceRouter,
  referrals: referralsRouter,
  notifications: notificationsRouter,
  grades: gradesRouter,
  notices: noticesRouter,
  settings: settingsRouter,
  students: studentsRouter,
  parents: parentsRouter,
  groups: groupsRouter,
  preferences: preferencesRouter,
  accessCodes: accessCodesRouter,
  toilet: toiletRouter,
  messages: messagesRouter,
});

export type AppRouter = typeof appRouter;

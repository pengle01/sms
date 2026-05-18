import { createTRPCRouter } from "../init";
import { attendanceRouter } from "./attendance";
import { referralsRouter } from "./referrals";
import { gradesRouter } from "./grades";
import { noticesRouter } from "./notices";
import { settingsRouter } from "./settings";
import { studentsRouter, parentsRouter } from "./students";
import { groupsRouter } from "./groups";

export const appRouter = createTRPCRouter({
  attendance: attendanceRouter,
  referrals: referralsRouter,
  grades: gradesRouter,
  notices: noticesRouter,
  settings: settingsRouter,
  students: studentsRouter,
  parents: parentsRouter,
  groups: groupsRouter,
});

export type AppRouter = typeof appRouter;

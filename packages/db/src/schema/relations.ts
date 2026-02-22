import { relations } from 'drizzle-orm';
import { users, accounts, sessions } from './auth';
import { projects, rooms, designVariants, uploads, userApiKeys } from './app';

// Auth relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projects),
  uploads: many(uploads),
  apiKeys: many(userApiKeys),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// App relations
export const userApiKeysRelations = relations(userApiKeys, ({ one }) => ({
  user: one(users, { fields: [userApiKeys.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  rooms: many(rooms),
  uploads: many(uploads),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  project: one(projects, { fields: [rooms.projectId], references: [projects.id] }),
  designVariants: many(designVariants),
  uploads: many(uploads),
}));

export const designVariantsRelations = relations(designVariants, ({ one }) => ({
  room: one(rooms, { fields: [designVariants.roomId], references: [rooms.id] }),
}));

export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, { fields: [uploads.userId], references: [users.id] }),
  project: one(projects, { fields: [uploads.projectId], references: [projects.id] }),
  room: one(rooms, { fields: [uploads.roomId], references: [rooms.id] }),
}));

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  real,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";

// Custom vector type for pgvector
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    const str = value as string;
    return str
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const contentTypeEnum = pgEnum("content_type", [
  "article",
  "video",
  "webpage",
]);

// ─── Users ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── NextAuth Accounts ──────────────────────────────────
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: timestamp("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
});

// ─── NextAuth Sessions ──────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

// ─── Notes ───────────────────────────────────────────────
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    contentJson: jsonb("content_json"),
    embedding: vector("embedding"),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").default("pending"),
    tags: text("tags").array(),
    isPublic: boolean("is_public").default(false),
    shareToken: text("share_token").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("notes_user_id_idx").on(table.userId),
  ]
);

// ─── Related Notes ──────────────────────────────────────
export const relatedNotes = pgTable(
  "related_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceNoteId: uuid("source_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    relatedNoteId: uuid("related_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    similarityScore: real("similarity_score").notNull(),
  },
  (table) => [
    uniqueIndex("related_notes_unique_idx").on(
      table.sourceNoteId,
      table.relatedNoteId
    ),
  ]
);

// ─── Note Images ────────────────────────────────────────
export const noteImages = pgTable(
  "note_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    description: text("description").notNull().default("[uploaded image]"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("note_images_note_id_idx").on(table.noteId),
  ]
);

// ─── Related Web Content ────────────────────────────────
export const relatedWebContent = pgTable(
  "related_web_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    contentType: contentTypeEnum("content_type").default("webpage"),
    relevanceReason: text("relevance_reason"),
  },
  (table) => [
    uniqueIndex("related_web_content_unique_idx").on(table.noteId, table.url),
  ]
);

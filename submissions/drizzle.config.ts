import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";
import { withStrictTls } from "./src/lib/db/url";

// drizzle-kit runs outside Next, so it needs .env.local loaded explicitly.
loadEnv({ path: ".env.local" });

// Migrations must not go through PgBouncer: in transaction pooling mode,
// session state and prepared statements break in ways that never mention
// pooling. Fall back to DATABASE_URL only if the direct URL is absent.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: withStrictTls(url!) },
} satisfies Config;

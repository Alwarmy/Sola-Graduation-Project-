import { z } from "zod";

const serverEnvSchema = z.object({
  SOLA_BACKEND_URL: z
    .string()
    .url("SOLA_BACKEND_URL must be a valid URL (e.g. http://localhost:8000)"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SOLA_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_SOLA_APP_URL must be a valid URL (e.g. http://localhost:3000)"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;
let cachedPublicEnv: PublicEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment variables:\n${issues}`);
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SOLA_APP_URL: process.env.NEXT_PUBLIC_SOLA_APP_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid public environment variables:\n${issues}`);
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

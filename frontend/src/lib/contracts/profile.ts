import { z } from "zod";

/**
 * Profile domain Zod schemas mirroring backend `UserProfileCreate`,
 * `UserProfileUpdate`, and `UserProfileResponse` (per CP1 OpenAPI snapshot).
 *
 * The backend treats most fields as plain strings even though product
 * convention treats some as enums (e.g. `experience_level`). CP5 keeps the
 * schema permissive (plain strings) so the form does not over-constrain;
 * the backend remains the authority and surfaces specific 422 errors when
 * a value is unsupported.
 */

// Required fields shared by create + response (excluding backend-managed ids).
const profileBaseRequired = {
  background_track: z.string().min(1, "Background is required"),
  employment_status: z.string().min(1, "Employment status is required"),
  is_student: z.boolean(),
  weekly_hours: z
    .number()
    .int()
    .min(1, "Must be between 1 and 80 hours")
    .max(80, "Must be between 1 and 80 hours"),
  goal: z.string().min(1, "Goal is required"),
  preferred_language: z.string().min(1, "Preferred language is required"),
};

const profileBaseOptional = {
  primary_track: z.string().nullish(),
  secondary_tracks: z.array(z.string()).optional(),
  target_role: z.string().max(120, "Target role is too long").nullish(),
  experience_level: z.string().nullish(),
  education_major: z.string().nullish(),
  bio: z.string().nullish(),
  timezone: z.string().nullish(),
};

export const userProfileCreateSchema = z.object({
  ...profileBaseRequired,
  ...profileBaseOptional,
});
export type UserProfileCreate = z.infer<typeof userProfileCreateSchema>;

export const userProfileUpdateSchema = userProfileCreateSchema;
export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;

export const userProfileResponseSchema = z.object({
  ...profileBaseRequired,
  ...profileBaseOptional,
  // Backend-managed fields (always present on the response).
  id: z.number().int(),
  user_id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  // Response variant always has a non-null timezone.
  timezone: z.string(),
});
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

/**
 * Browser-safe camelCase view model. Components consume this, not the raw
 * snake_case backend payload, so labels and the raw-value guard stay clean.
 */
export type PublicProfile = {
  id: number;
  userId: number;
  backgroundTrack: string;
  primaryTrack: string | null;
  secondaryTracks: string[];
  targetRole: string | null;
  experienceLevel: string | null;
  employmentStatus: string;
  isStudent: boolean;
  educationMajor: string | null;
  weeklyHours: number;
  goal: string;
  preferredLanguage: string;
  bio: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export function toPublicProfile(p: UserProfileResponse): PublicProfile {
  return {
    id: p.id,
    userId: p.user_id,
    backgroundTrack: p.background_track,
    primaryTrack: p.primary_track ?? null,
    secondaryTracks: p.secondary_tracks ?? [],
    targetRole: p.target_role ?? null,
    experienceLevel: p.experience_level ?? null,
    employmentStatus: p.employment_status,
    isStudent: p.is_student,
    educationMajor: p.education_major ?? null,
    weeklyHours: p.weekly_hours,
    goal: p.goal,
    preferredLanguage: p.preferred_language,
    bio: p.bio ?? null,
    timezone: p.timezone,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

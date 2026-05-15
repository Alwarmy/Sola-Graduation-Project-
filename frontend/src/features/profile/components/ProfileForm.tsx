"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { ValidationErrors } from "@/components/states/ValidationErrors";
import { BackendError } from "@/lib/errors/backend-error";
import {
  userProfileCreateSchema,
  userProfileUpdateSchema,
  type UserProfileCreate,
  type UserProfileUpdate,
  type PublicProfile,
} from "@/lib/contracts/profile";
import {
  BACKGROUND_TRACK_OPTIONS,
  TRACK_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  GOAL_OPTIONS,
  PREFERRED_LANGUAGE_OPTIONS,
  employmentStatusLabel,
  experienceLevelLabel,
  goalLabel,
  preferredLanguageLabel,
  trackLabel,
} from "@/lib/labels/profile-options";

export type ProfileFormMode = "create" | "update";

export type ProfileFormProps = {
  mode: ProfileFormMode;
  initial?: PublicProfile;
  /** Mutation surface: `{ mutate, isPending, error }`. */
  state: {
    mutate: (
      input: UserProfileCreate | UserProfileUpdate,
      options?: { onSuccess?: () => void },
    ) => void;
    isPending: boolean;
    error: Error | null;
  };
  /** Called after successful submit (e.g. show a toast / scroll). */
  onSuccess?: () => void;
};

type FormState = {
  background_track: string;
  primary_track: string;
  secondary_tracks: string; // comma-separated in UI; serialized to array
  target_role: string;
  experience_level: string;
  employment_status: string;
  is_student: boolean;
  education_major: string;
  weekly_hours: string;
  goal: string;
  preferred_language: string;
  bio: string;
  timezone: string;
};

function initialFormState(profile?: PublicProfile): FormState {
  return {
    background_track: profile?.backgroundTrack ?? BACKGROUND_TRACK_OPTIONS[0],
    primary_track: profile?.primaryTrack ?? "",
    secondary_tracks: (profile?.secondaryTracks ?? []).join(","),
    target_role: profile?.targetRole ?? "",
    experience_level: profile?.experienceLevel ?? "",
    employment_status: profile?.employmentStatus ?? EMPLOYMENT_STATUS_OPTIONS[0],
    is_student: profile?.isStudent ?? false,
    education_major: profile?.educationMajor ?? "",
    weekly_hours: profile ? String(profile.weeklyHours) : "5",
    goal: profile?.goal ?? GOAL_OPTIONS[0],
    preferred_language: profile?.preferredLanguage ?? "en",
    bio: profile?.bio ?? "",
    timezone: profile?.timezone ?? "",
  };
}

function toPayload(form: FormState): UserProfileCreate | UserProfileUpdate {
  const secondary = form.secondary_tracks
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    background_track: form.background_track.trim(),
    primary_track: form.primary_track.trim() || null,
    secondary_tracks: secondary,
    target_role: form.target_role.trim() || null,
    experience_level: form.experience_level.trim() || null,
    employment_status: form.employment_status.trim(),
    is_student: form.is_student,
    education_major: form.education_major.trim() || null,
    weekly_hours: Number.parseInt(form.weekly_hours, 10),
    goal: form.goal.trim(),
    preferred_language: form.preferred_language.trim(),
    bio: form.bio.trim() || null,
    timezone: form.timezone.trim() || null,
  };
}

export function ProfileForm({ mode, initial, state, onSuccess }: ProfileFormProps) {
  const [form, setForm] = useState<FormState>(() => initialFormState(initial));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const payload = toPayload(form);
    const schema = mode === "create" ? userProfileCreateSchema : userProfileUpdateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    state.mutate(parsed.data, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  }

  const backendError = state.error instanceof BackendError ? state.error : null;
  const isValidationError = backendError?.errorCode === "request_validation_error";

  return (
    <form onSubmit={onSubmit} noValidate>
      {state.error && !isValidationError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ErrorState error={state.error} />
        </div>
      ) : null}
      {isValidationError && backendError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ValidationErrors source={backendError} />
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "0.9rem" }}>
        <FormField label="Goal" error={fieldErrors.goal} required>
          {(api) => (
            <Select
              value={form.goal}
              onChange={(e) => update("goal", e.target.value)}
              required
              {...api}
            >
              {GOAL_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {goalLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Background" error={fieldErrors.background_track} required>
          {(api) => (
            <Select
              value={form.background_track}
              onChange={(e) => update("background_track", e.target.value)}
              required
              {...api}
            >
              {BACKGROUND_TRACK_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {trackLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          label="Primary track"
          hint="Defaults to your background if blank."
          error={fieldErrors.primary_track}
        >
          {(api) => (
            <Select
              value={form.primary_track}
              onChange={(e) => update("primary_track", e.target.value)}
              {...api}
            >
              <option value="">Use background</option>
              {TRACK_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {trackLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          label="Secondary tracks"
          hint="Comma-separated. Use the same options as background."
          error={fieldErrors.secondary_tracks}
        >
          {(api) => (
            <Input
              type="text"
              value={form.secondary_tracks}
              onChange={(e) => update("secondary_tracks", e.target.value)}
              {...api}
            />
          )}
        </FormField>
        <FormField label="Target role" error={fieldErrors.target_role}>
          {(api) => (
            <Input
              type="text"
              value={form.target_role}
              onChange={(e) => update("target_role", e.target.value)}
              maxLength={120}
              {...api}
            />
          )}
        </FormField>
        <FormField label="Experience level" error={fieldErrors.experience_level}>
          {(api) => (
            <Select
              value={form.experience_level}
              onChange={(e) => update("experience_level", e.target.value)}
              {...api}
            >
              <option value="">Not set</option>
              {EXPERIENCE_LEVEL_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {experienceLevelLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Employment status" error={fieldErrors.employment_status} required>
          {(api) => (
            <Select
              value={form.employment_status}
              onChange={(e) => update("employment_status", e.target.value)}
              required
              {...api}
            >
              {EMPLOYMENT_STATUS_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {employmentStatusLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Are you a student?">
          {(api) => (
            <Select
              value={form.is_student ? "yes" : "no"}
              onChange={(e) => update("is_student", e.target.value === "yes")}
              {...api}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          )}
        </FormField>
        <FormField label="Education major" error={fieldErrors.education_major}>
          {(api) => (
            <Input
              type="text"
              value={form.education_major}
              onChange={(e) => update("education_major", e.target.value)}
              {...api}
            />
          )}
        </FormField>
        <FormField
          label="Weekly study hours"
          hint="Between 1 and 80."
          error={fieldErrors.weekly_hours}
          required
        >
          {(api) => (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={80}
              value={form.weekly_hours}
              onChange={(e) => update("weekly_hours", e.target.value)}
              required
              {...api}
            />
          )}
        </FormField>
        <FormField label="Preferred language" error={fieldErrors.preferred_language} required>
          {(api) => (
            <Select
              value={form.preferred_language}
              onChange={(e) => update("preferred_language", e.target.value)}
              required
              {...api}
            >
              {PREFERRED_LANGUAGE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {preferredLanguageLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          label="Timezone"
          hint='Defaults to your account timezone if blank (e.g. "Asia/Riyadh").'
          error={fieldErrors.timezone}
        >
          {(api) => (
            <Input
              type="text"
              value={form.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              {...api}
            />
          )}
        </FormField>
        <FormField label="Bio" error={fieldErrors.bio}>
          {(api) => (
            <Textarea
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={3}
              {...api}
            />
          )}
        </FormField>
        <Button type="submit" isBusy={state.isPending}>
          {state.isPending
            ? mode === "create"
              ? "Saving…"
              : "Updating…"
            : mode === "create"
              ? "Save profile"
              : "Update profile"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { ValidationErrors } from "@/components/states/ValidationErrors";

import { useUpdatePlanPreferences } from "@/features/plans/hooks/usePlanMutations";
import { BackendError } from "@/lib/errors/backend-error";
import type { PublicLearningPlan } from "@/lib/contracts/plans";
import { ConflictPanel } from "./ConflictPanel";

export type PreferencesFormProps = {
  plan: PublicLearningPlan;
  onRefresh: () => void;
};

const TIME_WINDOWS = ["morning", "afternoon", "evening", "night", "flexible"] as const;
const PACE_MODES = ["relaxed", "standard", "intensive", "exam_prep"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

/**
 * Preferences form. Sends `expected_version: plan.version` per the
 * SchedulingPreferenceUpdateRequest schema. On stale-version conflict,
 * shows ConflictPanel and lets the user refresh.
 */
export function PreferencesForm({ plan, onRefresh }: PreferencesFormProps) {
  const pref = plan.preference;
  const update = useUpdatePlanPreferences();

  const [timeWindow, setTimeWindow] = useState<string>(pref?.preferredTimeWindow ?? "flexible");
  const [paceMode, setPaceMode] = useState<string>(pref?.paceMode ?? "standard");
  const [days, setDays] = useState<string[]>(pref?.preferredStudyDays ?? []);
  const [maxDaily, setMaxDaily] = useState<string>(String(pref?.maxDailyMinutes ?? 60));
  const [sessionCap, setSessionCap] = useState<string>(String(pref?.sessionCapMinutes ?? 45));
  const [note, setNote] = useState<string>(pref?.temporaryNote ?? "");

  function toggleDay(day: string) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate({
      planId: plan.id,
      input: {
        expected_version: plan.version,
        preferred_time_window: timeWindow,
        pace_mode: paceMode,
        preferred_study_days: days,
        max_daily_minutes: Number.parseInt(maxDaily, 10) || null,
        session_cap_minutes: Number.parseInt(sessionCap, 10) || null,
        temporary_note: note.trim() || null,
      },
    });
  }

  const backendError = update.error instanceof BackendError ? update.error : null;
  const isValidationError = backendError?.errorCode === "request_validation_error";

  return (
    <form onSubmit={onSubmit} noValidate>
      <ConflictPanel error={update.error} onRefresh={onRefresh} />
      {update.error && !isValidationError && !(backendError?.intent === "stale-refresh") ? (
        <div style={{ marginBottom: "1rem" }}>
          <ErrorState error={update.error} />
        </div>
      ) : null}
      {isValidationError && backendError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ValidationErrors source={backendError} />
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "0.9rem" }}>
        <FormField label="Preferred time window">
          {(api) => (
            <Select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} {...api}>
              {TIME_WINDOWS.map((v) => (
                <option key={v} value={v}>
                  {humanize(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Pace">
          {(api) => (
            <Select value={paceMode} onChange={(e) => setPaceMode(e.target.value)} {...api}>
              {PACE_MODES.map((v) => (
                <option key={v} value={v}>
                  {humanize(v)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <fieldset style={{ border: "none", padding: 0 }}>
          <legend style={{ fontSize: "0.95rem", fontWeight: 500, marginBottom: "0.4rem" }}>
            Preferred study days
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {DAYS.map((day) => (
              <label key={day} style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem" }}>
                <input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} />
                {humanize(day)}
              </label>
            ))}
          </div>
        </fieldset>
        <FormField label="Max daily minutes">
          {(api) => (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={720}
              value={maxDaily}
              onChange={(e) => setMaxDaily(e.target.value)}
              {...api}
            />
          )}
        </FormField>
        <FormField label="Session cap (minutes)">
          {(api) => (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={360}
              value={sessionCap}
              onChange={(e) => setSessionCap(e.target.value)}
              {...api}
            />
          )}
        </FormField>
        <FormField label="Note (optional)">
          {(api) => (
            <Textarea
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              {...api}
            />
          )}
        </FormField>
        <Button type="submit" isBusy={update.isPending}>
          {update.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}

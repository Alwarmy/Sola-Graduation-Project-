import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FALLBACK } from "@/lib/copy/fallback";
import { formatOptional } from "@/lib/formatters/optional";
import { formatCount } from "@/lib/formatters/count";
import { formatDateTime } from "@/lib/formatters/date";
import {
  employmentStatusLabel,
  experienceLevelLabel,
  goalLabel,
  preferredLanguageLabel,
  trackLabel,
} from "@/lib/labels/profile-options";
import type { PublicProfile } from "@/lib/contracts/profile";

export type ProfileSummaryProps = {
  profile: PublicProfile;
};

/**
 * Read-only summary of the learner's profile. All values either come from
 * the backend or fall back to safe FALLBACK copy via CP3 formatters. No raw
 * snake_case / null / NaN reaches the DOM.
 */
export function ProfileSummary({ profile }: ProfileSummaryProps) {
  return (
    <Card
      title="Profile"
      subtitle={`Updated ${formatDateTime(profile.updatedAt)}`}
      headerActions={
        profile.isStudent ? <Badge tone="info">Student</Badge> : <Badge>Not a student</Badge>
      }
    >
      <dl style={dlStyle}>
        <Row label="Goal" value={goalLabel(profile.goal)} />
        <Row label="Background" value={trackLabel(profile.backgroundTrack)} />
        <Row
          label="Primary track"
          value={profile.primaryTrack ? trackLabel(profile.primaryTrack) : FALLBACK.unknown}
        />
        <Row
          label="Secondary tracks"
          value={
            profile.secondaryTracks.length === 0
              ? FALLBACK.unknown
              : profile.secondaryTracks.map((t) => trackLabel(t)).join(", ")
          }
        />
        <Row label="Target role" value={formatOptional(profile.targetRole)} />
        <Row
          label="Experience"
          value={
            profile.experienceLevel
              ? experienceLevelLabel(profile.experienceLevel)
              : FALLBACK.unknown
          }
        />
        <Row label="Employment" value={employmentStatusLabel(profile.employmentStatus)} />
        <Row
          label="Education major"
          value={profile.educationMajor ? trackLabel(profile.educationMajor) : FALLBACK.unknown}
        />
        <Row label="Weekly hours" value={`${formatCount(profile.weeklyHours)} h`} />
        <Row label="Preferred language" value={preferredLanguageLabel(profile.preferredLanguage)} />
        <Row label="Timezone" value={formatOptional(profile.timezone)} />
        <Row label="Bio" value={formatOptional(profile.bio)} />
      </dl>
    </Card>
  );
}

const dlStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "min-content 1fr",
  gap: "0.4rem 1.25rem",
  margin: 0,
  alignItems: "baseline",
};

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ fontWeight: 500, whiteSpace: "nowrap", color: "#555" }}>{l}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </>
  );
}

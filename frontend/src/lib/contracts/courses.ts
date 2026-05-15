import { z } from "zod";

/**
 * Courses domain request/response Zod schemas.
 *
 * Pipeline contract (locked in CP1, implemented in CP6):
 *   - Input step:  POST /courses/ingest (bearer required at runtime; hidden orchestration)
 *   - Output step: GET /courses/search with the same query
 *   - Learner display: curated `CourseSearchResponse.items` only.
 *
 * Source-unavailable message (locked):
 *   "Course search source is currently unavailable. Please try again later."
 *
 * `GET /courses/search`, `GET /courses`, and `GET /courses/{id}` are declared
 * `OAuth2PasswordBearer` in OpenAPI, but runtime probes (CP1 + CP6
 * re-verification) consistently return 200 without a bearer. The frontend
 * treats all three as optional-auth and forwards the bearer when a session
 * cookie is available so the backend can personalize.
 */

// ─── Search sort enum (closed set from OpenAPI) ─────────────────────────────

export const courseSearchSortBy = z.enum([
  "relevance",
  "personalized",
  "quality",
  "newest",
  "published",
  "duration_short",
  "duration_long",
]);
export type CourseSearchSortBy = z.infer<typeof courseSearchSortBy>;

// ─── POST /courses/ingest (hidden orchestration only) ───────────────────────

export const courseIngestRequestSchema = z.object({
  query: z.string().min(1),
  max_results_per_type: z.number().int().min(1).max(100).default(10),
});
export type CourseIngestRequest = z.infer<typeof courseIngestRequestSchema>;

// Backend-built badge on a course card.
export const courseBadgeSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    tone: z.string().nullish(),
  })
  .passthrough();
export type CourseBadge = z.infer<typeof courseBadgeSchema>;

/**
 * Curated course card from the backend. The shape is permissive
 * (`.passthrough()`) because the backend evolves additive fields, and CP6's
 * label layer maps preferred fields to a `PublicCourseCard` view model.
 *
 * Backend-built display labels are preferred over raw enums per CP1
 * evidence: `provider_display_name`, `content_format_label`,
 * `difficulty_label`, `duration_label`, `pricing_label`, `topic_tag_labels`,
 * `progression_label`, `quality_tier`, `card_summary`.
 *
 * The provider_metadata, quality_signals, and provider-side raw payloads are
 * intentionally NOT mapped to the public view model; they remain on the raw
 * schema for diagnostics-only access.
 */
export const courseCardResponseSchema = z
  .object({
    id: z.number().int(),
    source: z.string(),
    external_id: z.string(),
    content_type: z.string(),
    content_format_label: z.string().nullish(),
    title: z.string(),
    description: z.string().nullish(),
    short_description: z.string().nullish(),
    provider: z.string(),
    provider_display_name: z.string().nullish(),
    channel_title: z.string().nullish(),
    instructor_name: z.string().nullish(),
    instructor_display_name: z.string().nullish(),
    language: z.string().nullish(),
    level: z.string().nullish(),
    difficulty_level: z.string().nullish(),
    difficulty_label: z.string().nullish(),
    duration_minutes_total: z.number().int().nullish(),
    duration_is_estimated: z.boolean().nullish(),
    duration_label: z.string().nullish(),
    pricing_model: z.string().nullish(),
    pricing_label: z.string().nullish(),
    is_free: z.boolean().nullish(),
    topic_tags: z.array(z.string()).optional(),
    topic_tag_labels: z.array(z.string()).optional(),
    quality_score: z.number().nullish(),
    quality_tier: z.string().nullish(),
    prerequisite_hint: z.string().nullish(),
    progression_hint: z.string().nullish(),
    progression_label: z.string().nullish(),
    url: z.string().nullish(),
    thumbnail_url: z.string().nullish(),
    published_at: z.string().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
    card_summary: z.string().nullish(),
    badges: z.array(courseBadgeSchema).optional(),
  })
  .passthrough();
export type CourseCardResponse = z.infer<typeof courseCardResponseSchema>;

export const courseIngestResponseSchema = z.object({
  ingestion_id: z.number().int(),
  total_raw_items: z.number().int(),
  total_promoted_courses: z.number().int(),
  // The pipeline output. NEVER rendered to learners; learner display is
  // driven by the subsequent `GET /courses/search` call.
  courses: z.array(courseCardResponseSchema),
});
export type CourseIngestResponse = z.infer<typeof courseIngestResponseSchema>;

// ─── GET /courses/search ─────────────────────────────────────────────────────

export const courseSearchParamsSchema = z.object({
  q: z.string().nullish(),
  language: z.string().nullish(),
  content_type: z.string().nullish(),
  source: z.string().nullish(),
  difficulty_level: z.string().nullish(),
  pricing_model: z.string().nullish(),
  progression_hint: z.string().nullish(),
  topic_tag: z.string().nullish(),
  sort_by: courseSearchSortBy.default("relevance"),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export type CourseSearchParams = z.infer<typeof courseSearchParamsSchema>;

export const courseSearchMetadataSchema = z
  .object({
    total: z.number().int().nullish(),
    returned_count: z.number().int().nullish(),
    limit: z.number().int().nullish(),
    offset: z.number().int().nullish(),
    has_more: z.boolean().nullish(),
    sort_by: z.string().nullish(),
    ranking_mode: z.string().nullish(),
    query_text: z.string().nullish(),
  })
  .passthrough();
export type CourseSearchMetadata = z.infer<typeof courseSearchMetadataSchema>;

export const courseSearchFacetEntrySchema = z
  .object({
    value: z.string(),
    label: z.string().nullish(),
    count: z.number().int().nullish(),
    is_selected: z.boolean().nullish(),
  })
  .passthrough();
export type CourseSearchFacetEntry = z.infer<typeof courseSearchFacetEntrySchema>;

export const courseSearchResponseSchema = z
  .object({
    items: z.array(courseCardResponseSchema),
    metadata: courseSearchMetadataSchema,
    facets: z.unknown(),
    applied_filters: z.unknown(),
  })
  .passthrough();
export type CourseSearchResponse = z.infer<typeof courseSearchResponseSchema>;

// ─── Public view model (camelCase, learner-safe) ─────────────────────────────

/**
 * Browser-safe card. Fields that exist on the raw response but are unsafe
 * or provider-debug (provider_metadata, quality_signals, discovery, etc.)
 * are deliberately absent.
 */
export type PublicCourseCard = {
  id: number;
  title: string;
  source: string;
  providerDisplayName: string;
  contentFormatLabel: string | null;
  difficultyLabel: string | null;
  durationLabel: string | null;
  pricingLabel: string | null;
  instructorDisplayName: string | null;
  language: string | null;
  topicTagLabels: string[];
  progressionLabel: string | null;
  qualityTier: string | null;
  cardSummary: string | null;
  shortDescription: string | null;
  description: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  badges: Array<{ key: string; label: string; tone: string | null }>;
};

export function toPublicCourseCard(c: CourseCardResponse): PublicCourseCard {
  return {
    id: c.id,
    title: c.title,
    source: c.source,
    providerDisplayName: c.provider_display_name ?? c.provider,
    contentFormatLabel: c.content_format_label ?? null,
    difficultyLabel: c.difficulty_label ?? null,
    durationLabel: c.duration_label ?? null,
    pricingLabel: c.pricing_label ?? null,
    instructorDisplayName: c.instructor_display_name ?? c.instructor_name ?? c.channel_title ?? null,
    language: c.language ?? null,
    topicTagLabels: c.topic_tag_labels ?? [],
    progressionLabel: c.progression_label ?? null,
    qualityTier: c.quality_tier ?? null,
    cardSummary: c.card_summary ?? null,
    shortDescription: c.short_description ?? null,
    description: c.description ?? null,
    url: c.url ?? null,
    thumbnailUrl: c.thumbnail_url ?? null,
    badges: (c.badges ?? []).map((b) => ({
      key: b.key,
      label: b.label,
      tone: typeof b.tone === "string" ? b.tone : null,
    })),
  };
}

export type PublicCourseSearch = {
  items: PublicCourseCard[];
  total: number;
  returnedCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
  queryText: string | null;
};

export function toPublicCourseSearch(r: CourseSearchResponse): PublicCourseSearch {
  return {
    items: r.items.map(toPublicCourseCard),
    total: r.metadata.total ?? r.items.length,
    returnedCount: r.metadata.returned_count ?? r.items.length,
    hasMore: r.metadata.has_more ?? false,
    offset: r.metadata.offset ?? 0,
    limit: r.metadata.limit ?? r.items.length,
    queryText: r.metadata.query_text ?? null,
  };
}

/**
 * Locked user-facing copy. CP3 may translate later; the CONTENT may not be
 * weakened or removed without re-opening the CP1 pipeline evidence file.
 */
export const COURSE_SEARCH_SOURCE_UNAVAILABLE_COPY =
  "Course search source is currently unavailable. Please try again later." as const;

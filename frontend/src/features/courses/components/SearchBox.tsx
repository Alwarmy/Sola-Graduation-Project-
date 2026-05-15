"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";

export type SearchBoxProps = {
  initialQuery?: string;
  isBusy?: boolean;
  onSubmit: (query: string) => void;
};

/**
 * Plain search box for the Discover page. The visible product term is
 * "search". The pipeline orchestration (POST /courses/ingest internally)
 * happens server-side; this component must NEVER expose "ingest" or any
 * other admin/internal wording.
 */
export function SearchBox({ initialQuery = "", isBusy = false, onSubmit }: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <FormField label="Search courses">
            {(api) => (
              <Input
                type="search"
                placeholder="Try “Python”, “React”, “Machine learning”…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                {...api}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" isBusy={isBusy} disabled={query.trim().length === 0}>
          {isBusy ? "Searching…" : "Search"}
        </Button>
      </div>
    </form>
  );
}

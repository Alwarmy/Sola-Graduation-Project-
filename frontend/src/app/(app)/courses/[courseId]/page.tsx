import Link from "next/link";

import { PageHeader } from "@/components/layout/PageHeader";
import { CourseDetailView } from "@/features/courses/components/CourseDetailView";

export const metadata = {
  title: "Course · SOLA",
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <main style={{ maxWidth: "60rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader
        title="Course"
        actions={<Link href="/courses">← Back to Discover</Link>}
      />
      <CourseDetailView courseId={courseId} />
    </main>
  );
}

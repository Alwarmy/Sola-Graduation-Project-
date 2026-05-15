import { PlanDetailClient } from "@/features/plans/components/PlanDetailClient";

export const metadata = {
  title: "Plan · SOLA",
};

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  return <PlanDetailClient planId={planId} />;
}

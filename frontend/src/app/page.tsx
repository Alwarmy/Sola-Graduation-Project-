import { HomePageClient } from "@/features/home/components/HomePageClient";

export const metadata = {
  title: "SOLA · Home",
  description:
    "SOLA learner home — plans, schedule, recovery, and the assistant.",
};

export default function HomePage() {
  return <HomePageClient />;
}

import { ProfilePageClient } from "@/features/profile/components/ProfilePageClient";

export const metadata = {
  title: "Profile · SOLA",
};

export default function ProfilePage() {
  return (
    <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <ProfilePageClient />
    </main>
  );
}

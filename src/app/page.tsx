import { redirect } from "next/navigation";

export default function Home() {
  // Middleware handles the unauthenticated case (→ /login).
  // If we got here with a valid cookie, send to dashboard.
  redirect("/dashboard");
}

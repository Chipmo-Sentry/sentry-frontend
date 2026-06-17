import { redirect } from "next/navigation";

export default function Home() {
  // Middleware handles the unauthenticated case (→ /login).
  // If we got here with a valid cookie, land on the Pipeline Canvas (docs/26).
  redirect("/pipeline");
}

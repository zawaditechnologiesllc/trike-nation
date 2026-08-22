import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = { title: "Create Account" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}

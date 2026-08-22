import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}

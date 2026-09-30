"use client";

import { Suspense } from "react";
import { LoginScreen } from "@/components/screens/LoginScreen";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

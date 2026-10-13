import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = {
  title: "התחברות",
};

export default function LoginPage() {
  return <LoginScreen />;
}

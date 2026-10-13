import type { Metadata } from "next";
import { NewStoreScreen } from "@/components/platform/new-store-screen";

export const metadata: Metadata = {
  title: "אתר חדש",
};

export default function NewStorePage() {
  return <NewStoreScreen />;
}

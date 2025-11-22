"use client";

import { PageProvider } from "@/contexts/PageStore";
import { useWebDialerPage } from "./_hooks/useWebDialerPage";
import { WebDialerContent } from "./_components/WebDialerContent";

export default function WebDialerPage() {
  return (
    <PageProvider usePageHook={useWebDialerPage}>
      <WebDialerContent />
    </PageProvider>
  );
}

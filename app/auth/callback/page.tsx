import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">Signing in...</div>}>
      <CallbackClient />
    </Suspense>
  );
}

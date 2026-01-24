import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="p-6">登入中...</div>}>
      <CallbackClient />
    </Suspense>
  );
}

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login"); // 想直達今日就改成 "/today"
}

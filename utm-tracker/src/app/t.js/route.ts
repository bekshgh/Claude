import { buildSnippetJs } from "@/lib/snippet";

export const dynamic = "force-static";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://aieseckz.vercel.app";

// The on-page tracking script; Tilda pages load it via <script src=".../t.js">.
export function GET() {
  return new Response(buildSnippetJs(BASE), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

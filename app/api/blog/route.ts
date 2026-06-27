import { NextResponse } from "next/server";
import { getBlogPosts } from "@/lib/data";

export async function GET() {
  const posts = await getBlogPosts();
  return NextResponse.json({ data: posts });
}

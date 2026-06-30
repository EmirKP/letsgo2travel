import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogBySlug, getBlogPosts } from "@/lib/data";
import JsonLd from "@/app/components/JsonLd";
import { articleSchema } from "@/lib/structured-data";

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogBySlug(slug);
  return { title: post?.title || "Blog", description: post?.excerpt || "Letsgo2Travel blog" };
}

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogBySlug(slug);
  if (!post) notFound();
  return (
    <article className="l2t-page l2t-wrap l2t-article">
      <JsonLd data={articleSchema(post)} />
      <img className="l2t-article-image" src={post.image_url || "/travel-images/discover.jpg"} alt="" />
      <p className="l2t-kicker">{post.category} · {post.read_time}</p>
      <h1>{post.title}</h1>
      <p className="l2t-lead">{post.excerpt}</p>
      <div className="l2t-content-card"><p>{post.content}</p></div>
    </article>
  );
}

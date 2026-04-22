import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useTfpStore } from "@/lib/tfp/store";
import { fmtDateTime } from "@/lib/tfp/format";

export const Route = createFileRoute("/_app/help/$slug")({
  component: HelpArticlePage,
});

function HelpArticlePage() {
  const { slug } = Route.useParams();
  const articles = useTfpStore((s) => s.helpArticles);
  const users = useTfpStore((s) => s.users);
  const article = articles.find((a) => a.slug === slug);

  const html = useMemo(() => {
    if (!article) return "";
    const raw = marked.parse(article.body_markdown, { async: false }) as string;
    if (typeof window === "undefined") return raw;
    return DOMPurify.sanitize(raw);
  }, [article]);

  if (!article) {
    return (
      <div className="text-sm text-muted-foreground">
        Article not found.{" "}
        <Link to="/help" className="text-primary hover:underline">
          Back to help center
        </Link>
        .
      </div>
    );
  }

  const author = users.find((u) => u.id === article.updated_by);

  return (
    <article>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{article.section}</p>
      <h2 className="mt-1 font-display text-2xl">{article.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Updated {fmtDateTime(article.updated_at)}
        {author ? ` by ${author.name}` : ""}
      </p>
      <div
        className="prose prose-sm mt-5 max-w-none prose-headings:font-display prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-sm prose-li:text-sm prose-code:text-xs prose-strong:text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

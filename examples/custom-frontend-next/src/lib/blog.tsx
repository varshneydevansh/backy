import type { BackyBlogArchive as BackyBlogArchivePayload } from "./backy-client";

const postDate = (value: string | null | undefined): string => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date)
    : "";
};

export function BackyBlogArchive({
  archive,
  siteId,
  query,
}: {
  archive: BackyBlogArchivePayload;
  siteId: string;
  query?: string;
}) {
  const { posts, pagination } = archive;
  const previousOffset = Math.max(0, pagination.offset - pagination.limit);
  const nextOffset = pagination.offset + pagination.limit;
  const pageHref = (offset: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (offset > 0) params.set("offset", String(offset));
    const search = params.toString();
    return `/blog${search ? `?${search}` : ""}`;
  };

  return (
    <main data-backy-site-id={siteId} data-backy-route="/blog" data-backy-blog-archive="public-api">
      <header>
        <p>Journal</p>
        <h1>Blog</h1>
        <p>Reports, essays, notes, and published updates.</p>
        <form action="/blog" method="get" role="search">
          <label>
            <span>Search posts</span>
            <input name="q" type="search" defaultValue={query} placeholder="Search the archive" />
          </label>
          <button type="submit">Search</button>
        </form>
      </header>

      <section aria-label="Published posts" data-backy-blog-post-count={posts.length}>
        {posts.length === 0 ? (
          <p>{query ? "No published posts match this search." : "No posts have been published yet."}</p>
        ) : posts.map((post) => (
          <article key={post.id} data-backy-post-id={post.id}>
            {post.featuredImageUrl ? <img src={post.featuredImageUrl} alt="" /> : null}
            <div>
              {post.publishedAt ? <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time> : null}
              <h2><a href={`/blog/${encodeURIComponent(post.slug)}`}>{post.title}</a></h2>
              {post.excerpt ? <p>{post.excerpt}</p> : null}
              <a href={`/blog/${encodeURIComponent(post.slug)}`}>Read article</a>
            </div>
          </article>
        ))}
      </section>

      {pagination.offset > 0 || pagination.hasMore ? (
        <nav aria-label="Blog pagination">
          {pagination.offset > 0 ? <a href={pageHref(previousOffset)}>Newer posts</a> : <span />}
          {pagination.hasMore ? <a href={pageHref(nextOffset)}>Older posts</a> : null}
        </nav>
      ) : null}
    </main>
  );
}

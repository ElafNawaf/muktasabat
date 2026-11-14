import ReactMarkdown from "react-markdown";

/** Editor-authored Markdown. Raw HTML is skipped, and links are limited to
 *  http(s)/mailto/tel/relative so content can't inject script. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="mk-prose">
      <ReactMarkdown
        skipHtml
        urlTransform={(url) =>
          /^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(url) ? url : ""
        }
        components={{
          a: ({ href, children: c }) => {
            const external = !!href && /^https?:/i.test(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {c}
              </a>
            );
          },
          img: ({ src, alt }) =>
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

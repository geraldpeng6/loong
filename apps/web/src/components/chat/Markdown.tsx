import { useMemo } from "react";

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderMarkdown = (text: string) => {
  if (!text) return "";
  const escaped = escapeHtml(text);
  const codeBlocks: Array<{ lang: string; code: string }> = [];
  let html = escaped.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push({ lang, code });
    return `@@CODEBLOCK${index}@@`;
  });

  html = html
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

  codeBlocks.forEach((block, index) => {
    const languageClass = block.lang ? ` class="language-${block.lang}"` : "";
    const fenced = `<pre><code${languageClass}>${block.code}</code></pre>`;
    html = html.replace(`@@CODEBLOCK${index}@@`, fenced);
  });

  return html;
};

const Markdown = ({ text }: { text: string }) => {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className="text-sm leading-relaxed [&_pre]:mt-2 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default Markdown;

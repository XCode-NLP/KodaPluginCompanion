import clsx from "clsx";
import { Fragment, type ReactNode } from "react";

/**
 * Небольшой Markdown для ответов агента: абзацы, списки, заголовки, блоки
 * кода, `код`, **жирный** и *курсив*. Ссылки показываются текстом: страница
 * плагина никуда не ходит.
 */

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (token.startsWith("`")) parts.push(<code key={at}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) parts.push(<strong key={at}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("[")) parts.push(token.slice(1, token.indexOf("]")));
    else parts.push(<em key={at}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { kind: "code"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

function blocks(text: string): Block[] {
  const result: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) result.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith("```")) {
      flush();
      const code: string[] = [];
      for (index += 1; index < lines.length && !lines[index].trimStart().startsWith("```"); index += 1) code.push(lines[index]);
      result.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      result.push({ kind: "heading", text: heading[1] });
    } else if (item) {
      flush();
      const ordered = !item[1];
      const previous = result[result.length - 1];
      if (previous?.kind === "list" && previous.ordered === ordered) previous.items.push(item[3]);
      else result.push({ kind: "list", ordered, items: [item[3]] });
    } else if (!line.trim()) flush();
    else paragraph.push(line);
  }
  flush();
  return result;
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx("markdown", className)}>
      {blocks(text).map((block, index) => {
        if (block.kind === "code")
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.kind === "heading") return <h4 key={index}>{inline(block.text)}</h4>;
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item, at) => (
                <li key={at}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            {block.text.split("\n").map((line, at) => (
              <Fragment key={at}>
                {at > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

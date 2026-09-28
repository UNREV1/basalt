import { memo, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import type { Output } from "./model.ts";

// Outputs are shared with every peer, so HTML is sanitized and <style> is
// dropped (it would restyle the whole app); `contain: paint` in CSS keeps
// positioned content inside the output box.
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
    ADD_ATTR: ["target"],
  });
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** Apply carriage returns (progress bars) and drop terminal color codes. */
function cleanStream(text: string): string {
  return text
    .replace(ANSI, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const i = line.lastIndexOf("\r");
      return i >= 0 ? line.slice(i + 1) : line;
    })
    .join("\n");
}

function Html({ html, className }: { html: string; className: string }) {
  const clean = useMemo(() => sanitize(html), [html]);
  return <div className={`nb-out-html ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

function StreamOut({ output }: { output: Extract<Output, { type: "stream" }> }) {
  const text = useMemo(() => cleanStream(output.text).replace(/\n$/, ""), [output.text]);
  return <pre className={`nb-out-stream${output.name === "stderr" ? " stderr" : ""}`}>{text}</pre>;
}

function ErrorOut({ output }: { output: Extract<Output, { type: "error" }> }) {
  const [open, setOpen] = useState(true);
  const stack = output.stack ? cleanStream(output.stack) : "";
  return (
    <div className="nb-out-error" role="alert">
      <div className="nb-err-head">
        <span className="nb-err-name">{output.ename}</span>
        {output.message && <span className="nb-err-msg">{output.message}</span>}
        {stack && (
          <button type="button" className="nb-err-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide trace" : "Show trace"}
          </button>
        )}
      </div>
      {stack && open && <pre className="nb-err-stack">{stack}</pre>}
    </div>
  );
}

function OutputItem({ output }: { output: Output }) {
  switch (output.type) {
    case "stream":
      return <StreamOut output={output} />;
    case "result":
      return output.html ? <Html html={output.html} className="nb-out-result" /> : <pre className="nb-out-result">{output.text}</pre>;
    case "error":
      return <ErrorOut output={output} />;
    case "display":
      if (output.png) return <img className="nb-out-img" alt={output.text ?? "Figure"} src={`data:image/png;base64,${output.png}`} />;
      if (output.html) return <Html html={output.html} className="nb-out-display" />;
      return <pre className="nb-out-display">{output.text ?? ""}</pre>;
    default:
      return null;
  }
}

export const Outputs = memo(function Outputs({ outputs }: { outputs: Output[] }) {
  if (!outputs.length) return null;
  return (
    <div className="nb-outputs">
      {outputs.map((o, i) => (
        <OutputItem key={i} output={o} />
      ))}
    </div>
  );
});

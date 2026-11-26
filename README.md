# dsh-sidebar-quote

Select text in the sidebar document preview (Markdown, PDF, Office, plain text,
code) and ask about it right there: the selection enters the composer as a
read-only quote chip with your question attached. A little whale beside the
composer rewrites your draft into an executable prompt — and every rewrite is
reviewed by you before it touches anything.

## What it does

- **Quote & ask** — select text in a document preview, press the floating
  button, type your question, press Enter. The quote goes into the composer as
  an atomic read-only chip (`insertQuote`), so the model (and you) can always
  tell what you were asking about. The source filename is shown on the card
  when the preview provides one. Quotes longer than 8000 characters are
  truncated and the card tells you so.
- **Frame a picture** — a Word or PowerPoint illustration is just pixels in the
  converted PDF, so there is nothing to select. Press the framing button at the
  top-right of the preview, drag a box over the picture you want changed, and the
  card opens with that crop attached: the composer receives a read-only quote
  naming the file, page and area, plus the saved screenshot path, so the agent
  can open the real crop (or pull the original image out of the source file).
  A box that is too small, or that missed the page, says so instead of doing
  nothing.
- **Drop a file onto the sidebar to open it** — dragging a file from Explorer
  onto the right sidebar opens it in the document pane, the same way a link
  click there does. Only the desktop shell provides real filesystem paths; in
  the browser the plugin says so instead of guessing.
- **Prompt optimization (the whale)** — press the whale to send the draft to a
  two-stage rewrite:
  1. *Analyze* finds real execution gaps (missing task boundary, background,
     constraints, output form, or acceptance criteria). If the gaps would
     change the result completely, it asks at most two questions first.
     If there is nothing worth closing, it says so and leaves your draft alone.
  2. *Generate* rewrites the draft to close exactly those gaps, longer or
     shorter as needed — no fixed template, no fixed length multiplier.
     A deterministic gate flags invented facts, placeholders and copy-only
     rewrites; violations trigger one repair round before you ever see it.
  3. You get a **preview panel** (draggable, action buttons always visible)
     listing what changed and which gap each change closes. Nothing is written
     to the composer until you press "Write to composer". One click on ↩
     restores your original draft.
- **While it works** — a small floating panel sits in the middle of the window
  and shows the elapsed seconds next to a Cancel button. Drag it by its body to
  park it wherever it is out of your way; it starts centred instead of covering
  the top-left corner. It deliberately does not poll the host for progress:
  every command execution leaves a record in the conversation, so polling would
  bury the transcript. Cancelling only stops the wait: the answer is thrown
  away, never written behind your back. `Alt+O` starts an optimization from the
  keyboard.
- **Preview actions** — copy the rewrite to the clipboard, ask for another take
  ("Try another" restructures the result while closing the same gaps), shorten
  it, or make it more concrete. Every one of those still ends in the same
  confirm step before anything reaches the composer.
- **Quote list** — every quote you inserted is kept per session behind a small
  "Quotes N" chip next to the whale. Open it to see the passages and their
  source files, and press "Back to the passage" to scroll the open preview to
  that text and highlight it.
- **Settings page** — under Plugins → this plugin you can turn the `Alt+O`
  shortcut off, choose whether the optimizer asks first when information is
  missing, and tint the conversation's own `Quote text` button so it stops
  vanishing into the page. These preferences live in this window on this
  machine only.
- Quotes stay read-only through optimization: the rewrite replaces your words,
  never the quoted originals.

## Recommended usage

The optimizer does not see your conversation history — only the draft and any
quotes in it. So:

- **First message of a project, or a standalone task**: press the whale; the
  rewrite adds the background it needs.
- **Follow-up turns**: send as-is; the conversation already carries the
  context.
- **A follow-up that could be misunderstood**: quote the previous conclusion
  into the composer, then press the whale — quotes are the context channel.

## Requirements

- DSH `>=0.2.2-rc.1`, Node `>=22`
- Framed screenshots are written to `DSH_HOME/sidebar-quote/crops` (default
  `~/.dsh/sidebar-quote/crops`) and files older than a week are pruned; a temp
  directory would have been deleted out from under a draft that still quotes
  the path.
- Uses the agent's currently selected model; two model calls per optimization
  (analyze + generate), each capped (2048 / 8192 output tokens). No data leaves
  the model provider you already use.

## Install

From npm (once published):

```
dsh plugin add dsh-sidebar-quote
```

Or from a local checkout:

```
dsh plugin add <path-to-this-repo>
```

## Privacy

Your draft (and any quoted text) is sent to the selected model for rewriting.
Nothing is stored beyond the draft itself; the plugin keeps no history of its
own.

## License & assets

Code and hand-drawn SVGs (icon.svg, preview.svg): MIT (see LICENSE). The
bitmap icons (icon.png / avatar.png) are AI-derived fan works of a community
mascot, distributed under CC BY-NC-SA 4.0 — see
ASSET_LICENSE.md. "DeepSeek" and the whale logo are trademarks of DeepSeek;
this plugin is unofficial and not endorsed by DeepSeek.

## License

MIT

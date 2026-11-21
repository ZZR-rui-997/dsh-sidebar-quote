// Client half of the sidebar-quote bundle.
//
// Two heads:
//   * shell.overlay (root)                 — watches DOM selections in the
//                                            document preview's `.textLayer`,
//                                            anchors a "quote & ask" button
//                                            inside that layer, and opens an
//                                            inline ask card next to it.
//   * conversation.composer.dock (session) — owns `inputActions`: it writes the
//                                            quote + question into the draft and
//                                            submits the message.
//
// The ask card is portaled to document.body on purpose: in the right sidebar's
// fullscreen presentation the panel covers the frame, so only a body-level
// overlay (or the document's own text layer) stays visible.
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-quote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    let ReactDOM = null;
    try {
      ReactDOM = require('react-dom');
    } catch (error) {
      console.error('[sidebar-quote] react-dom unavailable', error);
    }
    const createPortal = ReactDOM && typeof ReactDOM.createPortal === 'function'
      ? ReactDOM.createPortal
      : null;

    // Circular chibi-whale avatar (picked from the user's reference sheet).
    const AVATAR_DATA_URL = 'data:image/png;base64,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';

    const askListeners = new Set();
    const MAX_QUOTE_CHARS = 8000;
    // Last optimizer result per Session, so an accidental click can be undone
    // even after the composer remounts.
    const undoBySession = new Map();

    const SURFACE = 'var(--dsw-alias-bg-overlay)';
    const BORDER = 'var(--dsw-alias-border-l2)';
    const LABEL = 'var(--dsw-alias-label-primary)';
    const LABEL_2 = 'var(--dsw-alias-label-secondary)';
    const BRAND = 'var(--dsw-alias-brand-primary)';
    const BG_BASE = 'var(--dsw-alias-bg-base)';

    function emitAsk(payload) {
      let handled = false;
      for (const listener of Array.from(askListeners)) {
        try {
          if (listener(payload) !== false) handled = true;
        } catch (error) {
          console.error('[sidebar-quote] ask listener failed', error);
        }
      }
      return handled;
    }

    const BUBBLE_STYLE = [
      'position:absolute',
      'z-index:2147483000',
      'pointer-events:auto',
      'display:none',
      'align-items:center',
      'gap:6px',
      'padding:4px 9px',
      'border-radius:8px',
      'border:1px solid var(--dsw-alias-border-l2)',
      'background:var(--dsw-alias-bg-overlay)',
      'color:var(--dsw-alias-label-primary)',
      'font-size:12.5px',
      'line-height:1.2',
      'font-family:inherit',
      'white-space:nowrap',
      'cursor:pointer',
      '-webkit-user-select:none',
      'user-select:none',
      'box-shadow:0 6px 18px rgba(0, 0, 0, 0.22)',
      'transform:translateX(-100%)',
    ].join(';');

    function elementOf(node) {
      if (!node) return null;
      return node.nodeType === 1 ? node : node.parentElement || null;
    }

    // Every document preview that renders selectable text. PDF and Office
    // previews arrive as PDF.js text layers; Markdown, code and plain text
    // previews render their own DOM inside the sidebar preview frame.
    const PREVIEW_SELECTORS = [
      '.textLayer',
      '[data-document-markdown]',
      '[data-textpreview-content]',
      '[data-code-preview]',
    ];

    // Depth from the document root; used to pick the NEAREST matching preview
    // container. Testing the selectors in list order would let a distant
    // ancestor win over a closer one (a code preview sits inside a content
    // pane, and the pane would otherwise be reported as the selection host).
    function depthOf(node) {
      let depth = 0;
      let cursor = node;
      while (cursor) {
        depth += 1;
        cursor = cursor.parentElement || null;
      }
      return depth;
    }

    function previewHostOf(node) {
      const element = elementOf(node);
      if (!element || !element.closest) return null;
      // Never quote the conversation transcript or an editable field. The
      // transcript is excluded on purpose: selecting a sentence in a chat
      // message to quote it back is not this plugin's job, and popping a bubble
      // mid-conversation is pure noise.
      if (element.closest('[contenteditable="true"]')) return null;
      if (element.closest('[data-slot="conversation.chat.flow"]')) return null;
      if (element.closest('textarea, input, [role="textbox"]')) return null;
      let nearest = null;
      let nearestDepth = -1;
      for (let index = 0; index < PREVIEW_SELECTORS.length; index += 1) {
        const found = element.closest(PREVIEW_SELECTORS[index]);
        if (!found) continue;
        const depth = depthOf(found);
        if (depth > nearestDepth) {
          nearest = found;
          nearestDepth = depth;
        }
      }
      return nearest;
    }

    function styleOf(node) {
      try {
        return window.getComputedStyle(node) || {};
      } catch (error) {
        return {};
      }
    }

    // A scroll container is a bad containing block: its border box stays put in
    // the viewport while its content scrolls, so an absolutely positioned child
    // that is offset from a range rect drifts by (scrollTop, scrollLeft) — the
    // deeper it scrolls, the worse the miss. Skip those and anchor higher up.
    function isScrollContainer(node) {
      const style = styleOf(node);
      const scrolls = (value) => {
        const text = String(value || '').toLowerCase();
        return text === 'auto' || text === 'scroll' || text === 'overlay';
      };
      return scrolls(style.overflowY) || scrolls(style.overflowX);
    }

    // The bubble is absolutely positioned, so it must live inside an element
    // that establishes a containing block — but never inside a scroll container.
    // PDF text layers already position themselves (and there drifting with the
    // page is correct, since the text drifts too); Markdown and plain text need
    // the nearest non-scrolling positioned ancestor.
    function anchoredHostOf(container) {
      let node = container;
      while (node && node !== document.body && node !== document.documentElement) {
        const position = String(styleOf(node).position || '').toLowerCase();
        const positioned = Boolean(position) && position !== 'static';
        if (positioned && !isScrollContainer(node)) return node;
        node = node.parentElement;
      }
      return null;
    }

    // Which file the selection came from. Quoting a passage out of a long
    // document is only useful if you can still tell afterwards where it came
    // from, and the preview header already carries the path.
    function quoteSourceOf(container) {
      try {
        const root = container && container.closest ? container.closest('[data-document-preview]') : null;
        if (!root) return '';
        const label = root.querySelector('[data-textpreview-path]');
        const raw = label ? String(label.textContent || '').trim() : '';
        if (!raw) return '';
        const parts = raw.split(/[\\/]/u).filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : raw;
      } catch (error) {
        return '';
      }
    }

    // Current selection when it belongs to a previewed document's selectable
    // text: PDF and Office (converted to PDF), plus Markdown, code and plain
    // text previews.
    function readSelection() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
      const text = selection.toString().trim();
      if (!text) return null;

      const range = selection.getRangeAt(0);
      const container = previewHostOf(range.startContainer)
        || previewHostOf(range.endContainer)
        || previewHostOf(range.commonAncestorContainer);
      if (!container || !container.isConnected) return null;

      const anchor = elementOf(range.commonAncestorContainer);
      if (anchor && anchor.closest && anchor.closest('[contenteditable="true"]')) return null;

      const host = anchoredHostOf(container);
      if (!host || !host.isConnected) return null;

      const rects = range.getClientRects();
      const first = rects && rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      if (!first || (first.width === 0 && first.height === 0)) return null;

      return {
        text,
        host,
        rect: { left: first.left, right: first.right, top: first.top, bottom: first.bottom },
        source: quoteSourceOf(container),
      };
    }

    function cardGeometry(rect) {
      const width = 320;
      const maxLeft = Math.max(8, window.innerWidth - width - 12);
      const left = Math.min(Math.max(12, rect.left), maxLeft);
      const estimatedHeight = 210;
      let top = rect.bottom + 8;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight);
      }
      return { left, top, width };
    }

    const CARD_STYLE = {
      position: 'fixed',
      zIndex: 2147483600,
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '10px',
      borderRadius: '10px',
      border: `1px solid ${BORDER}`,
      background: SURFACE,
      color: LABEL,
      boxShadow: '0 14px 40px rgba(0, 0, 0, 0.30)',
      fontFamily: 'inherit',
    };

    const QUOTE_PREVIEW_STYLE = {
      maxHeight: '58px',
      overflow: 'hidden',
      paddingLeft: '7px',
      borderLeft: `2px solid ${BORDER}`,
      color: LABEL_2,
      fontSize: '11.5px',
      lineHeight: 1.45,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      userSelect: 'none',
    };

    const TEXTAREA_STYLE = {
      width: '100%',
      boxSizing: 'border-box',
      minHeight: '58px',
      maxHeight: '180px',
      resize: 'none',
      padding: '7px 9px',
      borderRadius: '7px',
      border: `1px solid ${BORDER}`,
      background: BG_BASE,
      color: LABEL,
      fontSize: '13px',
      lineHeight: 1.5,
      fontFamily: 'inherit',
      outline: 'none',
    };

    const ROW_STYLE = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '6px',
    };

    // Only the body scrolls, never the panel box. The action row lives outside
    // the scrolling area, so a long rewrite cannot push the buttons out of the
    // panel -- that was the bug where "write to the composer" was on screen but
    // unclickable.
    const PANEL_STYLE = {
      position: 'fixed',
      zIndex: 2147483600,
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px',
      boxSizing: 'border-box',
      borderRadius: '10px',
      border: `1px solid ${BORDER}`,
      background: SURFACE,
      color: LABEL,
      boxShadow: '0 14px 40px rgba(0, 0, 0, 0.30)',
      fontFamily: 'inherit',
      overflow: 'hidden',
    };

    const PANEL_HEADER_STYLE = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '6px',
      flex: 'none',
      cursor: 'move',
      touchAction: 'none',
      userSelect: 'none',
      fontSize: '13px',
      fontWeight: 600,
    };

    const PANEL_BODY_STYLE = {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      minHeight: 0,
      flex: '1 1 auto',
      overflowY: 'auto',
      overflowX: 'hidden',
    };

    const PANEL_ROW_STYLE = {
      ...ROW_STYLE,
      flex: 'none',
    };

    const PANEL_CLOSE_STYLE = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '20px',
      height: '20px',
      padding: 0,
      border: 'none',
      borderRadius: '6px',
      background: 'transparent',
      color: LABEL_2,
      fontSize: '15px',
      lineHeight: 1,
      fontFamily: 'inherit',
      cursor: 'pointer',
      flex: 'none',
    };

    const PREVIEW_TEXT_STYLE = {
      flex: 'none',
      padding: '8px 10px',
      borderRadius: '7px',
      border: `1px solid ${BORDER}`,
      background: BG_BASE,
      color: LABEL,
      fontSize: '12.5px',
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      userSelect: 'text',
    };

    const META_LABEL_STYLE = {
      color: LABEL_2,
      fontSize: '11.5px',
      lineHeight: 1.5,
    };

    function buttonStyle(primary) {
      return {
        padding: '4px 12px',
        borderRadius: '6px',
        border: primary ? 'none' : `1px solid ${BORDER}`,
        background: primary ? BRAND : 'transparent',
        color: primary ? '#ffffff' : LABEL_2,
        fontSize: '12.5px',
        lineHeight: 1.4,
        fontFamily: 'inherit',
        cursor: 'pointer',
      };
    }

    function QuoteSelection(props) {
      const strings = props.strings;
      const [selection, setSelection] = React.useState(null);
      const [composing, setComposing] = React.useState(false);
      const [draft, setDraft] = React.useState('');
      const [status, setStatus] = React.useState(null);

      const composingRef = React.useRef(false);
      const statusRef = React.useRef(null);
      const pendingRef = React.useRef(null);
      const cardRef = React.useRef(null);
      const textareaRef = React.useRef(null);

      composingRef.current = composing;
      statusRef.current = status;

      // The anchored trigger button lives inside the document's text layer for
      // its whole lifetime; it is plain DOM because React cannot mount into
      // another plugin's subtree.
      React.useEffect(() => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dsh-sidebar-quote-bubble';
        button.textContent = strings.quote;
        button.title = strings.quote;
        button.setAttribute('aria-label', strings.quote);
        button.style.cssText = BUBBLE_STYLE;

        let frame = 0;

        const hide = () => { button.style.display = 'none'; };

        const place = () => {
          frame = 0;
          if (composingRef.current || statusRef.current) {
            hide();
            return;
          }
          const found = readSelection();
          if (!found) {
            hide();
            pendingRef.current = null;
            return;
          }
          const hostRect = found.host.getBoundingClientRect();
          const layoutWidth = found.host.offsetWidth || 0;
          const layoutHeight = found.host.offsetHeight || 0;
          // A transformed ancestor (zoom / slide animation) scales rendered
          // pixels; convert visual offsets back into layout units.
          const scaleX = layoutWidth > 0 ? hostRect.width / layoutWidth : 1;
          const scaleY = layoutHeight > 0 ? hostRect.height / layoutHeight : 1;
          const maxLeft = Math.max((layoutWidth || hostRect.width) - 6, 6);
          const maxTop = Math.max(layoutHeight || hostRect.height, 0);

          let left = (found.rect.right - hostRect.left) / (scaleX || 1);
          let top = (found.rect.top - hostRect.top) / (scaleY || 1) - 32;
          if (top < 2) top = (found.rect.bottom - hostRect.top) / (scaleY || 1) + 6;
          left = Math.min(Math.max(left, 6), maxLeft);
          if (maxTop > 0) top = Math.min(Math.max(top, 2), maxTop - 4);

          if (button.parentNode !== found.host) {
            try {
              found.host.appendChild(button);
            } catch (error) {
              console.error('[sidebar-quote] cannot anchor the trigger', error);
              hide();
              return;
            }
          }
          pendingRef.current = { text: found.text, rect: found.rect };
          button.style.left = `${left}px`;
          button.style.top = `${top}px`;
          button.style.display = 'inline-flex';
        };

        const schedule = () => {
          if (frame) return;
          frame = window.requestAnimationFrame(place);
        };

        const onMouseDown = (event) => {
          event.preventDefault();
          event.stopPropagation();
        };

        const onClick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const pending = pendingRef.current;
          if (!pending) return;
          hide();
          setSelection(pending);
          setDraft('');
          setComposing(true);
        };

        button.addEventListener('mousedown', onMouseDown);
        button.addEventListener('click', onClick);
        document.addEventListener('selectionchange', schedule);
        document.addEventListener('mouseup', schedule, true);
        document.addEventListener('keyup', schedule, true);
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);

        return () => {
          document.removeEventListener('selectionchange', schedule);
          document.removeEventListener('mouseup', schedule, true);
          document.removeEventListener('keyup', schedule, true);
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
          if (frame) window.cancelAnimationFrame(frame);
          button.removeEventListener('mousedown', onMouseDown);
          button.removeEventListener('click', onClick);
          button.remove();
        };
      }, [strings.quote]);

      // Focus the question field as soon as the card opens.
      React.useEffect(() => {
        if (composing && textareaRef.current) textareaRef.current.focus();
      }, [composing]);

      // Clicking anywhere outside the card dismisses it.
      React.useEffect(() => {
        if (!composing) return;
        const onDown = (event) => {
          if (cardRef.current && !cardRef.current.contains(event.target)) {
            setComposing(false);
            setDraft('');
          }
        };
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
      }, [composing]);

      // Sent / error feedback is transient.
      React.useEffect(() => {
        if (!status) return;
        const timer = window.setTimeout(() => setStatus(null), 1600);
        return () => window.clearTimeout(timer);
      }, [status]);

      const close = () => {
        setComposing(false);
        setDraft('');
      };

      const send = () => {
        if (!selection) return;
        // Truncating a quote silently would hand the model a passage whose tail
        // is missing while the draft still looks complete, so the cut is
        // reported in the confirmation instead of being hidden.
        const truncated = selection.text.length > MAX_QUOTE_CHARS;
        const quote = truncated ? selection.text.slice(0, MAX_QUOTE_CHARS) : selection.text;
        const question = draft.trim();
        const handled = emitAsk({ quote, question });
        setSelection(null);
        setComposing(false);
        setDraft('');
        setStatus({
          text: handled
            ? (truncated ? strings.storedTrimmed : strings.stored)
            : strings.unavailable,
          rect: selection.rect,
        });
      };

      const onTextareaKeyDown = (event) => {
        event.stopPropagation();
        // Chinese IME candidacy owns the keyboard: Escape cancels the candidate
        // window and Enter commits it, so neither may reach this handler.
        const native = event.nativeEvent || {};
        if (native.isComposing || native.keyCode === 229) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        send();
      };

      const overlays = [];
      if (composing && selection) {
        const geometry = cardGeometry(selection.rect);
        const card = h('div', {
          ref: cardRef,
          className: 'dsh-sidebar-quote-card',
          style: { ...CARD_STYLE, left: `${geometry.left}px`, top: `${geometry.top}px`, width: `${geometry.width}px` },
          onMouseDown: (event) => event.stopPropagation(),
        }, [
          h('div', {
            key: 'quote',
            style: QUOTE_PREVIEW_STYLE,
            title: selection.text,
          }, selection.text.length > 180 ? `${selection.text.slice(0, 180)}…` : selection.text),
          selection.source ? h('div', {
            key: 'source',
            style: META_LABEL_STYLE,
          }, selection.source) : null,
          h('textarea', {
            key: 'input',
            ref: textareaRef,
            value: draft,
            rows: 2,
            placeholder: strings.placeholder,
            style: TEXTAREA_STYLE,
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: onTextareaKeyDown,
          }),
          h('div', { key: 'row', style: ROW_STYLE }, [
            h('button', {
              key: 'cancel',
              type: 'button',
              style: buttonStyle(false),
              onClick: (event) => { event.preventDefault(); close(); },
            }, strings.cancel),
            h('button', {
              key: 'send',
              type: 'button',
              style: buttonStyle(true),
              onClick: (event) => { event.preventDefault(); send(); },
            }, strings.send),
          ]),
        ]);
        overlays.push(createPortal
          ? createPortal(card, document.body)
          : h('div', { style: { position: 'fixed', left: `${geometry.left}px`, top: `${geometry.top}px`, zIndex: 2147483600 } }, card));
      }

      if (status) {
        const geometry = cardGeometry(status.rect);
        const toast = h('div', {
          key: 'status',
          style: {
            position: 'fixed',
            left: `${geometry.left}px`,
            top: `${geometry.top}px`,
            zIndex: 2147483601,
            pointerEvents: 'none',
            padding: '6px 12px',
            borderRadius: '8px',
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            color: LABEL,
            fontSize: '12.5px',
            lineHeight: 1.3,
            fontFamily: 'inherit',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
            whiteSpace: 'nowrap',
          },
        }, status.text);
        overlays.push(createPortal
          ? createPortal(toast, document.body)
          : h('div', { style: { position: 'fixed', left: `${geometry.left}px`, top: `${geometry.top}px`, zIndex: 2147483601 } }, toast));
      }

      if (overlays.length === 0) return null;
      return h(React.Fragment, null, overlays);
    }

    // Session-scoped headless bridge: lives in a composer slot only to borrow
    // `inputActions`, which no frame-wide slot exposes.
    function QuoteBridge(props) {
      const actions = props.inputActions;
      React.useEffect(() => {
        if (!actions) return undefined;
        const listener = (payload) => {
          const quote = String((payload && payload.quote) || '').trim();
          const question = String((payload && payload.question) || '').trim();
          if (!quote) return false;
          try {
            const capture = () => {
              try {
                return typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : null;
              } catch (error) {
                return null;
              }
            };
            // Append as plain text, preserving whatever the draft already holds.
            const insertPlain = (text) => {
              if (typeof actions.insertText !== 'function') return false;
              for (let attempt = 0; attempt < 2; attempt += 1) {
                const span = capture();
                if (!span) return false;
                if (actions.insertText(text, span) !== false) return true;
              }
              return false;
            };
            const draftHasContent = () => {
              const span = capture();
              return Boolean(span && typeof span.start === 'number' && span.start > 0);
            };

            // The quoted passage is stored as an atomic quote node: its text
            // cannot be edited character by character, so an accidental
            // keystroke can never make it differ from the source. Deletion is
            // still possible, but only as one deliberate whole-block action.
            // The question stays ordinary editable text.
            if (draftHasContent()) insertPlain('\n\n');

            let inserted = false;
            if (typeof actions.insertQuote === 'function') {
              try {
                inserted = actions.insertQuote(quote) !== false;
              } catch (error) {
                console.error('[sidebar-quote] insertQuote failed', error);
                inserted = false;
              }
            }

            if (inserted) {
              if (question) {
                // The draft revision advances with the quote insertion; capture
                // a fresh insertion point and retry briefly if the editor
                // refuses it.
                let added = false;
                for (let attempt = 0; attempt < 3 && !added; attempt += 1) {
                  const span = capture();
                  if (!span || typeof actions.insertText !== 'function') break;
                  added = actions.insertText(`\n${question}`, span) !== false;
                }
                if (!added) console.error('[sidebar-quote] question text was not inserted');
              }
              return true;
            }

            // Fallback when the composer refuses a quote node (e.g. a command
            // claim is active): store the block as plain text so nothing is
            // lost, and report it as stored.
            const quoted = quote
              .split('\n')
              .map((line) => (line ? `> ${line}` : '>'))
              .join('\n');
            return insertPlain(`${quoted}${question ? `\n${question}` : ''}`);
          } catch (error) {
            console.error('[sidebar-quote] store failed', error);
            return false;
          }
        };
        askListeners.add(listener);
        return () => { askListeners.delete(listener); };
      }, [actions]);
      return null;
    }

    // ---- optional prompt optimizer ("little fat fish") --------------------

    function readDraftFromState(state) {
      if (!state || typeof state !== 'object') return '';
      const candidates = [
        state.draft,
        state.projection && state.projection.detectText,
        state.detectText,
        state.text,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
        if (candidate && typeof candidate.text === 'string' && candidate.text.trim()) return candidate.text;
      }
      return '';
    }

    function readComposerDomText() {
      try {
        const editor = document.querySelector('[contenteditable="true"][data-lexical-editor="true"]')
          || document.querySelector('[contenteditable="true"]');
        return editor ? String(editor.innerText || '') : '';
      } catch (error) {
        return '';
      }
    }

    // Fallback quote discovery for drafts whose snapshot is unavailable: the
    // semantic text carries each atomic quote as Markdown blockquote lines.
    function quotesFromText(text) {
      if (typeof text !== 'string' || text.indexOf('>') < 0) return [];
      const lines = text.split('\n');
      const quotes = [];
      let lineStart = 0;
      let i = 0;
      while (i < lines.length) {
        if (!/^>/.test(lines[i])) {
          lineStart += lines[i].length + 1;
          i += 1;
          continue;
        }
        const start = lineStart;
        const block = [];
        while (i < lines.length && /^>/.test(lines[i])) {
          block.push(lines[i]);
          lineStart += lines[i].length + 1;
          i += 1;
        }
        const formatted = text.slice(start, lineStart - 1);
        if (formatted) {
          quotes.push({
            offset: start,
            length: formatted.length,
            text: block.map((line) => line.replace(/^> ?/, '')).join('\n'),
          });
        }
      }
      return quotes;
    }

    function readDraftSnapshot(state) {
      const draft = state && typeof state === 'object' ? state.draft : undefined;
      if (!draft || typeof draft !== 'object' || typeof draft.text !== 'string') return null;
      const snapshot = {
        text: draft.text,
        references: Array.isArray(draft.references) ? draft.references : [],
      };
      if (Array.isArray(draft.quotes) && draft.quotes.length > 0) snapshot.quotes = draft.quotes;
      return snapshot;
    }

    function PromptFish(props) {
      const strings = props.strings;
      const inputActions = props.inputActions;
      const sessionId = props.sessionId;
      const commands = props.commands;
      const commandsReady = Boolean(commands && typeof commands.execute === 'function');

      const useInputHook = typeof props.useInput === 'function' ? props.useInput : () => undefined;
      const inputState = useInputHook((state) => state);

      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState(null);
      const [undo, setUndo] = React.useState(null);
      const [anchor, setAnchor] = React.useState({ left: 0, top: 0 });
      // `pending` holds the result of one optimizer round: either the questions
      // that must be answered before a rewrite is possible, or a preview the
      // user has to accept. Nothing is written to the composer while it is set.
      const [pending, setPending] = React.useState(null);
      const [answers, setAnswers] = React.useState({});
      const [panelPos, setPanelPos] = React.useState(null);
      const buttonRef = React.useRef(null);
      const dragRef = React.useRef(null);

      const draft = readDraftFromState(inputState);
      const fallback = React.useMemo(
        () => (draft ? '' : readComposerDomText()),
        [draft, inputState],
      );
      const hasContent = Boolean((draft || fallback).trim());

      // Dragging lives on the window so the pointer may leave the header (and
      // even the panel) without the drag sticking. Every move is re-clamped.
      const onDragMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const native = event || {};
        setPanelPos(clampPanel({
          ...drag.base,
          left: drag.left + ((native.clientX || 0) - drag.pointerX),
          top: drag.top + ((native.clientY || 0) - drag.pointerY),
        }));
      };

      const endDrag = () => {
        if (!dragRef.current) return;
        dragRef.current = null;
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
      };

      React.useEffect(() => () => {
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
      }, []);

      // Closing the panel forgets where it was dragged to, so the next round
      // opens anchored to the button again. Moving between questions and the
      // preview keeps the position, because it is still the same round.
      React.useEffect(() => {
        if (!pending) setPanelPos(null);
      }, [pending]);

      // Undo belongs to one Session and survives this component remounting.
      React.useEffect(() => {
        setUndo(undoBySession.get(sessionId) || null);
      }, [sessionId]);

      // A cleared composer (sent, or emptied by hand) retires the undo offer.
      React.useEffect(() => {
        if (!hasContent && undo) {
          undoBySession.delete(sessionId);
          setUndo(null);
        }
      }, [hasContent, sessionId, undo]);

      React.useEffect(() => {
        if (!notice) return undefined;
        const timer = window.setTimeout(() => setNotice(null), 2600);
        return () => window.clearTimeout(timer);
      }, [notice]);

      const showNotice = (message) => {
        const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : null;
        if (rect) {
          setAnchor({
            left: Math.max(12, Math.min(rect.left, window.innerWidth - 280)),
            top: Math.max(12, rect.top - 42),
          });
        }
        setNotice(message);
      };

      // Split the draft around its atomic quotes: only the user's own text is
      // sent to the optimizer, and the quoted passages are rebuilt locally as
      // read-only nodes afterwards.
      const splitDraft = (snapshot) => {
        const spans = Array.isArray(snapshot.quotes)
          ? [...snapshot.quotes].sort((a, b) => a.offset - b.offset)
          : [];
        const segments = [];
        const quoteTexts = [];
        let cursor = 0;
        for (const quote of spans) {
          segments.push(snapshot.text.slice(cursor, quote.offset));
          quoteTexts.push(typeof quote.text === 'string' ? quote.text : '');
          cursor = quote.offset + quote.length;
        }
        segments.push(snapshot.text.slice(cursor));
        return { spans, segments, quoteTexts };
      };

      // Rebuild the structured draft from the model's rewritten segments plus
      // the untouched quoted passages.
      const composeDraft = (snapshot, spans, segments, parts) => {
        let text = '';
        const quotes = [];
        for (let index = 0; index < segments.length; index += 1) {
          let piece;
          if (segments[index].trim() === '') {
            piece = segments[index];
          } else {
            // Keep the paragraph breaks the original segment had; the model
            // only rewrites the words.
            const leading = (segments[index].match(/^\s*/) || [''])[0];
            const trailing = (segments[index].match(/\s*$/) || [''])[0];
            piece = `${leading}${String(parts[index] || '').trim()}${trailing}`;
          }
          if (index > 0 && piece && !/^\s/.test(piece)) piece = `\n${piece}`;
          text += piece;
          if (index < spans.length) {
            const quote = spans[index];
            const formatted = snapshot.text.slice(quote.offset, quote.offset + quote.length);
            if (!formatted) throw new Error('引用片段无法重建，请稍后重试');
            if (text && !text.endsWith('\n')) text += '\n';
            quotes.push({ text: quote.text, offset: text.length, length: formatted.length });
            text += formatted;
          }
        }
        const structured = { text, references: [] };
        if (quotes.length > 0) structured.quotes = quotes;
        return { structured, text };
      };

      const runOptimize = async (options) => {
        const opts = options || {};
        if (busy) return;
        if (!commands || typeof commands.execute !== 'function') {
          showNotice(strings.fishUnavailable);
          return;
        }
        if (!sessionId) return;

        let snapshot = opts.snapshot || null;
        if (!snapshot) {
          const source = (readDraftFromState(inputState) || readComposerDomText()).trim();
          if (!source) {
            showNotice(strings.fishEmpty);
            return;
          }
          snapshot = readDraftSnapshot(inputState);
          if (!snapshot) snapshot = { text: source, references: [] };
          if (!snapshot.quotes) {
            const parsedQuotes = quotesFromText(snapshot.text);
            if (parsedQuotes.length > 0) snapshot.quotes = parsedQuotes;
          }
        }

        const split = splitDraft(snapshot);
        if (split.segments.every((segment) => !segment.trim())) {
          showNotice(strings.fishEmpty);
          return;
        }

        const payload = { segments: split.segments, quotes: split.quoteTexts };
        if (opts.answers && opts.answers.length > 0) payload.answers = opts.answers;
        if (opts.revise) payload.revise = opts.revise;
        // "Just rewrite it" must not turn into a second round of questions.
        if (opts.skipQuestions) payload.clarificationMode = 'proceed';
        if (opts.answers && opts.answers.length > 0) payload.clarificationMode = 'proceed';

        setBusy(true);
        try {
          // JSON.stringify escapes every newline into the two characters `\n`,
          // so the payload is already a single line and needs no extra
          // encoding. (Percent-encoding it here would also throw on a lone
          // surrogate, which a bad paste can leave in the draft.)
          const line = `/optimize-prompt ${JSON.stringify(payload)}`;
          const result = await commands.execute(sessionId, line, []);
          if (!result || !result.ok) {
            throw new Error((result && result.error && result.error.message) || '调用优化命令失败');
          }
          const execution = result.value;
          if (!execution) throw new Error('优化命令未注册');
          const commandResult = execution.result;
          if (!commandResult || commandResult.kind !== 'success') {
            throw new Error((commandResult && commandResult.text) || '优化失败');
          }
          let data;
          try {
            data = JSON.parse(String(commandResult.text || ''));
          } catch (error) {
            throw new Error('模型返回的格式无法识别，请重试');
          }

          const questions = Array.isArray(data.questions) ? data.questions : [];
          if (data.needsInput || (data.decision === 'ask' && questions.length > 0 && !opts.answers)) {
            setAnswers({});
            setPending({
              kind: 'questions',
              questions,
              reason: data.reason || '',
              snapshot,
              answers: opts.answers || [],
            });
            return;
          }

          const parts = Array.isArray(data.parts) ? data.parts : null;
          if (!parts || parts.length !== split.segments.length || !parts.every((part) => typeof part === 'string')) {
            throw new Error('模型返回的格式无法识别，请重试');
          }
          if (data.unchanged) {
            setPending(null);
            showNotice(strings.fishNoGap);
            return;
          }
          const composed = composeDraft(snapshot, split.spans, split.segments, parts);
          setPending({
            kind: 'preview',
            composed,
            parts,
            changes: Array.isArray(data.changes) ? data.changes : [],
            gaps: Array.isArray(data.gaps) ? data.gaps : [],
            warning: data.warning || '',
            snapshot,
            answers: opts.answers || [],
          });
        } catch (error) {
          showNotice((error && error.message) || strings.fishFailed);
        } finally {
          setBusy(false);
        }
      };

      // Nothing reaches the composer until the preview is accepted: a rewrite
      // the user cannot inspect is a rewrite they cannot refuse.
      const applyPending = () => {
        if (!pending || pending.kind !== 'preview') return;
        if (!inputActions || typeof inputActions.setDraft !== 'function') {
          showNotice(strings.unavailable);
          return;
        }
        inputActions.setDraft(pending.composed.structured);
        const optimized = pending.parts.filter((part) => part.trim()).join('\n\n');
        undoBySession.set(sessionId, { original: pending.snapshot, optimized });
        setUndo({ original: pending.snapshot, optimized });
        setPending(null);
        showNotice(strings.fishDone);
      };

      // `instruction` is the protocol id the Host validates ('specific' or
      // 'shorter'), not the sentence shown to the user: the Host owns the
      // wording of the revision hint so both halves cannot drift apart.
      const refine = (instruction) => {
        if (!pending || pending.kind !== 'preview') return;
        const optimized = pending.parts.filter((part) => part.trim()).join('\n\n');
        runOptimize({
          snapshot: pending.snapshot,
          answers: pending.answers,
          revise: { instruction, text: optimized },
        });
      };

      // Collect the questions the user actually answered, and re-run with those
      // answers as confirmed facts — never as content the model may invent.
      const continueWithAnswers = () => {
        if (!pending || pending.kind !== 'questions') return;
        const collected = pending.questions
          .map((question, index) => ({ q: String(question.q || ''), a: String(answers[index] || '').trim() }))
          .filter((entry) => entry.a)
          .map((entry) => ({ q: entry.q, a: entry.a }));
        if (collected.length === 0) {
          showNotice(strings.fishNeedAnswer);
          return;
        }
        const merged = [...(pending.answers || []), ...collected];
        runOptimize({ snapshot: pending.snapshot, answers: merged });
      };

      const revert = () => {
        const entry = undoBySession.get(sessionId);
        if (!entry) return;
        if (!inputActions || typeof inputActions.setDraft !== 'function') {
          showNotice(strings.unavailable);
          return;
        }
        inputActions.setDraft(entry.original);
        undoBySession.delete(sessionId);
        setUndo(null);
        showNotice(strings.undoDone);
      };

      const title = busy ? strings.fishBusy : strings.fishTitle;
      const disabled = busy || !commandsReady;

      const fish = h('img', {
        src: AVATAR_DATA_URL,
        width: 22,
        height: 22,
        alt: '',
        'aria-hidden': true,
        className: 'dsh-fish-shape',
        style: { display: 'block', borderRadius: '50%' },
      });

      const avatarButton = h('button', {
        key: 'button',
        ref: buttonRef,
        type: 'button',
        className: busy ? 'dsh-fish-busy' : undefined,
        title,
        'aria-label': title,
        disabled,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          runOptimize();
        },
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          padding: 0,
          border: 'none',
          borderRadius: '7px',
          background: 'transparent',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          flex: 'none',
        },
      }, fish);

      // Appears only while an optimization can be reverted. Clicking restores
      // the exact draft that was sent to the optimizer.
      const undoButton = undo ? h('button', {
        key: 'undo',
        type: 'button',
        title: strings.undoTitle,
        'aria-label': strings.undoTitle,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          revert();
        },
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          padding: 0,
          marginRight: '2px',
          border: 'none',
          borderRadius: '6px',
          background: 'transparent',
          color: LABEL_2,
          fontSize: '14px',
          lineHeight: 1,
          fontFamily: 'inherit',
          cursor: 'pointer',
          flex: 'none',
        },
      }, '↩') : null;

      // The result panel never touches the composer: it either asks for the few
      // facts the model cannot guess, or shows the rewrite for approval.
      //
      // The panel is draggable, so its position is explicit state, and every
      // coordinate is clamped: whatever the user does, the header and the action
      // row stay on screen.
      const panelGeometry = () => {
        const viewportWidth = window.innerWidth || 1024;
        const viewportHeight = window.innerHeight || 768;
        const width = Math.min(430, Math.max(280, viewportWidth - 24));
        const maxHeight = Math.max(220, Math.min(620, viewportHeight - 24));
        return { width, maxHeight, viewportWidth, viewportHeight };
      };

      const clampPanel = (candidate) => {
        const geometry = panelGeometry();
        const width = candidate.width || geometry.width;
        return {
          width,
          maxHeight: candidate.maxHeight || geometry.maxHeight,
          left: Math.max(8, Math.min(candidate.left, geometry.viewportWidth - width - 8)),
          top: Math.max(8, Math.min(candidate.top, geometry.viewportHeight - 48)),
        };
      };

      const defaultPanelPosition = () => {
        const geometry = panelGeometry();
        const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : null;
        const gap = 10;
        const left = rect ? rect.right - geometry.width : geometry.viewportWidth - geometry.width - 16;
        const top = rect ? rect.top - gap - geometry.maxHeight : 12;
        return clampPanel({ left, top, width: geometry.width, maxHeight: geometry.maxHeight });
      };

      const panelPosition = panelPos || defaultPanelPosition();
      const panelStyle = {
        ...PANEL_STYLE,
        left: `${panelPosition.left}px`,
        top: `${panelPosition.top}px`,
        width: `${panelPosition.width}px`,
        maxHeight: `${panelPosition.maxHeight}px`,
      };

      const startDrag = (event) => {
        const native = event || {};
        if (native.button !== undefined && native.button !== 0) return;
        const origin = panelPos || defaultPanelPosition();
        dragRef.current = {
          pointerX: native.clientX || 0,
          pointerY: native.clientY || 0,
          left: origin.left,
          top: origin.top,
          base: origin,
        };
        setPanelPos(origin);
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        if (typeof native.preventDefault === 'function') native.preventDefault();
      };

      const panelHeader = (label) => h('div', {
        key: 'header',
        style: PANEL_HEADER_STYLE,
        onPointerDown: startDrag,
        title: strings.fishDragHint,
      }, [
        h('span', { key: 'label', style: { minWidth: 0 } }, label),
        h('span', {
          key: 'grip',
          'aria-hidden': true,
          style: { color: LABEL_2, fontSize: '12px', flex: 'none' },
        }, '⠿'),
        h('button', {
          key: 'close',
          type: 'button',
          'aria-label': strings.cancel,
          title: strings.cancel,
          onClick: () => setPending(null),
          onPointerDown: (event) => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
          },
          style: PANEL_CLOSE_STYLE,
        }, '×'),
      ]);

      const panelRow = (buttons) => h('div', { key: 'row', style: PANEL_ROW_STYLE }, buttons);

      const questionInput = (index) => h('input', {
        key: 'answer',
        type: 'text',
        value: answers[index] || '',
        placeholder: strings.fishAnswerPlaceholder,
        onChange: (event) => {
          const value = event.target.value;
          setAnswers((previous) => ({ ...previous, [index]: value }));
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            continueWithAnswers();
          }
        },
        style: {
          width: '100%',
          boxSizing: 'border-box',
          padding: '5px 8px',
          borderRadius: '6px',
          border: `1px solid ${BORDER}`,
          background: BG_BASE,
          color: LABEL,
          fontSize: '12.5px',
          fontFamily: 'inherit',
          outline: 'none',
        },
      });

      const questionsPanel = pending && pending.kind === 'questions'
        ? createPortal(h('div', { style: panelStyle }, [
          panelHeader(strings.fishAskTitle),
          h('div', { key: 'body', style: PANEL_BODY_STYLE }, [
            pending.reason
              ? h('div', { key: 'reason', style: META_LABEL_STYLE }, pending.reason)
              : null,
            ...pending.questions.map((question, index) => h('div', {
              key: `q${index}`,
              style: { display: 'flex', flexDirection: 'column', gap: '4px' },
            }, [
              h('div', { key: 'q', style: { fontSize: '12.5px', lineHeight: 1.5 } }, `${index + 1}. ${question.q}`),
              question.why ? h('div', { key: 'why', style: META_LABEL_STYLE }, question.why) : null,
              Array.isArray(question.options) && question.options.length > 0
                ? h('div', { key: 'opts', style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
                  question.options.map((option, optionIndex) => h('button', {
                    key: `o${optionIndex}`,
                    type: 'button',
                    onClick: () => setAnswers((previous) => ({ ...previous, [index]: option })),
                    style: buttonStyle(false),
                  }, option)))
                : null,
              questionInput(index),
            ])),
          ]),
          panelRow([
            h('button', {
              key: 'cancel',
              type: 'button',
              onClick: () => setPending(null),
              style: buttonStyle(false),
            }, strings.cancel),
            h('button', {
              key: 'skip',
              type: 'button',
              title: strings.fishSkipHint,
              onClick: () => runOptimize({ snapshot: pending.snapshot, answers: pending.answers, skipQuestions: true }),
              style: buttonStyle(false),
            }, strings.fishSkip),
            h('button', {
              key: 'go',
              type: 'button',
              onClick: continueWithAnswers,
              style: buttonStyle(true),
            }, strings.fishContinue),
          ]),
        ]), document.body)
        : null;

      const previewPanel = pending && pending.kind === 'preview'
        ? createPortal(h('div', { style: panelStyle }, [
          panelHeader(strings.fishPreviewTitle),
          h('div', { key: 'body', style: PANEL_BODY_STYLE }, [
            h('div', { key: 'text', style: PREVIEW_TEXT_STYLE }, pending.composed.text),
            pending.changes.length > 0
              ? h('div', { key: 'changes', style: META_LABEL_STYLE }, [
                h('div', { key: 'label', style: { fontWeight: 600 } }, strings.fishChangesTitle),
                ...pending.changes.map((change, index) => h('div', {
                  key: `c${index}`,
                }, `· ${String(change.summary || change.id || '')}`)),
              ])
              : null,
            pending.warning
              ? h('div', { key: 'warning', style: { ...META_LABEL_STYLE, color: BRAND } }, pending.warning)
              : null,
          ]),
          panelRow([
            h('button', {
              key: 'shorter',
              type: 'button',
              onClick: () => refine('shorter'),
              style: buttonStyle(false),
            }, strings.fishShorter),
            h('button', {
              key: 'concrete',
              type: 'button',
              onClick: () => refine('specific'),
              style: buttonStyle(false),
            }, strings.fishConcrete),
            h('button', {
              key: 'cancel',
              type: 'button',
              onClick: () => setPending(null),
              style: buttonStyle(false),
            }, strings.cancel),
            h('button', {
              key: 'accept',
              type: 'button',
              onClick: applyPending,
              style: buttonStyle(true),
            }, strings.fishAccept),
          ]),
        ]), document.body)
        : null;

      const node = h(React.Fragment, null, [
        h('style', { key: 'style' }, '@keyframes dsh-fish-sway{0%,100%{transform:translateX(-2px) rotate(-6deg)}50%{transform:translateX(2px) rotate(6deg)}}.dsh-fish-busy .dsh-fish-shape{animation:dsh-fish-sway 1.9s ease-in-out infinite;transform-origin:50% 62%}'),
        h('div', {
          key: 'wrap',
          style: { display: 'inline-flex', alignItems: 'center', gap: '1px', flex: 'none' },
        }, [avatarButton, undoButton].filter(Boolean)),
        notice ? (createPortal
          ? createPortal(h('div', {
            key: 'notice',
            style: {
              position: 'fixed',
              left: `${anchor.left}px`,
              top: `${anchor.top}px`,
              zIndex: 2147483601,
              pointerEvents: 'none',
              maxWidth: '280px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              color: LABEL,
              fontSize: '12.5px',
              lineHeight: 1.3,
              fontFamily: 'inherit',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
            },
          }, notice), document.body)
          : null) : null,
        questionsPanel,
        previewPanel,
      ]);

      return node;
    }

    function applyInner(ctx) {
      const strings = {
        quote: '引用并提问',
        placeholder: '想问什么？Enter 存入输入框，Shift+Enter 换行',
        send: '存入输入框',
        cancel: '取消',
        stored: '已存入输入框 ✓',
        storedTrimmed: '已存入输入框 ✓（超出上限的部分已截掉）',
        unavailable: '输入框当前不可用，请稍后重试',
        fishTitle: '优化提示词（可选）',
        fishBusy: '正在优化…',
        fishDone: '已替换为优化后的提示词（引用仍保持只读，点 ↩ 可撤销）',
        fishDonePlain: '已替换为优化后的提示词（引用片段未能保持只读，已按纯文本写入）',
        undoTitle: '撤销优化，恢复我原来写的',
        undoDone: '已恢复你原来的草稿',
        fishEmpty: '先写点内容再优化',
        fishFailed: '优化失败',
        fishUnavailable: 'Host 未就绪，暂时无法优化',
        fishAskTitle: '先确认几件事，否则只能替你编',
        fishAnswerPlaceholder: '在这里回答；留空就是放弃这一问',
        fishContinue: '带着回答去改写',
        fishSkip: '别问了，直接写',
        fishSkipHint: '模型会明确标注哪些是它补的，你可以在预览里改',
        fishNeedAnswer: '至少回答一个问题，或者点「别问了，直接写」',
        fishPreviewTitle: '改写结果（确认后才会写入输入框）',
        fishChangesTitle: '这次改了什么 / 补了哪些缺口',
        fishShorter: '再短一点',
        fishConcrete: '再具体一点',
        fishAccept: '写入输入框',
        fishNoGap: '这份草稿已经够清楚了，模型认为没有值得补的缺口（不是失败，是没改动）',
        fishDragHint: '拖动标题栏可以移动这个窗口',
      };
      const locale = ctx.locale || ctx.get('locale');
      if (locale && typeof locale.bind === 'function') {
        try {
          if (typeof locale.register === 'function') {
            locale.register('sidebar-quote', 'zh', {
              quote: strings.quote,
              placeholder: strings.placeholder,
              send: strings.send,
              cancel: strings.cancel,
              stored: strings.stored,
              storedTrimmed: strings.storedTrimmed,
              unavailable: strings.unavailable,
              fishTitle: strings.fishTitle,
              fishBusy: strings.fishBusy,
              fishDone: strings.fishDone,
              fishDonePlain: strings.fishDonePlain,
              undoTitle: strings.undoTitle,
              undoDone: strings.undoDone,
              fishEmpty: strings.fishEmpty,
              fishFailed: strings.fishFailed,
              fishUnavailable: strings.fishUnavailable,
              fishAskTitle: strings.fishAskTitle,
              fishAnswerPlaceholder: strings.fishAnswerPlaceholder,
              fishContinue: strings.fishContinue,
              fishSkip: strings.fishSkip,
              fishSkipHint: strings.fishSkipHint,
              fishNeedAnswer: strings.fishNeedAnswer,
              fishPreviewTitle: strings.fishPreviewTitle,
              fishChangesTitle: strings.fishChangesTitle,
              fishShorter: strings.fishShorter,
              fishConcrete: strings.fishConcrete,
              fishAccept: strings.fishAccept,
              fishNoGap: strings.fishNoGap,
            });
            locale.register('sidebar-quote', 'en', {
              quote: 'Quote & ask',
              placeholder: 'Ask about this selection. Enter adds it to the composer',
              send: 'Add to composer',
              cancel: 'Cancel',
              stored: 'Added to the composer ✓',
              storedTrimmed: 'Added to the composer ✓ (the part over the limit was cut)',
              unavailable: 'The composer is unavailable right now',
              fishTitle: 'Optimize prompt (optional)',
              fishBusy: 'Optimizing…',
              fishDone: 'Draft replaced with the optimized prompt (quotes stay read-only; ↩ reverts)',
              fishDonePlain: 'Draft replaced with the optimized prompt (quoted passages could not stay read-only; inserted as plain text)',
              undoTitle: 'Undo the optimization and restore my draft',
              undoDone: 'Original draft restored',
              fishEmpty: 'Write something first',
              fishFailed: 'Optimization failed',
              fishUnavailable: 'The host is not ready yet',
              fishAskTitle: 'A few things to confirm, or it would have to make them up',
              fishAnswerPlaceholder: 'Answer here; leave blank to skip this question',
              fishContinue: 'Rewrite with these answers',
              fishSkip: "Don't ask, just write",
              fishSkipHint: 'The model will mark what it filled in, and you can edit it in the preview',
              fishNeedAnswer: 'Answer at least one question, or choose “Don\'t ask, just write”',
              fishPreviewTitle: 'Rewrite (nothing is written to the composer until you accept)',
              fishChangesTitle: 'What changed / which gap it closes',
              fishShorter: 'Shorter',
              fishConcrete: 'More concrete',
              fishAccept: 'Write to composer',
              fishNoGap: 'This draft is already clear enough — the model found no gap worth closing (no change, not a failure)',
        fishDragHint: 'Drag the title bar to move this window',
            });
          }
          const translate = locale.bind('sidebar-quote');
          for (const key of Object.keys(strings)) {
            const translated = translate(key);
            if (translated && translated !== key) strings[key] = translated;
          }
        } catch (error) {
          console.error('[sidebar-quote] locale unavailable', error);
        }
      }

      // `remote.commands` is declared in the plugin's inject list, so the
      // service exists before apply runs; it is absent only for a non-owner
      // Peer, where the fish simply stays disabled.
      const commands = ctx.remote && ctx.remote.commands ? ctx.remote.commands : undefined;
      const Fish = (props) => h(PromptFish, { ...props, commands, strings });

      const Selection = () => h(QuoteSelection, { strings });

      const safeInject = (key, register) => {
        try {
          return ctx.slots.inject(key, register);
        } catch (error) {
          console.error(`[sidebar-quote] slot "${key}" unavailable`, error);
          return undefined;
        }
      };

      safeInject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'sidebar-quote.bubble',
        order: 50,
        label: strings.quote,
      }, Selection));

      safeInject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'sidebar-quote.bridge',
        order: 90,
        label: strings.quote,
      }, QuoteBridge));

      safeInject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'sidebar-quote.prompt-fish',
        order: 20,
        label: strings.fishTitle,
      }, Fish));
    }

    // Activation must never fail: a broken auxiliary surface would otherwise
    // abort the whole Web boot.
    function apply(ctx) {
      try {
        applyInner(ctx);
      } catch (error) {
        console.error('[sidebar-quote] activation failed', error);
      }
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply,
    };
  },
});

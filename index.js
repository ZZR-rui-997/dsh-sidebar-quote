/**
 * Host half of the sidebar-quote bundle.
 *
 * Serves one session command, `optimize-prompt`, which the composer's whale
 * button calls through `ctx.remote.commands.execute()`. The caller splits its
 * draft into text segments and quoted passages; only the text segments are
 * rewritten here. Quoted passages are passed as read-only context and are
 * never part of the answer, so the caller can rebuild them as read-only nodes.
 *
 * The pipeline is deliberately two-stage. A single "rewrite this" call drifts
 * into paraphrase: the model polishes the wording and reports success while
 * every real execution gap survives. Stage one therefore has to name the gaps
 * first — each improvement carries the failure it prevents — and only then may
 * stage two rewrite. Stage two is allowed to grow the text: there is no fixed
 * template and no length multiplier.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ANALYZE_PROMPT = `你是一名提示词工程师。调用方会把输入框草稿拆成若干"文字段"（用户自己写的指令或问题）和若干"引用段"（用户从文档里选中的原文，只读，绝不改写）。

你的任务不是改写，而是先判断：这段草稿交给一个 AI 助手执行时，会在哪里做错、做漏、或做得不合用户预期？

输出 JSON：
{"decision":"ask|rewrite|unchanged","goal":"用户真正想要的结果","confirmedFacts":["草稿或补充信息里已经明确的事实"],"restrictions":["用户明确说出的限制，逐条原样抄写"],"gaps":[{"id":"g1","gap":"不补这一条会造成哪种具体错误或返工","action":"要写进提示词的具体内容"}],"questions":[{"q":"要问用户的一句话","why":"为什么这个答案会改变结果","options":["可选答案"]}],"reason":"一句话说明判断依据"}

规则：
1. gap 必须写成"缺了它会出什么具体差错"，不是"这句话还能更通顺"。只是换措辞、加形容词、加泛泛的注意事项，都不算 gap。如果只有换说法的余地，返回 unchanged 并说明理由。
2. 常见的真实缺口只有五类：任务边界不清（要做什么、不做什么）、背景缺失（给谁看、什么场景、已有条件）、约束缺失（长度、语言、必须用/不能用什么）、输出形式未定（结构、字段、粒度）、验收标准缺失（怎样算做完）。只在确实缺失、且补上能防止具体错误时才补，不要为了凑齐五类而填。
3. 绝不编造用户没给的具体值：路径、平台、工具、依赖、输入类型、日期、数字、受众、环境细节一律不许虚构。
4. 用户已经写明的限制必须逐条原样保留，包括输出格式与排除项；禁止弱化、禁止改写成建议。
5. questions 最多 2 条，只问"不同答案会实质改变提示词"的那一种。不要问篇幅多长、语气如何、要不要举例这类无关紧要的问题。
6. decision 取值：ask（信息缺失会实质改变结果）、rewrite（能说出至少一条具体 gap）、unchanged（已经够清楚）。
7. 只输出 JSON，不要解释、不要前言、不要 Markdown 代码块。`;

const GENERATE_PROMPT = `你是一名提示词工程师。把草稿里每个"文字段"重写成可以直接交给 AI 助手执行的提示词。引用段只作为理解上下文，绝对不能出现在输出里。

规则：
1. 与输入文字段一一对应、顺序相同、条数相同；纯空白段原样返回。
2. 按改进计划补齐缺口。**允许比原文长得多**：没有固定模板，也没有统一扩写倍率。简单任务就写成简洁自然的一段话；复杂任务才用分步或小标题。
3. 补的是"执行缺口"，不是"更多形容词"：把要做的事、背景、约束、输出形式、验收标准写清楚到能被照做。原来只有一句话的想法，可以扩写成一段能执行的指令。
4. 保留原文的事实、数字、单位、术语、路径、专有名词和语气；不得臆造任何用户没给的具体值。用户没给的信息，用"未指定由你判断"这类保守措辞带过，或干脆不提，绝不许编造。
5. 用户写明的限制原样保留，包括输出格式与排除项。
6. 不要写"作为 AI 你应该…"这类元指令，不要加"如果你还需要我可以…"这类客套话，不要输出"以下是优化后的提示词"这类前言。
7. 只输出 JSON，不要解释、不要前言、不要 Markdown 代码块：
{"parts": ["第一段改写结果", "第二段改写结果"], "changes": [{"id": "g1", "summary": "这一条实际改进了什么"}]}
8. 字符串内部绝对不能出现真实换行：需要换行的地方写成两个字符的转义 \\n。写成 "第一行\\n第二行"，不能真的敲回车。`;

const REVISE_HINTS = {
  specific: '本轮要求：在已有版本基础上写得更具体。把仍然含糊的地方落实成可执行的做法，但同样的五类不许编造。',
  shorter: '本轮要求：在已有版本基础上更短。删掉重复与铺垫，保留全部约束与验收标准；长度必须真的减少。',
  // "Try again" is not a correction of the previous answer: it asks for a
  // different arrangement of the same, still-missing content.
  again: '本轮要求：换一种组织方式重写。仍然要补齐同样的缺口、遵守同样的禁止项，但行文结构与上一版要有明显区别，不要只改几个词。',
};

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

function parsePayload(rawInput) {
  const raw = String(rawInput == null ? '' : rawInput).trim();
  if (!raw) return null;

  // The caller sends JSON.stringify output, which is already a single line
  // because JSON escapes every newline. Accept a percent-encoded payload too,
  // so a caller that chooses to encode keeps working.
  const candidates = [raw];
  if (raw.indexOf('%') >= 0) {
    try {
      candidates.push(decodeURIComponent(raw));
    } catch {
      // A stray percent sign is not an encoded payload; keep the raw form.
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.segments)) {
        const segments = parsed.segments.map((s) => (typeof s === 'string' ? s : ''));
        const quotes = Array.isArray(parsed.quotes)
          ? parsed.quotes.map((q) => (typeof q === 'string' ? q : ''))
          : [];
        const answers = Array.isArray(parsed.answers)
          ? parsed.answers
            .filter((a) => a && typeof a.q === 'string' && typeof a.a === 'string' && a.a.trim())
            .slice(0, 8)
            .map((a) => ({ q: a.q.slice(0, 240), a: a.a.trim().slice(0, 500) }))
          : [];
        const notes = typeof parsed.notes === 'string' ? parsed.notes.trim().slice(0, 2000) : '';
        // 'proceed' means the user already declined to answer: asking again would
        // loop, so the plan's questions are dropped and the rewrite goes ahead.
        const clarificationMode = parsed.clarificationMode === 'proceed' ? 'proceed' : undefined;
        const revise = parsed.revise && typeof parsed.revise === 'object'
          && (parsed.revise.instruction === 'specific' || parsed.revise.instruction === 'shorter'
            || parsed.revise.instruction === 'again')
          && typeof parsed.revise.text === 'string' && parsed.revise.text.trim()
          ? { instruction: parsed.revise.instruction, text: parsed.revise.text.trim().slice(0, 6000) }
          : undefined;
        return { segments, quotes, answers, notes, clarificationMode, revise };
      }
      if (parsed && typeof parsed.draft === 'string') {
        return { segments: [parsed.draft], quotes: [], answers: [], notes: '', clarificationMode: undefined, revise: undefined };
      }
    } catch {
      // Try the next form.
    }
  }

  if (raw.startsWith('{')) return null;
  return { segments: [raw], quotes: [], answers: [], notes: '', clarificationMode: undefined, revise: undefined };
}

// Repairs the one malformation models reliably produce when a rewritten
// paragraph spans several lines: a RAW newline inside a JSON string literal.
// That is illegal JSON, so JSON.parse rejects the whole answer even though the
// content is otherwise perfect. Walk the text with string/escape awareness and
// escape the control characters that belong to a string body.
function repairControlChars(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (!inString) {
      if (ch === '"') inString = true;
      output += ch;
      continue;
    }
    if (escaped) {
      escaped = false;
      output += ch;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      output += ch;
      continue;
    }
    if (ch === '"') {
      inString = false;
      output += ch;
      continue;
    }
    if (ch === '\n') { output += '\\n'; continue; }
    if (ch === '\r') { output += '\\r'; continue; }
    if (ch === '\t') { output += '\\t'; continue; }
    if (ch === '\f') { output += '\\f'; continue; }
    if (ch === '\b') { output += '\\b'; continue; }
    output += ch;
  }
  return output;
}

function stripFence(text) {
  const source = String(text || '').trim();
  const match = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?\s*```$/u.exec(source);
  return match ? match[1].trim() : source;
}

// Parse one JSON object out of a model answer, tolerating fences, prose around
// it, and raw control characters inside string literals.
function parseObject(text) {
  const source = stripFence(text);
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = source.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(repairControlChars(body));
    } catch {
      return null;
    }
  }
}

function parseParts(text, expected) {
  const parts = anyParts(text);
  if (!parts) return null;
  if (parts.length !== expected) return null;
  return parts;
}

// Pull a parts array out of the answer without insisting on a length.
function anyParts(text) {
  const parsed = parseObject(text);
  const parts = parsed && parsed.parts;
  if (!Array.isArray(parts)) return null;
  if (!parts.every((part) => typeof part === 'string')) return null;
  return parts;
}

function anyChanges(text) {
  const parsed = parseObject(text);
  const changes = parsed && parsed.changes;
  if (!Array.isArray(changes)) return [];
  return changes
    .filter((c) => c && typeof c.id === 'string' && typeof c.summary === 'string' && c.summary.trim())
    .slice(0, 8)
    .map((c) => ({ id: c.id.slice(0, 40), summary: c.summary.trim().slice(0, 240) }));
}

// A draft that mixes quotes with blank lines splits into segments that are pure
// whitespace, and models routinely drop those from the answer even though the
// system prompt asks them to keep the positions. When the answer's length
// matches the non-blank segments exactly, put the blanks back so a well-formed
// rewrite is not thrown away over bookkeeping.
function reconcileParts(answer, segments) {
  const parts = anyParts(answer);
  if (!parts) return null;
  const nonBlank = segments.filter((segment) => segment.trim() !== '');
  if (parts.length !== nonBlank.length) return null;
  let cursor = 0;
  return segments.map((segment) => {
    if (segment.trim() === '') return segment;
    const part = parts[cursor];
    cursor += 1;
    return part;
  });
}

// ---------------------------------------------------------------------------
// Deterministic gate
// ---------------------------------------------------------------------------

const LEAD_INS = [
  /^(?:好的|好|当然|没问题)[，,。.！!\s]*$/u,
  /^(?:好的|好|当然|没问题)?[，,\s]*(?:以下是|下面是|这是|这是改写后的|改写如下|已按)[^\n]{0,60}[:：]?\s*$/u,
  /^(?:here(?:'s| is)|below is|sure|certainly|of course|i(?:'ve| have) rewritten)[^\n]{0,80}$/iu,
];

const CLOSERS = [
  /^(?:希望(?:这|以上|这个|对你)|如需|如果需要|如果还想|有任何|欢迎(?:随时)?)[^\n]{0,100}$/u,
  /^(?:hope this|let me know|feel free|i hope)[^\n]{0,120}$/iu,
];

const PLACEHOLDER_PATTERNS = [
  /<[^<>\n]{2,40}>/gu,
  /【[^】\n]{1,20}】/gu,
  /(?:待补充|待填写|待确认|请补充|请填写|TBD|TODO)/gu,
  /\bxxx+\b/giu,
];

/** A real HTML tag is not a placeholder. */
const HTML_TAG_RE = /^<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>$/u;

const FACT_PATTERNS = [
  /https?:\/\/[^\s"'<>，。；）)]+/gu,
  /(?:^|[\s("'`])((?:~?\/|\.{1,2}\/)[\w.\-@/]{2,})/gu,
  /\b[A-Za-z]:\\[^\s"'<>]+/gu,
  /\bv?\d+\.\d+(?:\.\d+)?\b/gu,
  /\b[\w\-]+\.(?:md|txt|pdf|docx?|xlsx?|csv|json|ya?ml|tsx?|jsx?|py|sh|png|jpe?g|svg|zip|html?|css|toml)\b/giu,
  /`[^`\n]{1,60}`/gu,
  /\b\d{1,2}月\d{1,2}[日号]/gu,
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/gu,
];

/** Remove presentation noise around a rewritten prompt. */
function normalizeOutput(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(/\r\n?/gu, '\n').trim();
  if (text.length === 0) return '';

  const fenced = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/u.exec(text);
  if (fenced !== null) text = fenced[1].trim();

  const lines = text.split('\n');
  let head = 0;
  let tail = lines.length;
  while (head < Math.min(2, tail) && LEAD_INS.some((re) => re.test(lines[head].trim()))) head += 1;
  while (tail - 1 > head && CLOSERS.some((re) => re.test(lines[tail - 1].trim()))) tail -= 1;
  return lines.slice(head, tail).join('\n')
    .split('\n').map((line) => line.replace(/\s+$/u, '')).join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function extractFacts(text) {
  const facts = new Set();
  if (typeof text !== 'string' || text.length === 0) return facts;
  const listNumbers = new Set([...text.matchAll(/^\s*(\d+)[.)、]\s+/gmu)].map((match) => match[1]));
  const body = text.replace(/第\s*(\d+)\s*(?:部分|项|步|条|节)|\b(?:step|section|item|point)\s+(\d+)\b/giu,
    (whole, cn, en) => (listNumbers.has(cn ?? en) ? '' : whole))
    .replace(/^\s*(?:[-*•]|\d+[.)、])\s+/gmu, '');
  for (const pattern of FACT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of body.matchAll(pattern)) {
      const value = Array.isArray(match) ? match[1] ?? match[0] : match[0];
      const normalized = String(value ?? '').trim().replace(/[.,;:]+$/u, '');
      if (normalized.length > 0) facts.add(normalized);
    }
  }
  return facts;
}

function findPlaceholders(text) {
  const found = new Set();
  for (const pattern of PLACEHOLDER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const token = String(match[0]);
      if (token.startsWith('<') && HTML_TAG_RE.test(token)) continue;
      found.add(token);
    }
  }
  return [...found];
}

/** Comparison key for progress checks; punctuation-only edits earn no progress. */
function normalizedText(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function proseUnits(text) {
  return String(text ?? '').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, '')
    .replace(/^\s*>.*$/gmu, '').replace(/`[^`\n]*`|“[^”]*”|「[^」]*」|"[^"\n]*"/gu, '')
    .split(/[。！？!?;；\n]|\.(?=\s|$)/u)
    .map((x) => normalizedText(x.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/u, '')))
    .filter((x) => x.length >= 8);
}

function similar(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 12) return false;
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.85) return false;
  const grams = (s) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const left = grams(a);
  const right = grams(b);
  const overlap = [...left].filter((x) => right.has(x)).length;
  return overlap / (left.size + right.size - overlap) >= 0.88;
}

function findRepetition(text, source = '') {
  if (/保留.{0,8}重复|重复.{0,12}[次遍]|repeat.{0,15}\btimes\b|verbatim/iu.test(source)) return [];
  const units = proseUnits(text);
  const original = proseUnits(source);
  const found = [];
  for (const unit of units) {
    for (const match of unit.matchAll(/([\p{L}\p{N}]{8,160}?)\1+/gu)) {
      if (!normalizedText(source).includes(match[0])) found.push(match[1]);
    }
  }
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const count = units.slice(0, i + 1).filter((x) => similar(x, unit)).length;
    const allowed = Math.max(1, original.filter((x) => similar(x, unit)).length);
    if (count > allowed) found.push(unit);
  }
  return [...new Set(found)];
}

/**
 * Check one rewritten segment against everything the draft and the user's
 * answers already established. Returns violation codes plus the detail the
 * repair round needs.
 */
function checkSegment(input) {
  const codes = [];
  const sources = `${input.source}\n${input.facts || ''}`;
  const sourceFacts = extractFacts(sources);
  const invented = [...extractFacts(input.text)].filter((fact) => !sourceFacts.has(fact) && !sources.includes(fact));
  if (invented.length > 0) codes.push(`invented:${invented.length}`);
  const placeholders = findPlaceholders(input.text).filter((token) => !sources.includes(token));
  if (placeholders.length > 0) codes.push('placeholder');
  if (findRepetition(input.text, sources).length) codes.push('repetition');
  if (input.maxOutputChars && input.text.length > input.maxOutputChars) codes.push('output-too-long');
  return { codes, invented, placeholders };
}

function repairLines(verdict) {
  const lines = [];
  if (verdict.invented.length > 0) {
    lines.push(`不得出现草稿里没有的具体值，请删掉或改回原文：${verdict.invented.slice(0, 8).join('、')}`);
  }
  if (verdict.codes.includes('placeholder')) lines.push('不要留占位符（<...>、【...】、待补充、TBD），要么写实际内容，要么不提。');
  if (verdict.codes.includes('repetition')) lines.push('不要重复同一句话或多段雷同的注意事项。');
  if (verdict.codes.includes('output-too-long')) lines.push('总长度超出上限，请压缩。');
  return lines;
}

// ---------------------------------------------------------------------------
// Progress for one in-flight optimization
// ---------------------------------------------------------------------------

// The composer button polls this while a run is in flight: two model rounds can
// take a minute, and a spinner with no words looks the same as a hang. The host
// keeps the latest phase plus the tail of the generated text; nothing is stored
// on disk and entries expire on their own.
const RUNS = new Map();
const RUN_KEEP_MS = 120000;

function runIdOf(rawInput) {
  const match = /"runId"\s*:\s*"([A-Za-z0-9_-]{1,64})"/u.exec(String(rawInput == null ? '' : rawInput));
  return match ? match[1] : '';
}

function pruneRuns(now) {
  const stamp = now == null ? Date.now() : now;
  for (const [id, run] of RUNS) {
    if (stamp - run.updatedAt > RUN_KEEP_MS) RUNS.delete(id);
  }
}

function beginRun(runId) {
  pruneRuns();
  if (!runId) return null;
  const run = { phase: 'plan', text: '', done: false, error: '', startedAt: Date.now(), updatedAt: Date.now() };
  RUNS.set(runId, run);
  return run;
}

function notePhase(run, phase) {
  if (!run) return;
  run.phase = phase;
  run.updatedAt = Date.now();
}

function noteDelta(run, text) {
  if (!run || typeof text !== 'string' || text === '') return;
  run.text = (run.text + text).slice(-20000);
  run.updatedAt = Date.now();
}

function finishRun(run, error) {
  if (!run) return;
  run.done = true;
  run.error = typeof error === 'string' ? error.slice(0, 400) : '';
  run.updatedAt = Date.now();
}

function readRun(runId) {
  const run = RUNS.get(String(runId || ''));
  if (!run) return null;
  return {
    phase: run.phase,
    chars: run.text.length,
    tail: run.text.slice(-600),
    done: run.done,
    error: run.error,
    elapsed: Math.max(0, Math.round((Date.now() - run.startedAt) / 1000)),
  };
}

// ---------------------------------------------------------------------------
// Model calls
// ---------------------------------------------------------------------------

/** Drain one stream request into its concatenated text. */
async function drainStream(llm, request, onDelta) {
  let output = '';
  const stream = llm.stream(request);
  for await (const chunk of stream) {
    if (!chunk) continue;
    if (chunk.type === 'text-delta') {
      output += chunk.text || '';
      if (typeof onDelta === 'function' && chunk.text) onDelta(chunk.text);
    } else if (chunk.type === 'finish') {
      const kind = chunk.reason && chunk.reason.kind;
      if (kind === 'error') {
        const message = chunk.reason.failure && chunk.reason.failure.message;
        throw new Error(message || '模型调用失败');
      }
      if (kind === 'aborted') throw new Error('已取消');
    }
  }
  return output;
}

/**
 * Gateways that only speak the older OpenAI shape reject the `developer` role a
 * reasoning model uses for its system prompt. DSH's own fix is the `compat`
 * block on the provider route; this retry keeps the button working on a route
 * nobody has corrected yet, by carrying the prompt as a system message.
 */
function rejectsDeveloperRole(error) {
  const message = error && error.message ? String(error.message) : '';
  return /developer is not one of|supportsDeveloperRole/iu.test(message);
}

async function complete(ctx, invocation, system, content, options) {
  const opts = options || {};
  const llm = ctx.get('llm');
  const defaultModel = ctx.get('agentDefaultModel');
  const selection = defaultModel && typeof defaultModel.currentSelection === 'function'
    ? defaultModel.currentSelection()
    : undefined;
  const provider = (opts.override && opts.override.provider) || (selection && selection.provider);
  const model = (opts.override && opts.override.model) || (selection && selection.model);
  if (!provider || !model) throw new Error('没有找到可用的模型');

  const request = {
    provider,
    model,
    temperature: opts.temperature == null ? 0.3 : opts.temperature,
    maxTokens: opts.maxTokens || 4096,
    signal: invocation && invocation.signal,
    sessionId: invocation && invocation.agent && invocation.agent.id,
  };
  const userMessage = { role: 'user', content: [{ type: 'text', text: content }] };

  try {
    return await drainStream(llm, { ...request, system, messages: [userMessage] }, opts.onDelta);
  } catch (error) {
    if (!system || !rejectsDeveloperRole(error)) throw error;
    const systemMessage = { role: 'system', content: [{ type: 'text', text: system }] };
    try {
      return await drainStream(llm, { ...request, messages: [systemMessage, userMessage] }, opts.onDelta);
    } catch (fallbackError) {
      // Report the original rejection: it names the real cause.
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Stage one: the gap plan
// ---------------------------------------------------------------------------

function sanitizePlan(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : null;
  if (!parsed) return null;
  const decision = ['ask', 'rewrite', 'unchanged'].includes(parsed.decision) ? parsed.decision : 'rewrite';
  const strings = (value) => (Array.isArray(value) ? value : [])
    .filter((x) => typeof x === 'string' && x.trim())
    .slice(0, 16)
    .map((x) => x.trim().slice(0, 400));
  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .filter((g) => g && typeof g.id === 'string' && g.id.trim()
      && typeof g.gap === 'string' && g.gap.trim()
      && typeof g.action === 'string' && g.action.trim())
    .slice(0, 8)
    .map((g) => ({ id: g.id.trim().slice(0, 40), gap: g.gap.trim().slice(0, 400), action: g.action.trim().slice(0, 400) }));
  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter((q) => q && typeof q.q === 'string' && q.q.trim())
    .slice(0, 2)
    .map((q) => {
      const question = { q: q.q.trim().slice(0, 240) };
      if (typeof q.why === 'string' && q.why.trim()) question.why = q.why.trim().slice(0, 240);
      const options = (Array.isArray(q.options) ? q.options : [])
        .filter((o) => typeof o === 'string' && o.trim())
        .map((o) => o.trim().slice(0, 60))
        .slice(0, 4);
      if (options.length > 0) question.options = options;
      return question;
    });
  return {
    decision,
    goal: typeof parsed.goal === 'string' ? parsed.goal.trim().slice(0, 500) : '',
    confirmedFacts: strings(parsed.confirmedFacts),
    restrictions: strings(parsed.restrictions),
    gaps,
    questions,
    reason: typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 500) : '',
  };
}

function planIsUsable(plan) {
  if (!plan) return false;
  if (plan.decision === 'rewrite' && plan.gaps.length === 0) return false;
  if (plan.decision === 'ask' && plan.questions.length === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

async function optimize(ctx, invocation) {
  // The wrapper exists only so every exit path (success, error, thrown) marks
  // the run finished; the work itself lives in optimizeRun.
  const run = beginRun(runIdOf(invocation && invocation.rawInput));
  let outcome = '';
  try {
    const result = await optimizeRun(ctx, invocation, {
      phase: (name) => notePhase(run, name),
      delta: (text) => noteDelta(run, text),
    });
    if (result && result.kind === 'error') outcome = result.text || 'failed';
    return result;
  } catch (error) {
    finishRun(run, error && error.message ? error.message : String(error));
    throw error;
  } finally {
    if (!run || !run.done) finishRun(run, outcome);
  }
}

async function optimizeRun(ctx, invocation, progress) {
  const step = progress || { phase: () => {}, delta: () => {} };
  const payload = parsePayload(invocation && invocation.rawInput);
  if (!payload || payload.segments.length === 0) {
    return { kind: 'error', text: '没有可优化的草稿' };
  }
  if (payload.segments.every((segment) => !segment.trim())) {
    return { kind: 'error', text: '没有可优化的草稿' };
  }

  const llm = ctx.get('llm');
  if (!llm || typeof llm.stream !== 'function') {
    return { kind: 'error', text: 'LLM 服务不可用' };
  }

  // Only the user's own words are optimizable; quoted passages are context.
  const segments = payload.segments;
  const ownText = segments.filter((segment) => segment.trim() !== '').join('\n\n');
  const extraFacts = [
    ...payload.answers.map((answer) => answer.a),
    payload.notes,
    payload.revise ? payload.revise.text : '',
  ].filter(Boolean).join('\n');

  const analysisInput = JSON.stringify({
    quotes: payload.quotes,
    segments,
    userNotes: payload.notes || undefined,
    answers: payload.answers.length ? payload.answers : undefined,
    previousVersion: payload.revise ? payload.revise.text : undefined,
    revisionRequest: payload.revise ? REVISE_HINTS[payload.revise.instruction] : undefined,
    // The user already declined to answer: do not spend the round on questions
    // that will be discarded.
    questionsRefused: payload.clarificationMode === 'proceed' ? true : undefined,
  });

  step.phase('plan');
  let plan = null;
  let planWarning = '';
  try {
    const rawPlan = await complete(ctx, invocation, ANALYZE_PROMPT, analysisInput, {
      temperature: 0.2,
      maxTokens: 2048,
    });
    plan = sanitizePlan(parseObject(rawPlan));
    if (!planIsUsable(plan)) {
      // One repair round: the model answered without a usable plan, which is
      // exactly the case where a silent paraphrase would otherwise slip in.
      const repaired = await complete(ctx, invocation, ANALYZE_PROMPT,
        `${analysisInput}\n\n上一轮输出不合格，请只返回要求的 JSON 结构，并且决策必须自洽：decision=rewrite 时 gaps 至少一条（每条都要写清不补会出什么具体差错）；decision=ask 时 questions 至少一条；decision=unchanged 时 reason 要给出具体理由。\n\n上一轮输出：\n${rawPlan}`,
        { temperature: 0.2, maxTokens: 2048 });
      plan = sanitizePlan(parseObject(repaired));
    }
    if (!planIsUsable(plan)) {
      plan = null;
      planWarning = '未能生成明确的改进计划，本轮只做保守改写。';
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (message === '已取消') return { kind: 'error', text: '已取消' };
    plan = null;
    planWarning = '改进计划阶段失败，本轮只做保守改写。';
  }

  // Missing information that would materially change the instruction has to be
  // asked for, not invented. Returning the untouched draft plus the questions
  // is the honest answer; rewriting anyway is exactly the paraphrase the user
  // complained about.
  const mayAsk = payload.clarificationMode !== 'proceed'
    && payload.answers.length === 0
    && !payload.revise;
  if (plan && plan.decision === 'ask' && planIsUsable(plan) && mayAsk) {
    return {
      kind: 'success',
      text: JSON.stringify({
        parts: segments,
        changes: [],
        gaps: [],
        questions: plan.questions,
        decision: 'ask',
        reason: plan.reason,
        needsInput: true,
      }),
    };
  }

  // Stage one already judged that this draft has no execution gap worth closing.
  // Generating anyway is exactly how a paraphrase ends up replacing a draft that
  // was fine to begin with, so stop here and say so plainly. A `revise` request
  // or a supplied answer means the user asked for a change, so those bypass this.
  //
  // Note this deliberately does NOT consult `clarificationMode`: "proceed" only
  // means "stop asking me questions", it is not a demand to rewrite something
  // that needs no rewrite.
  const mayStopUnchanged = payload.answers.length === 0 && !payload.revise;
  if (plan && plan.decision === 'unchanged' && planIsUsable(plan) && mayStopUnchanged) {
    return {
      kind: 'success',
      text: JSON.stringify({
        parts: segments,
        changes: [],
        gaps: [],
        questions: [],
        decision: 'unchanged',
        reason: plan.reason,
        unchanged: true,
      }),
    };
  }

  const generationInput = JSON.stringify({
    quotes: payload.quotes,
    segments,
    improvementPlan: plan ? {
      goal: plan.goal,
      confirmedFacts: plan.confirmedFacts,
      restrictions: plan.restrictions,
      gaps: plan.gaps,
    } : undefined,
    userNotes: payload.notes || undefined,
    answers: payload.answers.length ? payload.answers : undefined,
    previousVersion: payload.revise ? payload.revise.text : undefined,
    revisionRequest: payload.revise ? REVISE_HINTS[payload.revise.instruction] : undefined,
    planUnavailable: plan ? undefined : true,
  });

  const gateInput = {
    source: `${ownText}\n${extraFacts}`,
    facts: extraFacts,
    maxOutputChars: 12000,
  };

  const evaluate = (output) => {
    const exact = parseParts(output, segments.length);
    const parts = exact || reconcileParts(output, segments);
    if (!parts) return { invalid: true, lines: ['返回的 JSON 结构不对：parts 必须是字符串数组，且条数与输入文字段一致。'] };
    if (!parts.some((part) => part.trim())) {
      return { invalid: true, lines: ['parts 全部为空，请真正写出改写结果。'] };
    }
    const violations = [];
    const lines = [];
    for (let index = 0; index < parts.length; index += 1) {
      if (segments[index].trim() === '') continue;
      const verdict = checkSegment({ ...gateInput, text: normalizeOutput(parts[index]) });
      if (verdict.codes.length > 0) {
        violations.push(index);
        for (const line of repairLines(verdict)) lines.push(`第 ${index + 1} 段：${line}`);
      }
    }
    return { parts, changes: anyChanges(output), violations, lines };
  };

  step.phase('rewrite');
  let output = '';
  try {
    output = await complete(ctx, invocation, GENERATE_PROMPT, generationInput, {
      temperature: 0.4,
      maxTokens: 8192,
      onDelta: step.delta,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return { kind: 'error', text: `优化失败：${message}` };
  }

  let evaluated = evaluate(output);
  if (evaluated.invalid || evaluated.violations.length > 0) {
    const repair = (evaluated.lines || []).join('\n');
    try {
      output = await complete(ctx, invocation, GENERATE_PROMPT,
        `${generationInput}\n\n上一轮输出有问题，请修正后重新输出完整 JSON：\n${repair}\n\n上一轮输出：\n${output}`,
        { temperature: 0.3, maxTokens: 8192, onDelta: step.delta });
      const retried = evaluate(output);
      if (!retried.invalid) evaluated = retried;
    } catch (error) {
      // Keep the first attempt when the repair round itself fails.
    }
  }
  if (evaluated.invalid) {
    return { kind: 'error', text: '模型返回的格式无法识别，请重试' };
  }

  // Normalize the model's own presentation noise before handing the text back;
  // the caller rebuilds whitespace from the original segments anyway.
  const cleaned = evaluated.parts.map((part, index) => (
    segments[index].trim() === '' ? segments[index] : normalizeOutput(part) || segments[index]
  ));

  return {
    kind: 'success',
    text: JSON.stringify({
      parts: cleaned,
      changes: evaluated.changes,
      gaps: plan ? plan.gaps : [],
      questions: plan ? plan.questions : [],
      decision: plan ? plan.decision : 'rewrite',
      reason: plan ? plan.reason : '',
      warning: planWarning || undefined,
      // True when nothing meaningful changed: the caller shows it honestly
      // instead of silently replacing a draft with its own paraphrase.
      unchanged: normalizedText(cleaned.join('')) === normalizedText(ownText),
    }),
  };
}

// ---------------------------------------------------------------------------
// Framed images
// ---------------------------------------------------------------------------
// The browser half can read pixels out of a PDF page canvas but cannot write a
// file, so the crop is handed over as a data URL and lands in the temp dir. The
// path it returns is what the passage quotes: the agent opens exactly the
// rectangle the user framed instead of guessing where a figure sits.

// `DSH_HOME` is where every other DSH-side artefact lives; falling back to
// `~/.dsh` keeps web and desktop builds pointing at the same folder.
function dshHome() {
  const configured = String(process.env.DSH_HOME || '').trim();
  if (configured) return configured;
  return path.join(os.homedir(), '.dsh');
}

const CROP_DIR = path.join(dshHome(), 'sidebar-quote', 'crops');
const CROP_MAX_BYTES = 6 * 1024 * 1024;
// A crop is quoted by path, so deleting it while the draft still exists breaks
// the reference. A week is long past the point where a draft is still in play.
const CROP_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

function pruneCrops(dir, now = Date.now()) {
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (error) {
    return 0;
  }
  for (const entry of entries) {
    if (!/\.jpg$/iu.test(entry)) continue;
    const file = path.join(dir, entry);
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && now - stat.mtimeMs > CROP_KEEP_MS) {
        fs.unlinkSync(file);
        removed += 1;
      }
    } catch (error) {
      // A locked or already-deleted file is not worth failing the save over.
    }
  }
  return removed;
}

function parseCropPayload(rawInput) {
  const raw = String(rawInput == null ? '' : rawInput).trim();
  if (!raw) return null;
  const candidates = [raw];
  if (raw.indexOf('%') >= 0) {
    try {
      candidates.push(decodeURIComponent(raw));
    } catch (error) {
      // A bare percent sign is not an encoding; keep the raw candidate.
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && typeof parsed.dataUrl === 'string') return parsed;
    } catch (error) {
      // Try the next candidate.
    }
  }
  return null;
}

function cropSlug(source, area) {
  const base = String(source || '')
    .split(/[\\/]/u)
    .pop()
    .replace(/\.[a-z0-9]+$/iu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 32);
  const percent = (value) => (Number.isFinite(value) ? Math.round(value * 100) : 0);
  const start = area && area.start ? area.start : null;
  const end = area && area.end ? area.end : null;
  const box = start && end
    ? `-x${percent(Math.min(start.x, end.x))}-${percent(Math.min(start.y, end.y))}-${percent(Math.max(start.x, end.x))}-${percent(Math.max(start.y, end.y))}`
    : '';
  return `${base || 'picture'}${box}`;
}

function saveCrop(payload) {
  if (!payload) return { kind: 'error', text: '截图数据无法识别' };
  const dataUrl = String(payload.dataUrl || '');
  const marker = 'base64,';
  const at = dataUrl.indexOf(marker);
  if (at < 0) return { kind: 'error', text: '截图数据无法识别' };
  const base64 = dataUrl.slice(at + marker.length);
  if (!base64) return { kind: 'error', text: '截图是空的' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { kind: 'error', text: '截图是空的' };
  if (bytes.length > CROP_MAX_BYTES) return { kind: 'error', text: '截图太大，请框小一点' };

  const page = Number(payload.page) || 0;
  const slug = cropSlug(payload.source, payload.area);
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const name = `${stamp}-p${page}-${slug}.jpg`;
  try {
    fs.mkdirSync(CROP_DIR, { recursive: true });
    pruneCrops(CROP_DIR);
    const target = path.join(CROP_DIR, name);
    fs.writeFileSync(target, bytes);
    return {
      kind: 'success',
      text: JSON.stringify({ path: target, bytes: bytes.length, page }),
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return { kind: 'error', text: `截图没能写入磁盘：${message}` };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// Wait for the command registry before this row activates: without the
// declaration `apply` can run before the service exists at boot, which silently
// skipped the registration and made the button report "优化命令未注册".
export const inject = ['commands'];

export function apply(ctx) {
  try {
    const commands = ctx.commands || ctx.get('commands');
    if (!commands) return;

    const registration = () => {
      commands.register({
        name: 'optimize-prompt',
        description: '把当前输入框草稿扩写成一个可执行的提示词（由输入框旁的小鲸鱼按钮调用）',
        recordInput: false,
        handler: (invocation) => optimize(ctx, invocation),
      });
      commands.register({
        name: 'optimize-progress',
        description: '读取一次提示词优化的进度（阶段、已生成字数、尾部文本）',
        recordInput: false,
        handler: (invocation) => {
          const id = String((invocation && invocation.rawInput) || '').trim().slice(0, 128);
          const run = readRun(id);
          return { kind: 'success', text: JSON.stringify(run || { missing: true }) };
        },
      });
      commands.register({
        name: 'save-quote-crop',
        description: '把用户框选的图片区域写入临时文件，返回路径供引用使用',
        recordInput: false,
        handler: (invocation) => saveCrop(parseCropPayload(invocation && invocation.rawInput)),
      });
    };

    if (typeof ctx.effect === 'function') ctx.effect(registration);
    else registration();
  } catch (error) {
    // The UI half stays usable even when the optimiser cannot register.
    console.error('[sidebar-quote] optimize-prompt registration failed', error);
  }
}

export const __test__ = {
  optimize,
  optimizeRun,
  readRun,
  beginRun,
  pruneRuns,
  runIdOf,
  complete,
  rejectsDeveloperRole,
  saveCrop,
  pruneCrops,
  dshHome,
  parseCropPayload,
  cropSlug,
  parsePayload,
  parseParts,
  reconcileParts,
  repairControlChars,
  normalizeOutput,
  extractFacts,
  findPlaceholders,
  normalizedText,
  checkSegment,
  sanitizePlan,
  planIsUsable,
  anyChanges,
};

import { a as operationReplacement, u as scanner } from "./runtime-C7cAWZH0.js";
//#region src/options.ts
function assertText(text) {
	if (typeof text !== "string") throw new TypeError("text must be a string");
}
function resolveStrategy(options, fallback) {
	if (options !== void 0 && (options === null || typeof options !== "object" || Array.isArray(options))) throw new TypeError("options must be an object");
	const strategy = options?.strategy === void 0 ? fallback : options.strategy;
	if (strategy !== "all" && strategy !== "leftmost-first" && strategy !== "leftmost-longest" && strategy !== "longest-first") throw new TypeError(`Unknown match strategy: ${String(strategy)}`);
	return strategy;
}
function resolveBoundary(text, options) {
	if (options !== void 0 && (options === null || typeof options !== "object" || Array.isArray(options))) throw new TypeError("options must be an object");
	if (options?.wholeWord !== void 0 && typeof options.wholeWord !== "boolean") throw new TypeError("wholeWord must be a boolean");
	if (options?.locale !== void 0 && typeof options.locale !== "string") throw new TypeError("locale must be a string");
	const locales = options?.locale === void 0 ? void 0 : Intl.getCanonicalLocales(options.locale);
	if (!options?.wholeWord) return;
	const starts = /* @__PURE__ */ new Set();
	const ends = /* @__PURE__ */ new Set();
	for (const { index, segment, isWordLike } of new Intl.Segmenter(locales, { granularity: "word" }).segment(text)) if (isWordLike) {
		starts.add(index);
		ends.add(index + segment.length);
	}
	return (start, end) => starts.has(start) && ends.has(end);
}
/** Validate original offsets before selection, without slicing away word context. */
function resolveQuery(text, options, segmenter) {
	const boundary = resolveBoundary(text, options);
	if (options?.anchored !== void 0 && typeof options.anchored !== "boolean") throw new TypeError("anchored must be a boolean");
	if (options?.start === void 0 && options?.end === void 0 && !options?.anchored) return boundary;
	const start = options?.start === void 0 ? 0 : options.start;
	const end = options?.end === void 0 ? text.length : options.end;
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > text.length) throw new RangeError("range must be ordered UTF-16 offsets within the input");
	const segments = segmenter.segment(text);
	for (const offset of [start, end]) if (offset !== text.length && segments.containing(offset)?.index !== offset) throw new RangeError("range offsets must be original grapheme boundaries");
	const anchored = options?.anchored === true;
	return (from, to) => from >= start && to <= end && (!anchored || from === start) && (!boundary || boundary(from, to));
}
function assertStreamRange(options) {
	if (options && ("start" in options || "end" in options || "anchored" in options)) throw new TypeError("start, end and anchored are only supported by whole-text queries");
}
//#endregion
//#region src/stream.ts
function validateOptions(options, tokenMode) {
	resolveBoundary("", options);
	assertStreamRange(options);
	const strategy = resolveStrategy(options, tokenMode ? "leftmost-longest" : "all");
	if (strategy === "longest-first" || tokenMode && strategy === "all") throw new TypeError("strategy is not supported by this stream");
	const maxBufferLength = options?.maxBufferLength ?? options?.maxBufferedUnits ?? 1048576;
	if (maxBufferLength !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(maxBufferLength) || maxBufferLength < 1)) throw new RangeError("maxBufferLength must be a positive safe integer or Infinity");
	if (options?.filter !== void 0 && typeof options.filter?.create !== "function") throw new TypeError("filter must provide create()");
	return {
		strategy,
		maxBufferLength,
		filter: options?.filter
	};
}
/** Incremental segmentation, filtering and output accounting shared by every adapter. */
function core(matcher, options, tokenMode) {
	const { strategy, maxBufferLength, filter } = validateOptions(options, tokenMode);
	const wordSegmenter = options?.wholeWord ? new Intl.Segmenter(options.locale, { granularity: "word" }) : void 0;
	const wordStarts = /* @__PURE__ */ new Set();
	const wordEnds = /* @__PURE__ */ new Set();
	let session = scanner(matcher, strategy, wordSegmenter ? (start, end) => wordStarts.has(start) && wordEnds.has(end) : void 0);
	const segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
	const parser = filter?.create();
	let raw = "";
	let rawBase = 0;
	let rawStartsLine = true;
	let tail = "";
	let tailBase = 0;
	let classifiedEnd = 0;
	let protectedRanges = [];
	let lifecycle = "open";
	function destroy() {
		lifecycle = "destroyed";
		raw = tail = "";
		protectedRanges = [];
		wordStarts.clear();
		wordEnds.clear();
		parser?.destroy();
		session?.destroy?.();
		session = void 0;
	}
	function process(parts, final) {
		for (const part of parts) {
			if (part.protected && part.text.length) protectedRanges.push({
				start: classifiedEnd,
				end: classifiedEnd + part.text.length
			});
			tail += part.text;
			classifiedEnd += part.text.length;
		}
		const output = [];
		let settledText = tail;
		if (wordSegmenter && !final) {
			let cut = 0;
			for (let i = 0; i < tail.length; i++) {
				const code = tail.charCodeAt(i);
				if (code === 10 || code === 8232 || code === 8233 || code === 13 && i + 1 < tail.length && tail.charCodeAt(i + 1) !== 10) cut = i + 1;
			}
			settledText = tail.slice(0, cut);
		}
		const segments = Array.from(segmenter.segment(settledText));
		if (wordSegmenter) {
			for (const part of wordSegmenter.segment(settledText)) if (part.isWordLike) {
				wordStarts.add(tailBase + part.index);
				wordEnds.add(tailBase + part.index + part.segment.length);
			}
		}
		const count = final || wordSegmenter ? segments.length : Math.max(0, segments.length - 3);
		let consumed = 0;
		let range = 0;
		const hits = [];
		for (let index = 0; index < count; index++) {
			const { segment, index: offset } = segments[index];
			const start = tailBase + offset;
			const end = start + segment.length;
			while (range < protectedRanges.length && protectedRanges[range].end <= start) range++;
			const protectedText = range < protectedRanges.length && protectedRanges[range].start < end;
			for (const hit of session.feed(segment, start, segments[index + 1]?.segment, protectedText)) hits.push(hit);
			consumed = offset + segment.length;
		}
		if (final) for (const hit of session.end()) hits.push(hit);
		if (tokenMode) {
			let cursor = rawBase;
			for (const match of hits) {
				if (cursor < match.start) output.push({
					type: "text",
					text: raw.slice(cursor - rawBase, match.start - rawBase),
					start: cursor,
					end: match.start
				});
				output.push({
					type: "match",
					text: raw.slice(match.start - rawBase, match.end - rawBase),
					start: match.start,
					end: match.end,
					match
				});
				cursor = match.end;
			}
			if (cursor < session.safeOffset) output.push({
				type: "text",
				text: raw.slice(cursor - rawBase, session.safeOffset - rawBase),
				start: cursor,
				end: session.safeOffset
			});
		} else for (const hit of hits) output.push(hit);
		if (wordSegmenter) {
			for (const boundaries of [wordStarts, wordEnds]) for (const boundary of boundaries) if (boundary < session.retainOffset) boundaries.delete(boundary);
		}
		const released = session.safeOffset - rawBase;
		if (released > 0) {
			const previous = raw.charCodeAt(released - 1);
			rawStartsLine = previous === 10 || previous === 13 || previous === 8232 || previous === 8233;
		}
		raw = raw.slice(released);
		rawBase = session.safeOffset;
		tail = tail.slice(consumed);
		tailBase += consumed;
		protectedRanges = protectedRanges.filter((range) => range.end > Math.min(tailBase, rawBase));
		if (raw.length > maxBufferLength) throw new RangeError("undecided original text exceeds maxBufferLength");
		return output;
	}
	function requireOpen() {
		if (lifecycle !== "open") throw new Error(`stream is ${lifecycle}`);
	}
	return {
		write(chunk) {
			requireOpen();
			assertText(chunk);
			try {
				if (!Number.isSafeInteger(rawBase + raw.length + chunk.length)) throw new RangeError("stream offset exceeds Number.MAX_SAFE_INTEGER");
				const output = [];
				for (let offset = 0; offset < chunk.length; offset += 4096) {
					const piece = chunk.slice(offset, offset + 4096);
					raw += piece;
					const parts = parser ? parser.write(piece) : [{
						text: piece,
						protected: false
					}];
					for (const item of process(parts, false)) output.push(item);
				}
				return output;
			} catch (error) {
				destroy();
				throw error;
			}
		},
		end() {
			if (lifecycle === "ended") return [];
			requireOpen();
			try {
				const result = process(parser ? parser.write("", true) : [], true);
				destroy();
				lifecycle = "ended";
				return result;
			} catch (error) {
				destroy();
				throw error;
			}
		},
		destroy,
		preview() {
			if (lifecycle === "destroyed") throw new Error("stream is destroyed");
			const localBoundary = wordSegmenter ? resolveBoundary(raw, options) : void 0;
			const preview = scanner(matcher, strategy === "all" ? "leftmost-longest" : strategy, localBoundary ? (start, end) => (start !== rawBase || rawStartsLine || wordStarts.has(start)) && localBoundary(start - rawBase, end - rawBase) : void 0);
			const tokens = [];
			let cursor = rawBase;
			const append = (matches) => {
				for (const match of matches) {
					if (cursor < match.start) tokens.push({
						type: "text",
						text: raw.slice(cursor - rawBase, match.start - rawBase),
						start: cursor,
						end: match.start
					});
					tokens.push({
						type: "match",
						text: raw.slice(match.start - rawBase, match.end - rawBase),
						start: match.start,
						end: match.end,
						match
					});
					cursor = match.end;
				}
			};
			try {
				const segments = Array.from(segmenter.segment(raw));
				let range = 0;
				for (let index = 0; index < segments.length; index++) {
					const part = segments[index];
					const start = rawBase + part.index;
					const end = start + part.segment.length;
					while (range < protectedRanges.length && protectedRanges[range].end <= start) range++;
					const protectedText = end > classifiedEnd || range < protectedRanges.length && protectedRanges[range].start < end;
					append(preview.feed(part.segment, start, segments[index + 1]?.segment, protectedText));
				}
				append(preview.end());
			} finally {
				preview.destroy?.();
			}
			if (cursor < rawBase + raw.length) tokens.push({
				type: "text",
				text: raw.slice(cursor - rawBase),
				start: cursor,
				end: rawBase + raw.length
			});
			return {
				start: rawBase,
				text: raw,
				tokens
			};
		}
	};
}
function createMatchStream(matcher, options) {
	return core(matcher, options, false);
}
function createTokenStream(matcher, options) {
	return core(matcher, options, true);
}
function validateReplacement(replacement) {
	if (typeof replacement !== "string" && typeof replacement !== "function") throw new TypeError("replacement must be a string or function");
}
function replacementValue(value) {
	if (typeof value !== "string") throw new TypeError("replacement callback must return a string");
	return value;
}
function createReplaceStream(matcher, replacement, options) {
	validateReplacement(replacement);
	replacement = operationReplacement(replacement);
	const handle = createTokenStream(matcher, options);
	function replace(tokens) {
		try {
			return tokens.map((token) => token.type === "text" ? token.text : replacementValue(typeof replacement === "string" ? replacement : replacement(token.match, token.text)));
		} catch (error) {
			handle.destroy();
			throw error;
		}
	}
	return {
		write: (chunk) => replace(handle.write(chunk)),
		end: () => replace(handle.end()),
		destroy: () => handle.destroy()
	};
}
function* consume(source, handle) {
	try {
		for (const chunk of source) yield* handle.write(chunk);
		yield* handle.end();
	} finally {
		handle.destroy();
	}
}
function iterateChunks(matcher, source, options) {
	return consume(source, createMatchStream(matcher, options));
}
function tokenizeChunks(matcher, source, options) {
	return consume(source, createTokenStream(matcher, options));
}
function replaceChunks(matcher, source, replacement, options) {
	return consume(source, createReplaceStream(matcher, replacement, options));
}
function abortReason(signal) {
	return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}
/** Race pending sources/callbacks without retaining an abort listener after settlement. */
async function abortable(promise, signal) {
	if (!signal) return promise;
	if (signal.aborted) {
		Promise.resolve(promise).catch(() => {});
		throw abortReason(signal);
	}
	let remove = () => {};
	try {
		return await Promise.race([promise, new Promise((_resolve, reject) => {
			const abort = () => reject(abortReason(signal));
			signal.addEventListener("abort", abort, { once: true });
			remove = () => signal.removeEventListener("abort", abort);
		})]);
	} finally {
		remove();
	}
}
async function* consumeAsync(source, handle, options) {
	const step = options?.yieldEvery === void 0 ? 4096 : options.yieldEvery;
	if (!Number.isSafeInteger(step) || step < 1) {
		handle.destroy();
		throw new RangeError("yieldEvery must be a positive safe integer");
	}
	const signal = options?.signal;
	const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
	let complete = false;
	let processed = 0;
	try {
		while (true) {
			if (signal?.aborted) throw abortReason(signal);
			const next = await abortable(iterator.next(), signal);
			if (next.done) {
				complete = true;
				break;
			}
			assertText(next.value);
			for (let start = 0; start < next.value.length; start += step) {
				if (signal?.aborted) throw abortReason(signal);
				const piece = next.value.slice(start, start + step);
				for (const item of handle.write(piece)) {
					if (signal?.aborted) throw abortReason(signal);
					yield item;
				}
				processed += piece.length;
				if (processed >= step) {
					await abortable(new Promise((resolve) => setTimeout(resolve, 0)), signal);
					processed = 0;
				}
			}
		}
		for (const item of handle.end()) {
			if (signal?.aborted) throw abortReason(signal);
			yield item;
		}
	} finally {
		handle.destroy();
		if (!complete && iterator.return) {
			const closing = Promise.resolve(iterator.return());
			if (signal?.aborted) closing.catch(() => {});
			else await closing;
		}
	}
}
function iterateChunksAsync(matcher, source, options) {
	return consumeAsync(source, createMatchStream(matcher, options), options);
}
function tokenizeChunksAsync(matcher, source, options) {
	return consumeAsync(source, createTokenStream(matcher, options), options);
}
function replaceChunksAsync(matcher, source, replacement, options) {
	validateReplacement(replacement);
	replacement = operationReplacement(replacement);
	const tokens = tokenizeChunksAsync(matcher, source, options);
	return (async function* () {
		for await (const token of tokens) yield token.type === "text" ? token.text : replacementValue(await abortable(typeof replacement === "string" ? replacement : replacement(token.match, token.text), options?.signal));
	})();
}
/** Consume synchronous chunks directly into a caller-owned sink. */
function consumeChunks(matcher, source, consumer, options) {
	if (typeof consumer !== "function") throw new TypeError("consumer must be a function");
	for (const match of iterateChunks(matcher, source, options)) consumer(match);
}
/** Consume asynchronous chunks directly into a caller-owned sink. */
async function consumeChunksAsync(matcher, source, consumer, options) {
	if (typeof consumer !== "function") throw new TypeError("consumer must be a function");
	for await (const match of iterateChunksAsync(matcher, source, options)) await consumer(match);
}
function asyncSession(handle, convert, options) {
	const step = options?.yieldEvery === void 0 ? 4096 : options.yieldEvery;
	if (!Number.isSafeInteger(step) || step < 1) {
		handle.destroy();
		throw new RangeError("yieldEvery must be a positive safe integer");
	}
	const controller = new AbortController();
	const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	let busy = false;
	const destroy = () => {
		controller.abort();
		handle.destroy();
	};
	async function run(chunk, final) {
		if (busy) throw new Error("await the pending stream operation before writing or ending");
		busy = true;
		try {
			if (signal.aborted) throw abortReason(signal);
			const result = [];
			async function append(items) {
				for (const item of items) {
					if (signal.aborted) throw abortReason(signal);
					result.push(await abortable(convert(item), signal));
				}
			}
			if (final) await append(handle.end());
			else {
				assertText(chunk);
				const input = chunk;
				if (input.length === 0) await append(handle.write(""));
				for (let start = 0; start < input.length; start += step) {
					if (signal.aborted) throw abortReason(signal);
					await append(handle.write(input.slice(start, start + step)));
					await abortable(new Promise((resolve) => setTimeout(resolve, 0)), signal);
				}
			}
			return result;
		} catch (error) {
			destroy();
			throw error;
		} finally {
			busy = false;
		}
	}
	return {
		write: (chunk) => run(chunk, false),
		end: () => run(void 0, true),
		destroy
	};
}
function createMatchStreamAsync(matcher, options) {
	return asyncSession(createMatchStream(matcher, options), (item) => item, options);
}
function createTokenStreamAsync(matcher, options) {
	return asyncSession(createTokenStream(matcher, options), (item) => item, options);
}
function createReplaceStreamAsync(matcher, replacement, options) {
	validateReplacement(replacement);
	replacement = operationReplacement(replacement);
	return asyncSession(createTokenStream(matcher, options), async (token) => token.type === "text" ? token.text : replacementValue(await (typeof replacement === "string" ? replacement : replacement(token.match, token.text))), options);
}
//#endregion
export { resolveBoundary as _, createReplaceStream as a, createTokenStreamAsync as c, replaceChunks as d, replaceChunksAsync as f, assertText as g, assertStreamRange as h, createMatchStreamAsync as i, iterateChunks as l, tokenizeChunksAsync as m, consumeChunksAsync as n, createReplaceStreamAsync as o, tokenizeChunks as p, createMatchStream as r, createTokenStream as s, consumeChunks as t, iterateChunksAsync as u, resolveQuery as v, resolveStrategy as y };

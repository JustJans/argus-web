import { a as operationReplacement, c as resolveCharacterBoundary, d as selectLongest, f as advanceCompact, h as graphemeRuns, i as getProfile, l as scanText, m as buildAutomaton, n as createScanner, o as registerScanner, p as asciiPrefix, t as compactBackend } from "./runtime-C7cAWZH0.js";
import { _ as resolveBoundary, g as assertText, h as assertStreamRange, r as createMatchStream, v as resolveQuery, y as resolveStrategy } from "./stream-DfJ0Q1nW.js";
//#region src/legacy-stream.ts
/** Internal stream session; no automaton tables escape through its public facade. */
function createStream(table, patterns, lengths, maxLength, strategy, maxBufferedUnits, wordSegmenter) {
	const segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
	let pending = "";
	let offset = 0;
	let state = 0;
	let position = 0;
	let cursor = 0;
	let closed = false;
	const candidates = /* @__PURE__ */ new Map();
	const wordStarts = /* @__PURE__ */ new Set();
	let maxUnits = 0;
	if (wordSegmenter) for (const { pattern } of patterns) maxUnits = Math.max(maxUnits, pattern.length);
	function assertOpen() {
		if (closed) throw new Error("Stream is finished or cancelled");
	}
	function match(patternIndex, start, end) {
		const { pattern, data } = patterns[patternIndex];
		return {
			pattern,
			patternIndex,
			start,
			end,
			data
		};
	}
	function settle(until, result) {
		while (cursor <= until) {
			const candidate = candidates.get(cursor);
			if (candidate) {
				const next = cursor + lengths[candidate.patternIndex];
				for (; cursor < next; cursor++) candidates.delete(cursor);
				result.push(match(candidate.patternIndex, candidate.start, candidate.end));
			} else cursor++;
		}
	}
	function consume(text, result) {
		const wordEnds = /* @__PURE__ */ new Set();
		if (wordSegmenter) {
			for (const part of wordSegmenter.segment(text)) if (part.isWordLike) {
				wordStarts.add(offset + part.index);
				wordEnds.add(offset + part.index + part.segment.length);
			}
		}
		for (const { segment, index } of segmenter.segment(text)) {
			state = advanceCompact(table, state, segment);
			position++;
			const end = offset + index + segment.length;
			for (let output = state; output !== -1; output = table.outputs[output]) {
				const from = table.terminals[output];
				const to = strategy === "all" ? table.terminals[output + 1] : Math.min(from + 1, table.terminals[output + 1]);
				for (let terminal = from; terminal < to; terminal++) {
					const patternIndex = table.patterns[terminal];
					const start = end - patterns[patternIndex].pattern.length;
					if (wordSegmenter && (!wordStarts.has(start) || !wordEnds.has(end))) continue;
					if (strategy === "all") {
						result.push(match(patternIndex, start, end));
						continue;
					}
					const at = position - lengths[patternIndex];
					if (at < cursor) continue;
					const previous = candidates.get(at);
					if (!previous || (strategy === "leftmost-first" ? patternIndex < previous.patternIndex : end > previous.end || end === previous.end && patternIndex < previous.patternIndex)) candidates.set(at, {
						patternIndex,
						start,
						end
					});
				}
			}
			if (strategy !== "all") settle(position - maxLength, result);
		}
		offset += text.length;
		for (const start of wordStarts) if (start < offset - maxUnits) wordStarts.delete(start);
	}
	function cancel() {
		closed = true;
		pending = "";
		candidates.clear();
		wordStarts.clear();
	}
	return {
		write(chunk) {
			assertOpen();
			if (typeof chunk !== "string") throw new TypeError("chunk must be a string");
			if (!Number.isSafeInteger(offset + pending.length + chunk.length)) {
				cancel();
				throw new RangeError("stream offset exceeds Number.MAX_SAFE_INTEGER");
			}
			const text = pending + chunk;
			let cut = 0;
			if (wordSegmenter) for (let index = 0; index < text.length; index++) {
				const code = text.charCodeAt(index);
				if (code === 10 || code === 8232 || code === 8233 || code === 13 && index + 1 < text.length && text.charCodeAt(index + 1) !== 10) cut = index + 1;
			}
			else {
				let previous = 0;
				for (const { index } of segmenter.segment(text)) {
					previous = cut;
					cut = index;
				}
				const last = text.charCodeAt(text.length - 1);
				if (last >= 55296 && last <= 56319) cut = previous;
			}
			if (text.length - cut > maxBufferedUnits) {
				cancel();
				throw new RangeError("unsettled stream tail exceeds maxBufferedUnits");
			}
			const result = [];
			consume(text.slice(0, cut), result);
			pending = text.slice(cut);
			return result;
		},
		finish() {
			assertOpen();
			const result = [];
			consume(pending, result);
			if (strategy !== "all") settle(position, result);
			cancel();
			return result;
		},
		cancel
	};
}
//#endregion
//#region src/persistence.ts
function invalid() {
	throw new TypeError("Invalid or incompatible compiled dictionary");
}
function record(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
	return value;
}
function numbers(value, min, max) {
	if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || item < min || item > max)) return invalid();
	return value;
}
/** Do not silently lose metadata through JSON's coercion or toJSON hooks. */
function assertJson(value, seen = /* @__PURE__ */ new Set()) {
	if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
	if (typeof value !== "object" || seen.has(value) || !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || typeof value.toJSON === "function" || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError("Metadata must be JSON-compatible; provide an encodeData codec");
	seen.add(value);
	for (const item of Array.isArray(value) ? value : Object.values(value)) assertJson(item, seen);
	seen.delete(value);
}
function codec(options, key) {
	if (options === void 0) return;
	const value = record(options)[key];
	if (value !== void 0 && typeof value !== "function") throw new TypeError(`${key} must be a function`);
}
function serialize(table, patterns, options) {
	codec(options, "encodeData");
	const entries = patterns.map(({ pattern, data }) => {
		if (data === void 0) return { pattern };
		const encoded = options?.encodeData ? options.encodeData(data) : data;
		assertJson(encoded);
		return {
			pattern,
			data: encoded
		};
	});
	return JSON.stringify({
		format: "modern-ahocorasick",
		version: 1,
		segmentation: "Intl.Segmenter:grapheme",
		symbols: [...table.symbols.keys()],
		edges: [...table.edges],
		labels: [...table.labels],
		targets: [...table.targets],
		failures: [...table.failures],
		outputs: [...table.outputs],
		terminals: [...table.terminals],
		patternIndices: [...table.patterns],
		patterns: entries
	});
}
function deserialize(serialized, segmenter, options) {
	codec(options, "decodeData");
	if (typeof serialized !== "string") return invalid();
	let source;
	try {
		source = record(JSON.parse(serialized));
	} catch {
		return invalid();
	}
	if (source["format"] !== "modern-ahocorasick" || source["version"] !== 1 || source["segmentation"] !== "Intl.Segmenter:grapheme") return invalid();
	if (!Array.isArray(source["symbols"]) || !source["symbols"].every((symbol) => typeof symbol === "string" && symbol.length > 0) || !Array.isArray(source["patterns"])) return invalid();
	const symbolNames = source["symbols"];
	const symbols = new Map(symbolNames.map((symbol, index) => [symbol, index]));
	if (symbols.size !== source["symbols"].length) return invalid();
	const failures = Uint32Array.from(numbers(source["failures"], 0, 4294967295));
	const size = failures.length;
	if (size === 0) return invalid();
	const table = {
		symbols,
		roots: new Uint32Array(symbols.size),
		edges: Uint32Array.from(numbers(source["edges"], 0, size - 1)),
		labels: Uint32Array.from(numbers(source["labels"], 0, symbols.size - 1)),
		targets: Uint32Array.from(numbers(source["targets"], 1, size - 1)),
		failures,
		outputs: Int32Array.from(numbers(source["outputs"], -1, size - 1)),
		terminals: Uint32Array.from(numbers(source["terminals"], 0, source["patterns"].length)),
		patterns: Uint32Array.from(numbers(source["patternIndices"], 0, source["patterns"].length - 1))
	};
	if (table.edges.length !== size + 1 || table.terminals.length !== size + 1 || table.outputs.length !== size || table.targets.length !== size - 1 || table.labels.length !== size - 1 || table.patterns.length !== source["patterns"].length || table.edges[0] !== 0 || table.edges[size] !== size - 1 || table.terminals[0] !== 0 || table.terminals[1] !== 0 || table.terminals[size] !== source["patterns"].length || failures[0] !== 0 || table.outputs[0] !== -1) return invalid();
	for (let state = 0; state < size; state++) {
		if (table.edges[state] > table.edges[state + 1] || table.terminals[state] > table.terminals[state + 1]) return invalid();
		for (let edge = table.edges[state] + 1; edge < table.edges[state + 1]; edge++) if (table.labels[edge - 1] >= table.labels[edge]) return invalid();
	}
	const parents = new Int32Array(size).fill(-1);
	const labels = new Uint32Array(size);
	const depths = new Uint32Array(size);
	const queue = [0];
	parents[0] = 0;
	for (let head = 0; head < queue.length; head++) {
		const state = queue[head];
		for (let edge = table.edges[state]; edge < table.edges[state + 1]; edge++) {
			const child = table.targets[edge];
			if (parents[child] !== -1) return invalid();
			parents[child] = state;
			labels[child] = table.labels[edge];
			depths[child] = depths[state] + 1;
			queue.push(child);
			if (state === 0) table.roots[table.labels[edge]] = child;
		}
	}
	if (queue.length !== size) return invalid();
	const counts = new Uint32Array(size);
	const terminals = new Int32Array(source["patterns"].length).fill(-1);
	for (const state of queue.slice(1)) {
		const parent = parents[state];
		const failure = parent === 0 ? 0 : advanceCompact(table, failures[parent], symbolNames[labels[state]]);
		if (failures[state] !== failure || table.outputs[state] !== (table.terminals[failure] < table.terminals[failure + 1] ? failure : table.outputs[failure])) return invalid();
		const start = table.terminals[state];
		const end = table.terminals[state + 1];
		counts[state] = end - start + counts[failure];
		for (let index = start; index < end; index++) {
			const patternIndex = table.patterns[index];
			if (terminals[patternIndex] !== -1 || index > start && table.patterns[index - 1] >= patternIndex) return invalid();
			terminals[patternIndex] = state;
		}
	}
	const lengths = new Uint32Array(source["patterns"].length);
	let maxLength = 0;
	return {
		table,
		patterns: source["patterns"].map((value, index) => {
			const entry = record(value);
			if (typeof entry["pattern"] !== "string" || entry["pattern"].length === 0 || terminals[index] === -1) return invalid();
			let state = 0;
			let depth = 0;
			for (const segments of graphemeRuns(entry["pattern"], segmenter)) for (const { segment } of segments) {
				state = advanceCompact(table, state, segment);
				depth++;
				if (depths[state] !== depth) return invalid();
			}
			if (state !== terminals[index]) return invalid();
			lengths[index] = depth;
			maxLength = Math.max(maxLength, depth);
			if (entry["data"] !== void 0) assertJson(entry["data"]);
			return {
				pattern: entry["pattern"],
				data: entry["data"] === void 0 ? void 0 : options?.decodeData ? options.decodeData(entry["data"]) : entry["data"]
			};
		}),
		lengths,
		counts,
		order: Uint32Array.from(queue.slice(1)),
		maxLength
	};
}
//#endregion
//#region src/index.ts
function checksum(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	return (hash >>> 0).toString(16).padStart(8, "0");
}
function hasDenseOutputs(counts) {
	for (let state = 0; state < counts.length; state++) if (counts[state] >= 32) return true;
	return false;
}
/** An immutable compiled dictionary for exact grapheme-cluster matching. */
var AhoCorasick = class AhoCorasick {
	#boundary;
	#profile;
	#generalScan;
	#stats;
	#backend;
	#nodes;
	#patterns;
	#maxLength;
	/** Pattern lengths in graphemes; string.length and public ranges use UTF-16. */
	#lengths;
	#counts;
	#denseOutputs;
	#order;
	#segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
	constructor(patterns, options) {
		this.#boundary = resolveCharacterBoundary(options);
		this.#profile = getProfile(new.target);
		this.#generalScan = this.#boundary !== "none" || !!this.#profile.units || !!this.#profile.backend;
		if (!Array.isArray(patterns)) throw new TypeError("patterns must be an array");
		this.#patterns = Array.from(patterns, (input, index) => {
			const pattern = typeof input === "string" ? input : input !== null && typeof input === "object" && !Array.isArray(input) ? input.pattern : void 0;
			if (typeof pattern !== "string") throw new TypeError(`patterns[${index}].pattern must be a string`);
			if (pattern.length === 0) throw new RangeError(`patterns[${index}] must not be empty`);
			return {
				pattern,
				data: typeof input === "string" ? void 0 : input.data
			};
		});
		const { compact, lengths, counts, order, maxLength } = buildAutomaton(this.#patterns, this.#segmenter, this.#profile.units);
		this.#nodes = this.#profile.backend ? buildAutomaton([], this.#segmenter).compact : compact;
		this.#backend = this.#profile.backend ? this.#profile.backend(compact) : compactBackend(this.#nodes);
		this.#lengths = lengths;
		this.#counts = counts;
		this.#denseOutputs = hasDenseOutputs(counts);
		this.#order = order;
		this.#maxLength = maxLength;
		this.#stats = this.#compileStats();
		registerScanner(this, (strategy, range) => createScanner(this.#backend, this.#patterns, this.#lengths, this.#maxLength, this.#boundary, this.#profile.units, strategy, range));
	}
	#compileStats() {
		const layout = this.#backend.stats;
		const placeholderBytes = this.#profile.backend ? compactBackend(this.#nodes).stats.typedArrayBytes : 0;
		return Object.freeze({
			...layout,
			patternCount: this.#patterns.length,
			maxPatternUnits: this.#maxLength,
			unit: this.#profile.units ? "folded-codepoint" : "grapheme",
			typedArrayBytes: layout.typedArrayBytes + placeholderBytes + this.#lengths.byteLength + this.#counts.byteLength + this.#order.byteLength
		});
	}
	/** Constant-time immutable diagnostics; byte count excludes JS heap objects. */
	getStats() {
		return this.#stats;
	}
	/** Incremental matching with absolute original-text UTF-16 ranges. */
	createStream(options) {
		const strategy = resolveStrategy(options, "all");
		if (strategy === "longest-first") throw new TypeError("longest-first requires complete input");
		resolveBoundary("", options);
		assertStreamRange(options);
		const maxBufferedUnits = options?.maxBufferedUnits === void 0 ? 1048576 : options.maxBufferedUnits;
		if (!Number.isSafeInteger(maxBufferedUnits) || maxBufferedUnits < 1) throw new RangeError("maxBufferedUnits must be a positive safe integer");
		if (this.#generalScan) {
			const handle = createMatchStream(this, {
				...options,
				strategy,
				maxBufferLength: maxBufferedUnits
			});
			let closed = false;
			const assertOpen = () => {
				if (closed) throw new Error("Stream is finished or cancelled");
			};
			return {
				write: (chunk) => {
					assertOpen();
					return handle.write(chunk);
				},
				finish: () => {
					assertOpen();
					closed = true;
					return handle.end();
				},
				cancel: () => {
					closed = true;
					handle.destroy();
				}
			};
		}
		const wordSegmenter = options?.wholeWord ? new Intl.Segmenter(options.locale, { granularity: "word" }) : void 0;
		return createStream(this.#nodes, this.#patterns, this.#lengths, this.#maxLength, strategy, maxBufferedUnits, wordSegmenter);
	}
	/** Persist a versioned compiled dictionary; metadata must be JSON-compatible. */
	serialize(options) {
		if (this.#profile.units || this.#boundary !== "none") throw new TypeError("serialize supports exact matchers without constructor boundary rules");
		if (this.#profile.backend) {
			const patterns = this.#patterns.map(({ pattern, data }) => data === void 0 ? { pattern } : {
				pattern,
				data
			});
			return new AhoCorasick(patterns).serialize(options);
		}
		return serialize(this.#nodes, this.#patterns, options);
	}
	/** Wrap the compiled payload with profile and storage metadata for distribution. */
	serializeArtifact(options) {
		const payload = this.serialize(options);
		const backend = this.#profile.backend ? "compact" : this.#stats.backend;
		const stats = {
			...this.#stats,
			backend
		};
		return JSON.stringify({
			format: "modern-ahocorasick/artifact",
			version: 1,
			segmentation: "Intl.Segmenter:grapheme",
			backend,
			unit: this.#stats.unit,
			stats,
			dictionary: {
				patternCount: stats.patternCount,
				maxPatternUnits: stats.maxPatternUnits
			},
			checksum: checksum(payload),
			payload
		});
	}
	/** Load and validate scan tables without rebuilding a trie. */
	static deserialize(serialized, options) {
		const matcher = new AhoCorasick([]);
		const restored = deserialize(serialized, matcher.#segmenter, options);
		matcher.#nodes = restored.table;
		matcher.#backend = compactBackend(restored.table);
		matcher.#patterns = restored.patterns;
		matcher.#lengths = restored.lengths;
		matcher.#counts = restored.counts;
		matcher.#denseOutputs = hasDenseOutputs(restored.counts);
		matcher.#order = restored.order;
		matcher.#maxLength = restored.maxLength;
		matcher.#stats = matcher.#compileStats();
		return matcher;
	}
	/** Load a distributable artifact after validating its profile envelope. */
	static deserializeArtifact(serialized, options) {
		if (typeof serialized !== "string") throw new TypeError("serialized must be a string");
		let source;
		try {
			const parsed = JSON.parse(serialized);
			if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("record expected");
			source = parsed;
		} catch {
			throw new TypeError("Invalid compiled artifact");
		}
		if (source["format"] !== "modern-ahocorasick/artifact" || source["version"] !== 1 || source["segmentation"] !== "Intl.Segmenter:grapheme" || typeof source["payload"] !== "string" || !["compact", "double-array"].includes(String(source["backend"])) || !["grapheme", "folded-codepoint"].includes(String(source["unit"])) || source["stats"] === null || typeof source["stats"] !== "object") throw new TypeError("Invalid or incompatible compiled artifact");
		const stats = source["stats"];
		if (stats["backend"] !== source["backend"] || stats["unit"] !== source["unit"]) throw new TypeError("Invalid or incompatible compiled artifact");
		if (source["checksum"] !== void 0 && source["checksum"] !== checksum(source["payload"])) throw new TypeError("Invalid or incompatible compiled artifact");
		const matcher = AhoCorasick.deserialize(source["payload"], options);
		const actual = matcher.getStats();
		for (const key of ["patternCount", "maxPatternUnits"]) {
			if (source["dictionary"] !== void 0) {
				const dictionary = source["dictionary"];
				if (dictionary === null || typeof dictionary !== "object" || Array.isArray(dictionary) || dictionary[key] !== actual[key]) throw new TypeError("Invalid or incompatible compiled artifact");
			}
			if (stats[key] !== actual[key]) throw new TypeError("Invalid or incompatible compiled artifact");
		}
		if (actual.unit !== source["unit"]) throw new TypeError("Compiled artifact requires a different Unicode unit profile");
		return matcher;
	}
	/** All matches, optionally reduced to a non-overlapping selection. */
	search(text, options) {
		const matches = [];
		for (const match of this.iterate(text, options)) matches.push(match);
		return matches;
	}
	/** Lazily emit the chosen strategy's results. Validates arguments immediately. */
	iterate(text, options) {
		assertText(text);
		const strategy = resolveStrategy(options, "all");
		const boundary = options === void 0 ? void 0 : resolveQuery(text, options, this.#segmenter);
		return this.#iterate(text, strategy, boundary);
	}
	/** Return the first match without collecting the result array. */
	findFirst(text, options) {
		const iterator = this.iterate(text, options);
		const result = iterator.next();
		iterator.return?.();
		return result.done ? void 0 : result.value;
	}
	/** Return the first match beginning at an original grapheme boundary. */
	findAt(text, start, options) {
		if (!Number.isSafeInteger(start) || start < 0 || start > text.length) throw new RangeError("start must be a safe integer within the input");
		const iterator = this.iterate(text, {
			...options,
			start,
			anchored: true
		});
		const result = iterator.next();
		iterator.return?.();
		return result.done ? void 0 : result.value;
	}
	/** Reuse validated original-context filters; counting must not rebuild them. */
	#iterate(text, strategy, boundary) {
		if (strategy === "longest-first") return selectLongest(this.#iterate(text, "all", boundary), text, this.#segmenter);
		if (this.#generalScan) return scanText(text, this.#segmenter, createScanner(this.#backend, this.#patterns, this.#lengths, this.#maxLength, this.#boundary, this.#profile.units, strategy, boundary));
		return strategy === "all" ? this.#scan(text, boundary) : this.#select(text, strategy, boundary);
	}
	/** Count all occurrences, including overlaps and duplicate dictionary entries. */
	count(text, options) {
		assertText(text);
		const boundary = options === void 0 ? void 0 : resolveQuery(text, options, this.#segmenter);
		if (boundary || this.#generalScan) return this.#countMatches(this.#iterate(text, "all", boundary));
		if (this.#patterns.length === 0) return 0;
		let state = 0;
		let count = 0;
		const ascii = asciiPrefix(text);
		if (ascii !== void 0) {
			for (const { segment } of ascii) {
				state = advanceCompact(this.#nodes, state, segment);
				count += this.#counts[state];
				if (!Number.isSafeInteger(count)) throw new RangeError("match count exceeds Number.MAX_SAFE_INTEGER");
			}
			if (ascii.position === text.length) return count;
		}
		const suffix = ascii === void 0 ? text : text.slice(ascii.position);
		for (const { segment } of this.#segmenter.segment(suffix)) {
			state = advanceCompact(this.#nodes, state, segment);
			count += this.#counts[state];
			if (!Number.isSafeInteger(count)) throw new RangeError("match count exceeds Number.MAX_SAFE_INTEGER");
		}
		return count;
	}
	#countMatches(matches) {
		let count = 0;
		for (const _match of matches) if (!Number.isSafeInteger(++count)) throw new RangeError("match count exceeds Number.MAX_SAFE_INTEGER");
		return count;
	}
	/** Count occurrences per input pattern without enumerating individual hits. */
	countByPattern(text, options) {
		assertText(text);
		const boundary = options === void 0 ? void 0 : resolveQuery(text, options, this.#segmenter);
		const result = Array.from({ length: this.#patterns.length }).fill(0);
		if (text.length === 0 || result.length === 0) return result;
		if (boundary || this.#generalScan) {
			for (const match of this.#iterate(text, "all", boundary)) result[match.patternIndex]++;
			return result;
		}
		const visits = new Float64Array(this.#nodes.failures.length);
		let state = 0;
		for (const segments of graphemeRuns(text, this.#segmenter)) for (const { segment } of segments) {
			state = advanceCompact(this.#nodes, state, segment);
			visits[state]++;
		}
		for (let index = this.#order.length - 1; index >= 0; index--) {
			const current = this.#order[index];
			for (let index = this.#nodes.terminals[current]; index < this.#nodes.terminals[current + 1]; index++) result[this.#nodes.patterns[index]] = visits[current];
			visits[this.#nodes.failures[current]] += visits[current];
		}
		return result;
	}
	/** Stop scanning as soon as a match is found. */
	match(text, options) {
		assertText(text);
		const boundary = options === void 0 ? void 0 : resolveQuery(text, options, this.#segmenter);
		if (boundary || this.#generalScan) {
			const iterator = this.#iterate(text, "all", boundary);
			const found = !iterator.next().done;
			iterator.return?.();
			return found;
		}
		if (this.#patterns.length === 0) return false;
		let state = 0;
		const ascii = asciiPrefix(text);
		if (ascii !== void 0) {
			for (const { segment } of ascii) {
				state = advanceCompact(this.#nodes, state, segment);
				if (this.#counts[state] !== 0) return true;
			}
			if (ascii.position === text.length) return false;
		}
		const suffix = ascii === void 0 ? text : text.slice(ascii.position);
		for (const { segment } of this.#segmenter.segment(suffix)) {
			state = advanceCompact(this.#nodes, state, segment);
			if (this.#counts[state] !== 0) return true;
		}
		return false;
	}
	/** Replace selected original ranges once; replacement strings are literal. */
	replace(text, replacement, options) {
		assertText(text);
		if (typeof replacement !== "string" && typeof replacement !== "function") throw new TypeError("replacement must be a string or a function");
		const strategy = resolveStrategy(options, "leftmost-longest");
		if (strategy === "all") throw new TypeError("replace requires a non-overlapping strategy");
		replacement = operationReplacement(replacement);
		const selected = this.iterate(text, {
			...options,
			strategy
		});
		const parts = [];
		let cursor = 0;
		for (const match of selected) {
			const { start, end } = match;
			const value = typeof replacement === "string" ? replacement : replacement(match, text.slice(start, end));
			if (typeof value !== "string") throw new TypeError("replacement callback must return a string");
			parts.push(text.slice(cursor, start), value);
			cursor = end;
		}
		parts.push(text.slice(cursor));
		return parts.join("");
	}
	/** Partition original text into non-empty literal and selected match tokens. */
	tokenize(text, options) {
		assertText(text);
		const strategy = resolveStrategy(options, "leftmost-longest");
		if (strategy === "all") throw new TypeError("tokenize requires a non-overlapping strategy");
		const tokens = [];
		let cursor = 0;
		for (const match of this.iterate(text, {
			...options,
			strategy
		})) {
			if (cursor < match.start) tokens.push({
				type: "text",
				text: text.slice(cursor, match.start),
				start: cursor,
				end: match.start
			});
			tokens.push({
				type: "match",
				text: text.slice(match.start, match.end),
				start: match.start,
				end: match.end,
				match
			});
			cursor = match.end;
		}
		if (cursor < text.length) tokens.push({
			type: "text",
			text: text.slice(cursor),
			start: cursor,
			end: text.length
		});
		return tokens;
	}
	#scan(text, boundary) {
		return this.#denseOutputs ? this.#scanNative(text, boundary) : this.#scanAscii(text, boundary);
	}
	*#scanAscii(text, boundary) {
		if (this.#patterns.length === 0) return;
		let state = 0;
		let ascii = asciiPrefix(text);
		let native = ascii === void 0 ? this.#segmenter.segment(text)[Symbol.iterator]() : void 0;
		let offset = 0;
		while (true) {
			let segment;
			let end;
			if (ascii !== void 0) {
				const next = ascii.next();
				if (next.done) {
					offset = ascii.position;
					if (offset === text.length) break;
					native = this.#segmenter.segment(text.slice(offset))[Symbol.iterator]();
					ascii = void 0;
					continue;
				}
				segment = next.value.segment;
				end = next.value.index + segment.length;
			} else {
				const next = native.next();
				if (next.done) break;
				segment = next.value.segment;
				end = offset + next.value.index + segment.length;
			}
			state = advanceCompact(this.#nodes, state, segment);
			if (this.#counts[state] === 0) continue;
			for (let output = state; output !== -1; output = this.#nodes.outputs[output]) for (let terminal = this.#nodes.terminals[output]; terminal < this.#nodes.terminals[output + 1]; terminal++) {
				const patternIndex = this.#nodes.patterns[terminal];
				const { pattern, data } = this.#patterns[patternIndex];
				const start = end - pattern.length;
				if (!boundary || boundary(start, end)) yield {
					pattern,
					patternIndex,
					start,
					end,
					data
				};
			}
		}
	}
	*#scanNative(text, boundary) {
		if (this.#patterns.length === 0) return;
		let state = 0;
		for (const { segment, index } of this.#segmenter.segment(text)) {
			state = advanceCompact(this.#nodes, state, segment);
			if (this.#counts[state] === 0) continue;
			const end = index + segment.length;
			for (let output = state; output !== -1; output = this.#nodes.outputs[output]) for (let terminal = this.#nodes.terminals[output]; terminal < this.#nodes.terminals[output + 1]; terminal++) {
				const patternIndex = this.#nodes.patterns[terminal];
				const { pattern, data } = this.#patterns[patternIndex];
				const start = end - pattern.length;
				if (!boundary || boundary(start, end)) yield {
					pattern,
					patternIndex,
					start,
					end,
					data
				};
			}
		}
	}
	*#select(text, strategy, boundary) {
		const capacity = this.#maxLength;
		if (capacity === 0) return;
		const stamps = [];
		const candidates = [];
		const starts = [];
		let state = 0;
		let position = 0;
		let cursor = 0;
		let lastCandidateStart = -1;
		let earliest = -1;
		let earliestEnd = -1;
		let ascii = asciiPrefix(text);
		let native = ascii === void 0 ? this.#segmenter.segment(text)[Symbol.iterator]() : void 0;
		let offset = 0;
		while (true) {
			let segment;
			let end;
			if (ascii !== void 0) {
				const next = ascii.next();
				if (next.done) {
					offset = ascii.position;
					if (offset === text.length) break;
					native = this.#segmenter.segment(text.slice(offset))[Symbol.iterator]();
					ascii = void 0;
					continue;
				}
				segment = next.value.segment;
				end = next.value.index + segment.length;
			} else {
				const next = native.next();
				if (next.done) break;
				segment = next.value.segment;
				end = offset + next.value.index + segment.length;
			}
			state = advanceCompact(this.#nodes, state, segment);
			position++;
			if (this.#counts[state] === 0 && cursor > lastCandidateStart) continue;
			if (cursor > lastCandidateStart) cursor = Math.max(cursor, position - capacity);
			for (let output = this.#counts[state] === 0 ? -1 : state; output !== -1; output = this.#nodes.outputs[output]) {
				const terminal = this.#nodes.terminals[output];
				if (terminal === this.#nodes.terminals[output + 1]) continue;
				const patternIndex = this.#nodes.patterns[terminal];
				const pattern = this.#patterns[patternIndex];
				if (boundary && !boundary(end - pattern.pattern.length, end)) continue;
				const length = this.#lengths[patternIndex];
				const start = position - length;
				if (start < cursor || start > earliest && start < earliestEnd) continue;
				lastCandidateStart = Math.max(lastCandidateStart, start);
				const slot = start % capacity;
				const previous = candidates[slot];
				if (stamps[slot] !== start || (strategy === "leftmost-first" ? patternIndex < previous : length > this.#lengths[previous] || length === this.#lengths[previous] && patternIndex < previous)) {
					stamps[slot] = start;
					candidates[slot] = patternIndex;
					starts[slot] = end - pattern.pattern.length;
				}
				if (earliest === -1 || start < earliest) earliest = start;
				if (start === earliest) earliestEnd = start + this.#lengths[candidates[slot]];
				if (earliestEnd === position) break;
			}
			while (cursor <= position) {
				if (cursor > position - capacity && !(strategy === "leftmost-first" && earliest === cursor && candidates[cursor % capacity] === 0)) break;
				const slot = cursor % capacity;
				if (stamps[slot] === cursor) {
					const patternIndex = candidates[slot];
					const { pattern, data } = this.#patterns[patternIndex];
					const start = starts[slot];
					cursor += this.#lengths[patternIndex];
					earliest = -1;
					earliestEnd = -1;
					for (let next = cursor; next <= lastCandidateStart; next++) if (stamps[next % capacity] === next) {
						earliest = next;
						earliestEnd = next + this.#lengths[candidates[next % capacity]];
						break;
					}
					if (cursor === position) state = 0;
					yield {
						pattern,
						patternIndex,
						start,
						end: start + pattern.length,
						data
					};
				} else cursor++;
			}
		}
		while (cursor <= lastCandidateStart) {
			const slot = cursor % capacity;
			if (stamps[slot] === cursor) {
				const patternIndex = candidates[slot];
				const { pattern, data } = this.#patterns[patternIndex];
				const start = starts[slot];
				cursor += this.#lengths[patternIndex];
				yield {
					pattern,
					patternIndex,
					start,
					end: start + pattern.length,
					data
				};
			} else cursor++;
		}
	}
};
//#endregion
export { AhoCorasick as t };

//#region src/internal.ts
function advanceBuildSymbol(table, state, symbol) {
	while (state !== 0) {
		let low = table.edges[state];
		let high = table.edges[state + 1] - 1;
		while (low <= high) {
			const middle = low + high >>> 1;
			const label = table.labels[middle];
			if (label === symbol) return table.targets[middle];
			if (label < symbol) low = middle + 1;
			else high = middle - 1;
		}
		state = table.failures[state];
	}
	return table.roots[symbol];
}
function advanceCompact(table, state, segment) {
	const symbol = table.symbols.get(segment);
	if (symbol === void 0) return 0;
	while (state !== 0) {
		let low = table.edges[state];
		let high = table.edges[state + 1] - 1;
		while (low <= high) {
			const middle = low + high >>> 1;
			const label = table.labels[middle];
			if (label === symbol) return table.targets[middle];
			if (label < symbol) low = middle + 1;
			else high = middle - 1;
		}
		state = table.failures[state];
	}
	return table.roots[symbol];
}
/** Internal only: consumers must read each value before advancing the cursor. */
var AsciiCursor = class {
	text;
	position = 0;
	result;
	constructor(text) {
		this.text = text;
		this.result = {
			done: false,
			value: {
				segment: "",
				index: 0,
				input: text
			}
		};
	}
	[Symbol.iterator]() {
		return this;
	}
	next() {
		const start = this.position;
		if (start === this.text.length) return {
			done: true,
			value: void 0
		};
		const code = this.text.charCodeAt(start);
		const end = start + (code === 13 && this.text.charCodeAt(start + 1) === 10 ? 2 : 1);
		if (code > 127 || end < this.text.length && this.text.charCodeAt(end) > 127) return {
			done: true,
			value: void 0
		};
		this.position = end;
		this.result.value.segment = this.text.slice(start, end);
		this.result.value.index = start;
		return this.result;
	}
};
/**
* Bounded startup probe, never a full-text preflight. Short mixed prefixes
* cannot amortize cursor setup before an early native hit, so use the original
* string directly. Longer ASCII prefixes stop at the first unsettled boundary.
*/
function asciiPrefix(text) {
	for (let index = 0, length = Math.min(8, text.length); index < length; index++) if (text.charCodeAt(index) > 127) return;
	return new AsciiCursor(text);
}
function* asciiRuns(text, segmenter, ascii) {
	yield ascii;
	if (ascii.position < text.length) yield segmenter.segment(text.slice(ascii.position));
}
/**
* At most two runs: reusable ASCII values, then unwrapped native iteration.
* Aggregate scans only need tokens; native suffix offsets remain run-relative.
*/
function graphemeRuns(text, segmenter) {
	const ascii = asciiPrefix(text);
	if (ascii === void 0) return [segmenter.segment(text)];
	return asciiRuns(text, segmenter, ascii);
}
const blockBits = 10;
const blockSize = 1024;
const blockMask = 1023;
const branching = 4294967295;
const patternMemoLimit = 256;
function buildAutomaton(patterns, segmenter, units) {
	const symbols = /* @__PURE__ */ new Map();
	let firstCapacity = 16;
	const labelBlocks = [new Uint32Array(firstCapacity)];
	const targetBlocks = [new Uint32Array(firstCapacity)];
	const forks = [];
	const lengths = new Uint32Array(patterns.length);
	const patternMemo = patterns.length > 1 ? /* @__PURE__ */ new Map() : void 0;
	let terminalStates = new Uint32Array(patterns.length);
	let size = 1;
	let maxLength = 0;
	function append(state, segment) {
		let symbol = symbols.get(segment);
		if (symbol === void 0) {
			symbol = symbols.size;
			symbols.set(segment, symbol);
		}
		const block = state >>> blockBits;
		const offset = state & blockMask;
		const labels = labelBlocks[block];
		const targets = targetBlocks[block];
		const label = labels[offset];
		if (label === symbol + 1) return targets[offset];
		const fork = label === branching ? forks[targets[offset]] : void 0;
		if (fork) {
			const child = fork.get(symbol);
			if (child !== void 0) return child;
		}
		const child = size++;
		if (fork) fork.set(symbol, child);
		else if (label === 0) {
			labels[offset] = symbol + 1;
			targets[offset] = child;
		} else {
			const branch = /* @__PURE__ */ new Map();
			branch.set(label - 1, targets[offset]);
			branch.set(symbol, child);
			labels[offset] = branching;
			targets[offset] = forks.length;
			forks.push(branch);
		}
		if (child === firstCapacity && firstCapacity < blockSize) {
			firstCapacity *= 2;
			const grownLabels = new Uint32Array(firstCapacity);
			const grownTargets = new Uint32Array(firstCapacity);
			grownLabels.set(labelBlocks[0]);
			grownTargets.set(targetBlocks[0]);
			labelBlocks[0] = grownLabels;
			targetBlocks[0] = grownTargets;
		} else if ((child & blockMask) === 0) {
			labelBlocks.push(new Uint32Array(blockSize));
			targetBlocks.push(new Uint32Array(blockSize));
		}
		return child;
	}
	for (let index = 0; index < patterns.length; index++) {
		const { pattern } = patterns[index];
		const previous = patternMemo?.get(pattern);
		if (previous !== void 0) {
			terminalStates[index] = terminalStates[previous];
			lengths[index] = lengths[previous];
			continue;
		}
		let state = 0;
		let length = 0;
		for (const segments of graphemeRuns(pattern, segmenter)) for (const { segment } of segments) if (units) for (const unit of units(segment)) {
			state = append(state, unit);
			length++;
		}
		else {
			state = append(state, segment);
			length++;
		}
		terminalStates[index] = state;
		lengths[index] = length;
		maxLength = Math.max(maxLength, length);
		if (patternMemo && patternMemo.size < patternMemoLimit) patternMemo.set(pattern, index);
	}
	patternMemo?.clear();
	const edges = new Uint32Array(size + 1);
	const labels = new Uint32Array(size - 1);
	const targets = new Uint32Array(size - 1);
	let edge = 0;
	for (let block = 0; block < labelBlocks.length; block++) {
		const blockLabels = labelBlocks[block];
		const blockTargets = targetBlocks[block];
		const start = block * blockSize;
		const end = Math.min(size - start, blockSize);
		for (let offset = 0; offset < end; offset++) {
			edges[start + offset] = edge;
			const label = blockLabels[offset];
			if (label === branching) {
				const forkIndex = blockTargets[offset];
				const fork = forks[forkIndex];
				const sorted = Array.from(fork.keys()).sort((a, b) => a - b);
				for (const symbol of sorted) {
					labels[edge] = symbol;
					targets[edge++] = fork.get(symbol);
				}
				forks[forkIndex] = void 0;
			} else if (label !== 0) {
				labels[edge] = label - 1;
				targets[edge++] = blockTargets[offset];
			}
		}
		labelBlocks[block] = void 0;
		targetBlocks[block] = void 0;
	}
	edges[size] = edge;
	const roots = new Uint32Array(symbols.size);
	for (let edge = edges[0]; edge < edges[1]; edge++) roots[labels[edge]] = targets[edge];
	const terminals = new Uint32Array(size + 1);
	for (const state of terminalStates) terminals[state + 1]++;
	const counts = new Uint32Array(size);
	for (let state = 0; state < size; state++) {
		terminals[state + 1] += terminals[state];
		counts[state] = terminals[state];
	}
	const patternIndices = new Uint32Array(patterns.length);
	for (let index = 0; index < terminalStates.length; index++) patternIndices[counts[terminalStates[index]]++] = index;
	terminalStates = /* @__PURE__ */ new Uint32Array(0);
	const failures = new Uint32Array(size);
	const outputs = new Int32Array(size).fill(-1);
	const compact = {
		symbols,
		roots,
		edges,
		labels,
		targets,
		failures,
		outputs,
		terminals,
		patterns: patternIndices
	};
	const order = new Uint32Array(size - 1);
	let tail = 0;
	for (let edge = edges[0]; edge < edges[1]; edge++) order[tail++] = targets[edge];
	counts[0] = 0;
	for (let head = 0; head < order.length; head++) {
		const state = order[head];
		counts[state] = terminals[state + 1] - terminals[state] + counts[failures[state]];
		for (let edge = edges[state]; edge < edges[state + 1]; edge++) {
			const child = targets[edge];
			order[tail++] = child;
			const failure = advanceBuildSymbol(compact, failures[state], labels[edge]);
			failures[child] = failure;
			outputs[child] = terminals[failure] < terminals[failure + 1] ? failure : outputs[failure];
		}
	}
	return {
		compact,
		lengths,
		counts,
		order,
		maxLength
	};
}
//#endregion
//#region src/runtime.ts
const profileKey = Symbol.for("modern-ahocorasick.profile.v1");
const scannerKey = Symbol.for("modern-ahocorasick.scanner.v1");
const replacementKey = Symbol.for("modern-ahocorasick.replacement.v1");
function operationReplacement(replacement) {
	const factory = typeof replacement === "function" ? Reflect.get(replacement, replacementKey) : void 0;
	return typeof factory === "function" ? factory() : replacement;
}
function replacementFactory(factory) {
	const replacement = factory();
	Object.defineProperty(replacement, replacementKey, { value: factory });
	return replacement;
}
function defineProfile(target, profile) {
	Object.defineProperty(target, profileKey, { value: Object.freeze(profile) });
}
function getProfile(target) {
	return Reflect.get(target, profileKey) ?? {};
}
function registerScanner(target, create) {
	Object.defineProperty(target, scannerKey, { value: create });
}
function scanner(matcher, strategy, range) {
	const create = Reflect.get(matcher, scannerKey);
	if (typeof create !== "function") throw new TypeError("matcher must be a modern-ahocorasick compiled matcher");
	return create(strategy, range);
}
function resolveCharacterBoundary(options) {
	if (options !== void 0 && (options === null || typeof options !== "object" || Array.isArray(options))) throw new TypeError("options must be an object");
	const boundary = options?.boundary === void 0 ? "none" : options.boundary;
	if (typeof boundary !== "function" && ![
		"none",
		"ascii",
		"ascii-edge",
		"unicode",
		"whitespace"
	].includes(boundary)) throw new TypeError("unknown boundary rule");
	return boundary;
}
function accepts(boundary, context) {
	if (typeof boundary === "function") {
		const value = boundary(context);
		if (typeof value !== "boolean") throw new TypeError("boundary callback must return a boolean");
		return value;
	}
	const { left, right, first, last } = context;
	const asciiWord = (text) => text !== void 0 && /^[a-z0-9]/i.test(text);
	switch (boundary) {
		case "ascii": return !asciiWord(left) && !asciiWord(right);
		case "ascii-edge": return (!asciiWord(first) || !asciiWord(left)) && (!asciiWord(last) || !asciiWord(right));
		case "unicode": return (left === void 0 || !/[\p{L}\p{N}\p{M}_]/u.test(left)) && (right === void 0 || !/[\p{L}\p{N}\p{M}_]/u.test(right));
		case "whitespace": return (left === void 0 || /^\s+$/u.test(left)) && (right === void 0 || /^\s+$/u.test(right));
		default: return true;
	}
}
function compactBackend(table) {
	return {
		stats: {
			backend: "compact",
			stateCount: table.failures.length,
			transitionCount: table.targets.length,
			alphabetSize: table.symbols.size,
			typedArrayBytes: table.roots.byteLength + table.edges.byteLength + table.labels.byteLength + table.targets.byteLength + table.failures.byteLength + table.outputs.byteLength + table.terminals.byteLength + table.patterns.byteLength
		},
		advance: (state, unit) => advanceCompact(table, state, unit),
		*outputs(state) {
			for (let output = state; output !== -1; output = table.outputs[output]) for (let index = table.terminals[output]; index < table.terminals[output + 1]; index++) yield table.patterns[index];
		}
	};
}
/** A cursor owns all mutable scan state; the compiled backend is read-only. */
function createScanner(backend, patterns, lengths, maxLength, boundary, units, strategy, range) {
	if (strategy === "longest-first") throw new TypeError("longest-first requires complete input");
	let state = 0;
	let unitPosition = 0;
	let position = 0;
	let cursor = 0;
	let end = 0;
	let safeOffset = 0;
	let left;
	const capacity = maxLength + 1;
	const starts = [];
	const offsets = [0];
	const candidates = /* @__PURE__ */ new Map();
	function settle(limit) {
		const output = [];
		while (cursor <= limit) {
			const candidate = candidates.get(cursor);
			if (candidate) {
				const next = cursor + candidate.length;
				while (cursor < next) candidates.delete(cursor++);
				output.push(candidate.match);
			} else cursor++;
		}
		safeOffset = cursor >= position ? end : offsets[cursor % capacity];
		return output;
	}
	return {
		maxLength,
		get safeOffset() {
			return safeOffset;
		},
		get retainOffset() {
			return Math.min(safeOffset, offsets[Math.max(0, position - maxLength) % capacity] ?? 0);
		},
		feed(segment, start, right, protectedText = false) {
			end = start + segment.length;
			offsets[position % capacity] = start;
			offsets[(position + 1) % capacity] = end;
			if (protectedText || maxLength === 0) {
				const output = settle(position - 1);
				state = 0;
				cursor = ++position;
				safeOffset = end;
				left = segment;
				return output;
			}
			const values = units ? units(segment) : [segment];
			const hits = [];
			for (let index = 0; index < values.length; index++) {
				starts[unitPosition % capacity] = index === 0 ? {
					offset: start,
					graph: position,
					left,
					first: segment
				} : void 0;
				state = backend.advance(state, values[index]);
				unitPosition++;
				if (index !== values.length - 1) continue;
				for (const patternIndex of backend.outputs(state)) {
					const first = starts[(unitPosition - lengths[patternIndex]) % capacity];
					if (!first) continue;
					const { pattern, data } = patterns[patternIndex];
					if (range && !range(first.offset, end) || !accepts(boundary, {
						left: first.left,
						right,
						first: first.first,
						last: segment,
						pattern,
						patternIndex
					})) continue;
					const match = {
						pattern,
						patternIndex,
						data,
						start: first.offset,
						end
					};
					const length = position - first.graph + 1;
					if (strategy === "all") hits.push({
						match,
						length
					});
					else if (first.graph >= cursor) {
						const previous = candidates.get(first.graph);
						if (!previous || (strategy === "leftmost-first" ? patternIndex < previous.match.patternIndex : length > previous.length || length === previous.length && patternIndex < previous.match.patternIndex)) candidates.set(first.graph, {
							match,
							length
						});
					}
				}
			}
			position++;
			left = segment;
			if (strategy === "all") {
				cursor = position;
				safeOffset = end;
				return hits.sort((a, b) => b.length - a.length || a.match.patternIndex - b.match.patternIndex).map((hit) => hit.match);
			}
			return settle(position - maxLength);
		},
		end() {
			return settle(position - 1);
		}
	};
}
function* scanText(text, segmenter, session) {
	const iterator = segmenter.segment(text)[Symbol.iterator]();
	let current = iterator.next();
	while (!current.done) {
		const next = iterator.next();
		yield* session.feed(current.value.segment, current.value.index, next.done ? void 0 : next.value.segment);
		current = next;
	}
	yield* session.end();
}
/** Offline global length priority, using original graphemes rather than pattern length. */
function* selectLongest(matches, text, segmenter) {
	const positions = /* @__PURE__ */ new Map();
	let index = 0;
	for (const segment of segmenter.segment(text)) positions.set(segment.index, index++);
	positions.set(text.length, index);
	const candidates = Array.from(matches, (match) => ({
		match,
		length: positions.get(match.end) - positions.get(match.start)
	}));
	candidates.sort((a, b) => b.length - a.length || a.match.start - b.match.start || a.match.patternIndex - b.match.patternIndex);
	const tree = new Float64Array(index + 1);
	const prefix = (end) => {
		let total = 0;
		for (let i = end; i > 0; i -= i & -i) total += tree[i];
		return total;
	};
	const selected = [];
	for (const { match } of candidates) {
		const start = positions.get(match.start);
		const end = positions.get(match.end);
		if (prefix(end) !== prefix(start)) continue;
		selected.push(match);
		for (let point = start; point < end; point++) for (let i = point + 1; i < tree.length; i += i & -i) tree[i]++;
	}
	yield* selected.sort((a, b) => a.start - b.start);
}
//#endregion
export { operationReplacement as a, resolveCharacterBoundary as c, selectLongest as d, advanceCompact as f, graphemeRuns as h, getProfile as i, scanText as l, buildAutomaton as m, createScanner as n, registerScanner as o, asciiPrefix as p, defineProfile as r, replacementFactory as s, compactBackend as t, scanner as u };

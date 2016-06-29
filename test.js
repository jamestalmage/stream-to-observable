import {EventEmitter} from 'events';
import Observable from 'any-observable';
import ZenObservable from 'zen-observable';
import test from 'ava';
import delay from 'delay';
import arrayToEvents from 'array-to-events';
import m from './';

const isZen = Observable === ZenObservable;
const prefix = isZen ? 'zen' : 'rxjs';

function emitSequence(emitter, sequence, cb) {
	arrayToEvents(emitter, sequence, {delay: 'immediate', done: cb});
}

// avoid deprecation warnings
// TODO: https://github.com/jden/node-listenercount/pull/1
function listenerCount(emitter, eventName) {
	if (emitter.listenerCount) {
		return emitter.listenerCount(eventName);
	}
	return EventEmitter.listenerCount(emitter, eventName);
}

function deferred() {
	let res;
	let rej;
	const p = new Promise((resolve, reject) => {
		res = resolve;
		rej = reject;
	});
	p.resolve = res;
	p.reject = rej;
	return p;
}

function * expectations(...args) {
	yield * args;
}

test(`${prefix}: emits data events`, t => {
	t.plan(2);
	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['end'],
		['data', 'baz']
	]);

	const expected = expectations('foo', 'bar');

	return m(ee)
		.forEach(chunk => t.is(chunk, expected.next().value))
		.then(delay(10));
});

// RxJs and Zen-Observable do not honor the same contract - RxJs resolves to null.
if (isZen) {
	test(`${prefix}: forEach resolves with the value passed to the "end" event`, async t => {
		t.plan(1);
		const ee = new EventEmitter();

		emitSequence(ee, [
			['data', 'foo'],
			['end', 'fin']
		]);

		const result = await m(ee).forEach(() => {});
		t.is(result, 'fin');
	});
}

test(`${prefix}: forEach resolves after resolution of the awaited promise${isZen ? ', with promise value' : ''}`, async t => {
	t.plan(3);
	const ee = new EventEmitter();
	const awaited = deferred();
	const expected = expectations('a', 'b');

	emitSequence(ee,
		[
			['data', 'a'],
			['data', 'b']
		],
		() => {
			awaited.resolve('resolution');
			setImmediate(() => ee.emit('data', 'c'));
		}
	);

	const result =
		await m(ee, {endEvent: false, await: awaited})
			.forEach(chunk => t.is(chunk, expected.next().value));
	await delay(10);
	t.is(result, isZen ? 'resolution' : undefined);
});

test(`${prefix}: rejects on error events`, t => {
	t.plan(3);

	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['error', new Error('bar')],
		['data', 'baz'], // should be ignored
		['alternate-error', new Error('baz')]
	]);

	const expected = expectations('foo', 'bar');

	return t.throws(
		m(ee).forEach(chunk => t.is(chunk, expected.next().value)),
		'bar'
	).then(delay(10));
});

test(`${prefix}: change the name of the error event`, t => {
	t.plan(4);

	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['error', new Error('bar')],
		['data', 'baz'],
		['alternate-error', new Error('baz')]
	]);

	// Emitter throws uncaught exceptions for `error` events that have no registered listener.
	// We just want to prove the implementation ignores the `error` event when an alternate `errorEvent` name is given.
	// You would likely never specify an alternate `errorEvent`, if `error` events are actually going to be emitted.
	ee.on('error', () => {});

	const expected = expectations('foo', 'bar', 'baz');

	return t.throws(
		m(ee, {errorEvent: 'alternate-error'})
			.forEach(chunk => t.is(chunk, expected.next().value)),
		'baz'
	);
});

test(`${prefix}: endEvent:false, and await:undefined means the Observable will never be resolved`, t => {
	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['end'],
		['false']
	]);

	let completed = false;

	m(ee, {endEvent: false})
		.forEach(() => {})
		.then(() => {
			completed = true;
		});

	return delay(30).then(() => t.false(completed));
});

test(`${prefix}: errorEvent can be disabled`, () => {
	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['error', new Error('error')],
		['false', new Error('bar')],
		['end']
	]);

	ee.on('error', () => {});

	return m(ee, {errorEvent: false});
});

test(`${prefix}: protects against improper arguments`, t => {
	t.throws(() => m(new EventEmitter(), {errorEvent: 3}), /errorEvent/);
	t.throws(() => m(new EventEmitter(), {endEvent: 3}), /endEvent/);
	t.throws(() => m(new EventEmitter(), {dataEvent: false}), /dataEvent/);
});

test(`${prefix}: listeners are cleaned up on completion, and no further listeners will be added.`, t => {
	t.plan(5);

	const ee = new EventEmitter();
	t.is(listenerCount(ee, 'data'), 0);

	const observable = m(ee);

	observable.forEach(() => {});
	t.is(listenerCount(ee, 'data'), 1);

	observable.forEach(() => {});
	t.is(listenerCount(ee, 'data'), 2);

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['end']
	]);

	return observable
		.forEach(() => {})
		.then(() => {
			t.is(listenerCount(ee, 'data'), 0);

			ee.on = ee.once = function () {
				t.fail('should not have added more listeners');
			};

			observable.forEach(() => {});
			t.is(listenerCount(ee, 'data'), 0);

			return observable.forEach(() => {});
		});
});

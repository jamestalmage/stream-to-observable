import {EventEmitter} from 'events';
import Observable from 'any-observable';
import ZenObservable from 'zen-observable';
import test from 'ava';
import delay from 'delay';
import arrayToEvents from 'array-to-events';
import m from '.';

const isZen = Observable === ZenObservable;
const prefix = isZen ? 'zen' : 'rxjs';

function emitSequence(emitter, sequence, cb) {
	arrayToEvents(emitter, sequence, {delay: 'immediate', done: cb});
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

test(`${prefix}: emits data events`, async t => {
	t.plan(2);
	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['end'],
		['data', 'baz']
	]);

	const expected = expectations('foo', 'bar');

	await m(ee).forEach(chunk => t.is(chunk, expected.next().value));
	await delay(10);
});

test(`${prefix}: forEach resolves after resolution of the awaited promise`, async t => {
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

	const result = await m(ee, {endEvent: false, await: awaited}).forEach(chunk => t.is(chunk, expected.next().value));
	await delay(10);
	t.is(result, undefined);
});

test(`${prefix}: handles the rejected promise correctly`, async t => {
	t.plan(1);
	const ee = new EventEmitter();
	const awaited = Promise.reject(new Error('rejection'));

	await t.throws(
		m(ee, {endEvent: false, await: awaited}),
		'rejection'
	);
	// And should not emit an unhandledRejection event
});

test(`${prefix}: rejects on error events`, async t => {
	t.plan(3);

	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['error', new Error('bar')],
		['data', 'baz'], // Should be ignored
		['alternate-error', new Error('baz')]
	]);

	const expected = expectations('foo', 'bar');

	await t.throws(
		m(ee).forEach(chunk => t.is(chunk, expected.next().value)),
		'bar'
	);
	await delay(10);
});

test(`${prefix}: change the name of the error event`, async t => {
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

	await t.throws(
		m(ee, {errorEvent: 'alternate-error'})
			.forEach(chunk => t.is(chunk, expected.next().value)),
		'baz'
	);
});

test(`${prefix}: endEvent:false, and await:undefined means the Observable will never be resolved`, async t => {
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

	await delay(30);
	t.false(completed);
});

test(`${prefix}: errorEvent can be disabled`, async t => {
	const ee = new EventEmitter();

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['error', new Error('error')],
		['false', new Error('bar')],
		['end']
	]);

	ee.on('error', () => {});

	await t.notThrows(m(ee, {errorEvent: false}));
});

test(`${prefix}: protects against improper arguments`, t => {
	t.throws(() => m(new EventEmitter(), {errorEvent: 3}), /errorEvent/);
	t.throws(() => m(new EventEmitter(), {endEvent: 3}), /endEvent/);
	t.throws(() => m(new EventEmitter(), {dataEvent: false}), /dataEvent/);
});

test(`${prefix}: listeners are cleaned up on completion, and no further listeners will be added.`, async t => {
	t.plan(5);

	const ee = new EventEmitter();
	t.is(ee.listenerCount('data'), 0);

	const observable = m(ee);

	observable.forEach(() => {});
	t.is(ee.listenerCount('data'), 1);

	observable.forEach(() => {});
	t.is(ee.listenerCount('data'), 2);

	emitSequence(ee, [
		['data', 'foo'],
		['data', 'bar'],
		['end']
	]);

	await observable.forEach(() => {});

	t.is(ee.listenerCount('data'), 0);

	const onEvent = () => {
		t.fail('should not have added more listeners');
	};

	ee.on = onEvent;
	ee.once = onEvent;

	observable.forEach(() => {});
	t.is(ee.listenerCount('data'), 0);

	await observable.forEach(() => {});
});

test(`${prefix}: unsubscribing reduces the listener count`, t => {
	const ee = new EventEmitter();
	t.is(ee.listenerCount('data'), 0);

	const observable = m(ee);

	const subscription = observable.subscribe({});

	t.is(ee.listenerCount('data'), 1);

	subscription.unsubscribe();

	t.is(ee.listenerCount('data'), 0);
});

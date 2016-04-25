import {EventEmitter} from 'events';
import ZenObservable from 'zen-observable';
import {Observable as RxObservable} from 'rxjs/Rx';
import test from 'ava';
import delay from 'delay';
import create from './create';

function emitSequence(emitter, sequence) {
	var i = 0;

	function emit() {
		if (i < sequence.length) {
			var event = sequence[i];

			if (Array.isArray(event)) {
				emitter.emit(...event);
			} else if (typeof event === 'function') {
				event(emitter, i);
			} else {
				throw new Error('event is not an Array or Function:' + event);
			}

			i++;
			setImmediate(emit);
		}
	}

	setImmediate(emit);
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

function *expectations(...args) {
	yield * args;
}

function testWithImplementation(prefix, Observable) {
	const isZen = Observable === ZenObservable;
	const m = create(Observable);

	test(`${prefix}: emits data events`, t => {
		t.plan(2);
		var ee = new EventEmitter();

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
			var ee = new EventEmitter();

			emitSequence(ee, [
				['data', 'foo'],
				['end', 'fin']
			]);

			var result = await m(ee).forEach(() => {});
			t.is(result, 'fin');
		});
	}

	test(`${prefix}: forEach resolves after resolution of the awaited promise${isZen ? ', with promise value' : ''}`, async t => {
		t.plan(3);
		var ee = new EventEmitter();
		var awaited = deferred();
		var expected = expectations('a', 'b');

		emitSequence(ee, [
			['data', 'a'],
			['data', 'b'],
			() => awaited.resolve('resolution'),
			['data', 'c']
		]);

		var result =
			await m(ee, {endEvent: false, await: awaited})
				.forEach(chunk => t.is(chunk, expected.next().value));
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
}

testWithImplementation('zen-observable', ZenObservable);
testWithImplementation('rx-observable', RxObservable);

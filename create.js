'use strict';

function or(option, alternate, required) {
	var result = option === false ? false : option || alternate;

	if ((required && !result) || (result && typeof result !== 'string')) {
		throw new TypeError(alternate + 'Event must be a string.');
	}

	return result;
}

module.exports = function create(Observable) {
	return function (stream, opts) {
		opts = opts || {};

		var awaited = opts.await;
		var dataEvent = or(opts.dataEvent, 'data', true);
		var errorEvent = or(opts.errorEvent, 'error');
		var endEvent = or(opts.endEvent, 'end');

		var completion = new Promise(function (resolve, reject) {
			function onEnd(result) {
				if (awaited) {
					awaited.then(resolve);
				} else {
					resolve(result);
				}
			}

			if (endEvent) {
				stream.once(endEvent, onEnd);
			} else if (awaited) {
				onEnd();
			}

			if (errorEvent) {
				stream.once(errorEvent, reject);
			}

			if (awaited) {
				awaited.catch(reject);
			}
		});

		return new Observable(function (observer) {
			stream.on(dataEvent, function (data) {
				observer.next(data);
			});

			completion
				.catch(function (err) {
					observer.error(err);
				})
				.then(function (result) {
					observer.complete(result);
				});
		});
	};
};

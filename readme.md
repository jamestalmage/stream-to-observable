# stream-to-observable [![Build Status](https://travis-ci.org/jamestalmage/stream-to-observable.svg?branch=master)](https://travis-ci.org/jamestalmage/stream-to-observable) [![Coverage Status](https://coveralls.io/repos/github/jamestalmage/stream-to-observable/badge.svg?branch=master)](https://coveralls.io/github/jamestalmage/stream-to-observable?branch=master)

> Convert Node Streams into ECMAScript-Observables

[`Observables`](https://github.com/zenparsing/es-observable) are rapidly gaining popularity. They have much in common with Streams, in that they both represent data that arrives over time. In particular, they provide expressive methods for filtering and mutating the incoming data.

## Install

```
$ npm install --save stream-to-observable
```


## Usage

```js
const fs = require('fs');
const split = require('split');
const streamToObservable = require('stream-to-observable');

const readStream = fs
  .createReadStream('./hello-world.txt', {encoding: 'utf8'})
  .pipe(split()); // chunks a stream into individual lines

streamToObservable(readStream)
  .filter(chunk => /hello/i.test(chunk))
  .map(chunk => chunk.toUpperCase())
  .forEach(chunk => {
    console.log(chunk); // only the lines containing "hello" - and they will be capitalized
  });
```


## API

### streamToObservable(stream, [options])

#### stream

Type: [`ReadableStream`](https://nodejs.org/api/stream.html#stream_class_stream_readable)

*Note:* `stream` can technically be any [`EventEmitter`](https://nodejs.org/api/events.html#events_class_eventemitter) instance. By default the `stream-to-observable` listens to the standard Stream events (`data`, `error`, and `end`), but those are configurable via the `options` parameter. If you're using this with an actual stream, you likely won't need to pass the options object at all.

#### options

##### await

Type: `Promies`<br>

If provided, the Observable will not "complete" until `await` is resolved. If `await` is rejected, the Observable will immediately emit an `error` event and disconnect from the stream. This is mostly useful when attaching to the `stdin` or `stdout` streams of a  [`child_process`](https://nodejs.org/api/child_process.html#child_process_child_stdio). In that case, those streams will usually not emit `error` events, even if the process exits with an error code. This provides a convenient means to reject the Observable if the child process fails.

##### endEvent

Type: `String` or `false` <br>
Default: `"end"`

If you are using an `EventEmitter` or non-standard Stream, and it emits something other than `end` events, you can manipulate which event causes the Observable to be completed.

Setting this to `false` will avoid listening for any end events.

Setting this to `false` and providing an `await` Promise will cause the Observable to resolve immediately with the `await` Promise (it will not listen to any further `data` events once the Promise is resolved).

##### errorEvent

Type: `String` or `false` <br>
Default: `"error"`

If you are using an `EventEmitter` or non-standard Stream, and it emits something other than `error` events, you can manipulate which event causes the Observable to be closed with an error.

Setting this to `false` will avoid listening for any error events.

##### dataEvent

Type: `String`<br>
Default: `"data"`

If you are using an `EventEmitter` or non-standard Stream, and it emits something other than `data` events, you can manipulate which event to listen to.

## Learn about Observables:

 - Overview: https://github.com/zenparsing/es-observable
 - Formal Spec: https://zenparsing.github.io/es-observable/
 - [`rxjs` observables](http://reactivex.io/rxjs/class/es6/Observable.js~Observable.html) (Implementation)
 - [`zen-observables`](https://github.com/zenparsing/zen-observable) (Implementation)

## Transform Streams:

`data` events on the stream will be emitted as events in the Observable. Since most native streams emit `chunks` of binary data, you will likely want to use a `TransformStream` to convert those chunks of binary data into an object stream. [`split`](https://github.com/dominictarr/split) is just one popular TransformStream that splits streams into individual lines of text.

Note that using this module disables back-pressure controls on the stream. As such it should not be used where back-pressure throttling is required (i.e. high volume web servers).

## License

MIT © [James Talmage](http://github.com/jamestalmage)

'use strict';

if (typeof global.Observable === 'function') {
	module.exports = global.Observable;
} else {
	module.exports = require('zen-observable');
}

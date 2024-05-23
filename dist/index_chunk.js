'use strict';

var process$1 = require('node:process');
var os = require('node:os');
var tty = require('node:tty');
var require$$1$1 = require('fs');
var require$$3 = require('url');
var require$$1$2 = require('path');
var require$$0 = require('tty');
var require$$0$2 = require('util');
var require$$0$1 = require('os');

const ANSI_BACKGROUND_OFFSET = 10;

const wrapAnsi16 = (offset = 0) => code => `\u001B[${code + offset}m`;

const wrapAnsi256 = (offset = 0) => code => `\u001B[${38 + offset};5;${code}m`;

const wrapAnsi16m = (offset = 0) => (red, green, blue) => `\u001B[${38 + offset};2;${red};${green};${blue}m`;

const styles$1 = {
	modifier: {
		reset: [0, 0],
		// 21 isn't widely supported and 22 does the same thing
		bold: [1, 22],
		dim: [2, 22],
		italic: [3, 23],
		underline: [4, 24],
		overline: [53, 55],
		inverse: [7, 27],
		hidden: [8, 28],
		strikethrough: [9, 29],
	},
	color: {
		black: [30, 39],
		red: [31, 39],
		green: [32, 39],
		yellow: [33, 39],
		blue: [34, 39],
		magenta: [35, 39],
		cyan: [36, 39],
		white: [37, 39],

		// Bright color
		blackBright: [90, 39],
		gray: [90, 39], // Alias of `blackBright`
		grey: [90, 39], // Alias of `blackBright`
		redBright: [91, 39],
		greenBright: [92, 39],
		yellowBright: [93, 39],
		blueBright: [94, 39],
		magentaBright: [95, 39],
		cyanBright: [96, 39],
		whiteBright: [97, 39],
	},
	bgColor: {
		bgBlack: [40, 49],
		bgRed: [41, 49],
		bgGreen: [42, 49],
		bgYellow: [43, 49],
		bgBlue: [44, 49],
		bgMagenta: [45, 49],
		bgCyan: [46, 49],
		bgWhite: [47, 49],

		// Bright color
		bgBlackBright: [100, 49],
		bgGray: [100, 49], // Alias of `bgBlackBright`
		bgGrey: [100, 49], // Alias of `bgBlackBright`
		bgRedBright: [101, 49],
		bgGreenBright: [102, 49],
		bgYellowBright: [103, 49],
		bgBlueBright: [104, 49],
		bgMagentaBright: [105, 49],
		bgCyanBright: [106, 49],
		bgWhiteBright: [107, 49],
	},
};

Object.keys(styles$1.modifier);
const foregroundColorNames = Object.keys(styles$1.color);
const backgroundColorNames = Object.keys(styles$1.bgColor);
[...foregroundColorNames, ...backgroundColorNames];

function assembleStyles() {
	const codes = new Map();

	for (const [groupName, group] of Object.entries(styles$1)) {
		for (const [styleName, style] of Object.entries(group)) {
			styles$1[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`,
			};

			group[styleName] = styles$1[styleName];

			codes.set(style[0], style[1]);
		}

		Object.defineProperty(styles$1, groupName, {
			value: group,
			enumerable: false,
		});
	}

	Object.defineProperty(styles$1, 'codes', {
		value: codes,
		enumerable: false,
	});

	styles$1.color.close = '\u001B[39m';
	styles$1.bgColor.close = '\u001B[49m';

	styles$1.color.ansi = wrapAnsi16();
	styles$1.color.ansi256 = wrapAnsi256();
	styles$1.color.ansi16m = wrapAnsi16m();
	styles$1.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
	styles$1.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
	styles$1.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);

	// From https://github.com/Qix-/color-convert/blob/3f0e0d4e92e235796ccb17f6e85c72094a651f49/conversions.js
	Object.defineProperties(styles$1, {
		rgbToAnsi256: {
			value(red, green, blue) {
				// We use the extended greyscale palette here, with the exception of
				// black and white. normal palette only has 4 greyscale shades.
				if (red === green && green === blue) {
					if (red < 8) {
						return 16;
					}

					if (red > 248) {
						return 231;
					}

					return Math.round(((red - 8) / 247) * 24) + 232;
				}

				return 16
					+ (36 * Math.round(red / 255 * 5))
					+ (6 * Math.round(green / 255 * 5))
					+ Math.round(blue / 255 * 5);
			},
			enumerable: false,
		},
		hexToRgb: {
			value(hex) {
				const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
				if (!matches) {
					return [0, 0, 0];
				}

				let [colorString] = matches;

				if (colorString.length === 3) {
					colorString = [...colorString].map(character => character + character).join('');
				}

				const integer = Number.parseInt(colorString, 16);

				return [
					/* eslint-disable no-bitwise */
					(integer >> 16) & 0xFF,
					(integer >> 8) & 0xFF,
					integer & 0xFF,
					/* eslint-enable no-bitwise */
				];
			},
			enumerable: false,
		},
		hexToAnsi256: {
			value: hex => styles$1.rgbToAnsi256(...styles$1.hexToRgb(hex)),
			enumerable: false,
		},
		ansi256ToAnsi: {
			value(code) {
				if (code < 8) {
					return 30 + code;
				}

				if (code < 16) {
					return 90 + (code - 8);
				}

				let red;
				let green;
				let blue;

				if (code >= 232) {
					red = (((code - 232) * 10) + 8) / 255;
					green = red;
					blue = red;
				} else {
					code -= 16;

					const remainder = code % 36;

					red = Math.floor(code / 36) / 5;
					green = Math.floor(remainder / 6) / 5;
					blue = (remainder % 6) / 5;
				}

				const value = Math.max(red, green, blue) * 2;

				if (value === 0) {
					return 30;
				}

				// eslint-disable-next-line no-bitwise
				let result = 30 + ((Math.round(blue) << 2) | (Math.round(green) << 1) | Math.round(red));

				if (value === 2) {
					result += 60;
				}

				return result;
			},
			enumerable: false,
		},
		rgbToAnsi: {
			value: (red, green, blue) => styles$1.ansi256ToAnsi(styles$1.rgbToAnsi256(red, green, blue)),
			enumerable: false,
		},
		hexToAnsi: {
			value: hex => styles$1.ansi256ToAnsi(styles$1.hexToAnsi256(hex)),
			enumerable: false,
		},
	});

	return styles$1;
}

const ansiStyles = assembleStyles();

// From: https://github.com/sindresorhus/has-flag/blob/main/index.js
/// function hasFlag(flag, argv = globalThis.Deno?.args ?? process.argv) {
function hasFlag$1(flag, argv = globalThis.Deno ? globalThis.Deno.args : process$1.argv) {
	const prefix = flag.startsWith('-') ? '' : (flag.length === 1 ? '-' : '--');
	const position = argv.indexOf(prefix + flag);
	const terminatorPosition = argv.indexOf('--');
	return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}

const {env} = process$1;

let flagForceColor;
if (
	hasFlag$1('no-color')
	|| hasFlag$1('no-colors')
	|| hasFlag$1('color=false')
	|| hasFlag$1('color=never')
) {
	flagForceColor = 0;
} else if (
	hasFlag$1('color')
	|| hasFlag$1('colors')
	|| hasFlag$1('color=true')
	|| hasFlag$1('color=always')
) {
	flagForceColor = 1;
}

function envForceColor() {
	if ('FORCE_COLOR' in env) {
		if (env.FORCE_COLOR === 'true') {
			return 1;
		}

		if (env.FORCE_COLOR === 'false') {
			return 0;
		}

		return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
	}
}

function translateLevel(level) {
	if (level === 0) {
		return false;
	}

	return {
		level,
		hasBasic: true,
		has256: level >= 2,
		has16m: level >= 3,
	};
}

function _supportsColor(haveStream, {streamIsTTY, sniffFlags = true} = {}) {
	const noFlagForceColor = envForceColor();
	if (noFlagForceColor !== undefined) {
		flagForceColor = noFlagForceColor;
	}

	const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;

	if (forceColor === 0) {
		return 0;
	}

	if (sniffFlags) {
		if (hasFlag$1('color=16m')
			|| hasFlag$1('color=full')
			|| hasFlag$1('color=truecolor')) {
			return 3;
		}

		if (hasFlag$1('color=256')) {
			return 2;
		}
	}

	// Check for Azure DevOps pipelines.
	// Has to be above the `!streamIsTTY` check.
	if ('TF_BUILD' in env && 'AGENT_NAME' in env) {
		return 1;
	}

	if (haveStream && !streamIsTTY && forceColor === undefined) {
		return 0;
	}

	const min = forceColor || 0;

	if (env.TERM === 'dumb') {
		return min;
	}

	if (process$1.platform === 'win32') {
		// Windows 10 build 10586 is the first Windows release that supports 256 colors.
		// Windows 10 build 14931 is the first release that supports 16m/TrueColor.
		const osRelease = os.release().split('.');
		if (
			Number(osRelease[0]) >= 10
			&& Number(osRelease[2]) >= 10_586
		) {
			return Number(osRelease[2]) >= 14_931 ? 3 : 2;
		}

		return 1;
	}

	if ('CI' in env) {
		if ('GITHUB_ACTIONS' in env || 'GITEA_ACTIONS' in env) {
			return 3;
		}

		if (['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'].some(sign => sign in env) || env.CI_NAME === 'codeship') {
			return 1;
		}

		return min;
	}

	if ('TEAMCITY_VERSION' in env) {
		return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
	}

	if (env.COLORTERM === 'truecolor') {
		return 3;
	}

	if (env.TERM === 'xterm-kitty') {
		return 3;
	}

	if ('TERM_PROGRAM' in env) {
		const version = Number.parseInt((env.TERM_PROGRAM_VERSION || '').split('.')[0], 10);

		switch (env.TERM_PROGRAM) {
			case 'iTerm.app': {
				return version >= 3 ? 3 : 2;
			}

			case 'Apple_Terminal': {
				return 2;
			}
			// No default
		}
	}

	if (/-256(color)?$/i.test(env.TERM)) {
		return 2;
	}

	if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
		return 1;
	}

	if ('COLORTERM' in env) {
		return 1;
	}

	return min;
}

function createSupportsColor(stream, options = {}) {
	const level = _supportsColor(stream, {
		streamIsTTY: stream && stream.isTTY,
		...options,
	});

	return translateLevel(level);
}

const supportsColor = {
	stdout: createSupportsColor({isTTY: tty.isatty(1)}),
	stderr: createSupportsColor({isTTY: tty.isatty(2)}),
};

// TODO: When targeting Node.js 16, use `String.prototype.replaceAll`.
function stringReplaceAll(string, substring, replacer) {
	let index = string.indexOf(substring);
	if (index === -1) {
		return string;
	}

	const substringLength = substring.length;
	let endIndex = 0;
	let returnValue = '';
	do {
		returnValue += string.slice(endIndex, index) + substring + replacer;
		endIndex = index + substringLength;
		index = string.indexOf(substring, endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
	let endIndex = 0;
	let returnValue = '';
	do {
		const gotCR = string[index - 1] === '\r';
		returnValue += string.slice(endIndex, (gotCR ? index - 1 : index)) + prefix + (gotCR ? '\r\n' : '\n') + postfix;
		endIndex = index + 1;
		index = string.indexOf('\n', endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

const {stdout: stdoutColor, stderr: stderrColor} = supportsColor;

const GENERATOR = Symbol('GENERATOR');
const STYLER = Symbol('STYLER');
const IS_EMPTY = Symbol('IS_EMPTY');

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping = [
	'ansi',
	'ansi',
	'ansi256',
	'ansi16m',
];

const styles = Object.create(null);

const applyOptions = (object, options = {}) => {
	if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
		throw new Error('The `level` option should be an integer from 0 to 3');
	}

	// Detect level if not set manually
	const colorLevel = stdoutColor ? stdoutColor.level : 0;
	object.level = options.level === undefined ? colorLevel : options.level;
};

const chalkFactory = options => {
	const chalk = (...strings) => strings.join(' ');
	applyOptions(chalk, options);

	Object.setPrototypeOf(chalk, createChalk.prototype);

	return chalk;
};

function createChalk(options) {
	return chalkFactory(options);
}

Object.setPrototypeOf(createChalk.prototype, Function.prototype);

for (const [styleName, style] of Object.entries(ansiStyles)) {
	styles[styleName] = {
		get() {
			const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
			Object.defineProperty(this, styleName, {value: builder});
			return builder;
		},
	};
}

styles.visible = {
	get() {
		const builder = createBuilder(this, this[STYLER], true);
		Object.defineProperty(this, 'visible', {value: builder});
		return builder;
	},
};

const getModelAnsi = (model, level, type, ...arguments_) => {
	if (model === 'rgb') {
		if (level === 'ansi16m') {
			return ansiStyles[type].ansi16m(...arguments_);
		}

		if (level === 'ansi256') {
			return ansiStyles[type].ansi256(ansiStyles.rgbToAnsi256(...arguments_));
		}

		return ansiStyles[type].ansi(ansiStyles.rgbToAnsi(...arguments_));
	}

	if (model === 'hex') {
		return getModelAnsi('rgb', level, type, ...ansiStyles.hexToRgb(...arguments_));
	}

	return ansiStyles[type][model](...arguments_);
};

const usedModels = ['rgb', 'hex', 'ansi256'];

for (const model of usedModels) {
	styles[model] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(getModelAnsi(model, levelMapping[level], 'color', ...arguments_), ansiStyles.color.close, this[STYLER]);
				return createBuilder(this, styler, this[IS_EMPTY]);
			};
		},
	};

	const bgModel = 'bg' + model[0].toUpperCase() + model.slice(1);
	styles[bgModel] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(getModelAnsi(model, levelMapping[level], 'bgColor', ...arguments_), ansiStyles.bgColor.close, this[STYLER]);
				return createBuilder(this, styler, this[IS_EMPTY]);
			};
		},
	};
}

const proto = Object.defineProperties(() => {}, {
	...styles,
	level: {
		enumerable: true,
		get() {
			return this[GENERATOR].level;
		},
		set(level) {
			this[GENERATOR].level = level;
		},
	},
});

const createStyler = (open, close, parent) => {
	let openAll;
	let closeAll;
	if (parent === undefined) {
		openAll = open;
		closeAll = close;
	} else {
		openAll = parent.openAll + open;
		closeAll = close + parent.closeAll;
	}

	return {
		open,
		close,
		openAll,
		closeAll,
		parent,
	};
};

const createBuilder = (self, _styler, _isEmpty) => {
	// Single argument is hot path, implicit coercion is faster than anything
	// eslint-disable-next-line no-implicit-coercion
	const builder = (...arguments_) => applyStyle(builder, (arguments_.length === 1) ? ('' + arguments_[0]) : arguments_.join(' '));

	// We alter the prototype because we must return a function, but there is
	// no way to create a function with a different prototype
	Object.setPrototypeOf(builder, proto);

	builder[GENERATOR] = self;
	builder[STYLER] = _styler;
	builder[IS_EMPTY] = _isEmpty;

	return builder;
};

const applyStyle = (self, string) => {
	if (self.level <= 0 || !string) {
		return self[IS_EMPTY] ? '' : string;
	}

	let styler = self[STYLER];

	if (styler === undefined) {
		return string;
	}

	const {openAll, closeAll} = styler;
	if (string.includes('\u001B')) {
		while (styler !== undefined) {
			// Replace any instances already present with a re-opening code
			// otherwise only the part of the string until said closing code
			// will be colored, and the rest will simply be 'plain'.
			string = stringReplaceAll(string, styler.close, styler.open);

			styler = styler.parent;
		}
	}

	// We can move both next actions out of loop, because remaining actions in loop won't have
	// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
	// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
	const lfIndex = string.indexOf('\n');
	if (lfIndex !== -1) {
		string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
	}

	return openAll + string + closeAll;
};

Object.defineProperties(createChalk.prototype, styles);

const chalk = createChalk();
createChalk({level: stderrColor ? stderrColor.level : 0});

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function getAugmentedNamespace(n) {
  if (n.__esModule) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			if (this instanceof a) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

var i18n$2 = {exports: {}};

var printf$1 = {};

var createPrintf$1 = {};

var lib$1 = {};

var boolean$1 = {};

Object.defineProperty(boolean$1, "__esModule", { value: true });
boolean$1.boolean = void 0;
const boolean = function (value) {
    switch (Object.prototype.toString.call(value)) {
        case '[object String]':
            return ['true', 't', 'yes', 'y', 'on', '1'].includes(value.trim().toLowerCase());
        case '[object Number]':
            return value.valueOf() === 1;
        case '[object Boolean]':
            return value.valueOf();
        default:
            return false;
    }
};
boolean$1.boolean = boolean;

var isBooleanable$1 = {};

Object.defineProperty(isBooleanable$1, "__esModule", { value: true });
isBooleanable$1.isBooleanable = void 0;
const isBooleanable = function (value) {
    switch (Object.prototype.toString.call(value)) {
        case '[object String]':
            return [
                'true', 't', 'yes', 'y', 'on', '1',
                'false', 'f', 'no', 'n', 'off', '0'
            ].includes(value.trim().toLowerCase());
        case '[object Number]':
            return [0, 1].includes(value.valueOf());
        case '[object Boolean]':
            return true;
        default:
            return false;
    }
};
isBooleanable$1.isBooleanable = isBooleanable;

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.isBooleanable = exports.boolean = void 0;
	const boolean_1 = boolean$1;
	Object.defineProperty(exports, "boolean", { enumerable: true, get: function () { return boolean_1.boolean; } });
	const isBooleanable_1 = isBooleanable$1;
	Object.defineProperty(exports, "isBooleanable", { enumerable: true, get: function () { return isBooleanable_1.isBooleanable; } }); 
} (lib$1));

var tokenize$1 = {};

Object.defineProperty(tokenize$1, "__esModule", { value: true });
tokenize$1.tokenize = void 0;
const TokenRule = /(?:%(?<flag>([+0-]|-\+))?(?<width>\d+)?(?<position>\d+\$)?(?<precision>\.\d+)?(?<conversion>[%BCESb-iosux]))|(\\%)/g;
const tokenize = (subject) => {
    let matchResult;
    const tokens = [];
    let argumentIndex = 0;
    let lastIndex = 0;
    let lastToken = null;
    while ((matchResult = TokenRule.exec(subject)) !== null) {
        if (matchResult.index > lastIndex) {
            lastToken = {
                literal: subject.slice(lastIndex, matchResult.index),
                type: 'literal',
            };
            tokens.push(lastToken);
        }
        const match = matchResult[0];
        lastIndex = matchResult.index + match.length;
        if (match === '\\%' || match === '%%') {
            if (lastToken && lastToken.type === 'literal') {
                lastToken.literal += '%';
            }
            else {
                lastToken = {
                    literal: '%',
                    type: 'literal',
                };
                tokens.push(lastToken);
            }
        }
        else if (matchResult.groups) {
            lastToken = {
                conversion: matchResult.groups.conversion,
                flag: matchResult.groups.flag || null,
                placeholder: match,
                position: matchResult.groups.position ? Number.parseInt(matchResult.groups.position, 10) - 1 : argumentIndex++,
                precision: matchResult.groups.precision ? Number.parseInt(matchResult.groups.precision.slice(1), 10) : null,
                type: 'placeholder',
                width: matchResult.groups.width ? Number.parseInt(matchResult.groups.width, 10) : null,
            };
            tokens.push(lastToken);
        }
    }
    if (lastIndex <= subject.length - 1) {
        if (lastToken && lastToken.type === 'literal') {
            lastToken.literal += subject.slice(lastIndex);
        }
        else {
            tokens.push({
                literal: subject.slice(lastIndex),
                type: 'literal',
            });
        }
    }
    return tokens;
};
tokenize$1.tokenize = tokenize;

Object.defineProperty(createPrintf$1, "__esModule", { value: true });
createPrintf$1.createPrintf = void 0;
const boolean_1 = lib$1;
const tokenize_1 = tokenize$1;
const formatDefaultUnboundExpression = (
// @ts-expect-error unused parameter
subject, token) => {
    return token.placeholder;
};
const createPrintf = (configuration) => {
    var _a;
    const padValue = (value, width, flag) => {
        if (flag === '-') {
            return value.padEnd(width, ' ');
        }
        else if (flag === '-+') {
            return ((Number(value) >= 0 ? '+' : '') + value).padEnd(width, ' ');
        }
        else if (flag === '+') {
            return ((Number(value) >= 0 ? '+' : '') + value).padStart(width, ' ');
        }
        else if (flag === '0') {
            return value.padStart(width, '0');
        }
        else {
            return value.padStart(width, ' ');
        }
    };
    const formatUnboundExpression = (_a = configuration === null || configuration === void 0 ? void 0 : configuration.formatUnboundExpression) !== null && _a !== void 0 ? _a : formatDefaultUnboundExpression;
    const cache = {};
    // eslint-disable-next-line complexity
    return (subject, ...boundValues) => {
        let tokens = cache[subject];
        if (!tokens) {
            tokens = cache[subject] = tokenize_1.tokenize(subject);
        }
        let result = '';
        for (const token of tokens) {
            if (token.type === 'literal') {
                result += token.literal;
            }
            else {
                let boundValue = boundValues[token.position];
                if (boundValue === undefined) {
                    result += formatUnboundExpression(subject, token, boundValues);
                }
                else if (token.conversion === 'b') {
                    result += boolean_1.boolean(boundValue) ? 'true' : 'false';
                }
                else if (token.conversion === 'B') {
                    result += boolean_1.boolean(boundValue) ? 'TRUE' : 'FALSE';
                }
                else if (token.conversion === 'c') {
                    result += boundValue;
                }
                else if (token.conversion === 'C') {
                    result += String(boundValue).toUpperCase();
                }
                else if (token.conversion === 'i' || token.conversion === 'd') {
                    boundValue = String(Math.trunc(boundValue));
                    if (token.width !== null) {
                        boundValue = padValue(boundValue, token.width, token.flag);
                    }
                    result += boundValue;
                }
                else if (token.conversion === 'e') {
                    result += Number(boundValue)
                        .toExponential();
                }
                else if (token.conversion === 'E') {
                    result += Number(boundValue)
                        .toExponential()
                        .toUpperCase();
                }
                else if (token.conversion === 'f') {
                    if (token.precision !== null) {
                        boundValue = Number(boundValue).toFixed(token.precision);
                    }
                    if (token.width !== null) {
                        boundValue = padValue(String(boundValue), token.width, token.flag);
                    }
                    result += boundValue;
                }
                else if (token.conversion === 'o') {
                    result += (Number.parseInt(String(boundValue), 10) >>> 0).toString(8);
                }
                else if (token.conversion === 's') {
                    if (token.width !== null) {
                        boundValue = padValue(String(boundValue), token.width, token.flag);
                    }
                    result += boundValue;
                }
                else if (token.conversion === 'S') {
                    if (token.width !== null) {
                        boundValue = padValue(String(boundValue), token.width, token.flag);
                    }
                    result += String(boundValue).toUpperCase();
                }
                else if (token.conversion === 'u') {
                    result += Number.parseInt(String(boundValue), 10) >>> 0;
                }
                else if (token.conversion === 'x') {
                    boundValue = (Number.parseInt(String(boundValue), 10) >>> 0).toString(16);
                    if (token.width !== null) {
                        boundValue = padValue(String(boundValue), token.width, token.flag);
                    }
                    result += boundValue;
                }
                else {
                    throw new Error('Unknown format specifier.');
                }
            }
        }
        return result;
    };
};
createPrintf$1.createPrintf = createPrintf;

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.printf = exports.createPrintf = void 0;
	const createPrintf_1 = createPrintf$1;
	Object.defineProperty(exports, "createPrintf", { enumerable: true, get: function () { return createPrintf_1.createPrintf; } });
	exports.printf = createPrintf_1.createPrintf(); 
} (printf$1));

var name = "i18n";
var description = "lightweight translation module with dynamic json storage";
var version = "0.15.1";
var homepage = "http://github.com/mashpie/i18n-node";
var repository = {
	type: "git",
	url: "http://github.com/mashpie/i18n-node.git"
};
var author = "Marcus Spiegel <marcus.spiegel@gmail.com>";
var funding = {
	url: "https://github.com/sponsors/mashpie"
};
var main = "./index";
var files = [
	"i18n.js",
	"index.js",
	"SECURITY.md"
];
var keywords = [
	"template",
	"i18n",
	"l10n"
];
var directories = {
	lib: "."
};
var dependencies = {
	"@messageformat/core": "^3.0.0",
	debug: "^4.3.3",
	"fast-printf": "^1.6.9",
	"make-plural": "^7.0.0",
	"math-interval-parser": "^2.0.1",
	mustache: "^4.2.0"
};
var devDependencies = {
	async: "^3.2.3",
	"cookie-parser": "^1.4.6",
	eslint: "^8.8.0",
	"eslint-config-prettier": "^8.3.0",
	"eslint-config-standard": "^17.0.0",
	"eslint-plugin-import": "^2.25.4",
	"eslint-plugin-node": "^11.1.0",
	"eslint-plugin-prettier": "^4.0.0",
	"eslint-plugin-promise": "^6.0.0",
	"eslint-plugin-standard": "^5.0.0",
	express: "^4.17.2",
	husky: "^8.0.1",
	"lint-staged": "^12.3.2",
	mocha: "^10.0.0",
	nyc: "^15.1.0",
	prettier: "^2.5.1",
	should: "^13.2.3",
	sinon: "^14.0.0",
	yaml: "^2.1.0",
	zombie: "^6.1.4"
};
var engines = {
	node: ">=10"
};
var scripts = {
	test: "mocha --exit",
	"test-ci": "nyc mocha -- --exit",
	coverage: "nyc report --reporter=lcov"
};
var license = "MIT";
var husky = {
	hooks: {
		"pre-commit": "lint-staged"
	}
};
var require$$1 = {
	name: name,
	description: description,
	version: version,
	homepage: homepage,
	repository: repository,
	author: author,
	funding: funding,
	main: main,
	files: files,
	keywords: keywords,
	directories: directories,
	dependencies: dependencies,
	devDependencies: devDependencies,
	engines: engines,
	scripts: scripts,
	"lint-staged": {
	"*.js": "eslint --cache --fix"
},
	license: license,
	husky: husky
};

var src = {exports: {}};

var browser = {exports: {}};

/**
 * Helpers.
 */

var ms;
var hasRequiredMs;

function requireMs () {
	if (hasRequiredMs) return ms;
	hasRequiredMs = 1;
	var s = 1000;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;

	/**
	 * Parse or format the given `val`.
	 *
	 * Options:
	 *
	 *  - `long` verbose formatting [false]
	 *
	 * @param {String|Number} val
	 * @param {Object} [options]
	 * @throws {Error} throw an error if val is not a non-empty string or a number
	 * @return {String|Number}
	 * @api public
	 */

	ms = function(val, options) {
	  options = options || {};
	  var type = typeof val;
	  if (type === 'string' && val.length > 0) {
	    return parse(val);
	  } else if (type === 'number' && isFinite(val)) {
	    return options.long ? fmtLong(val) : fmtShort(val);
	  }
	  throw new Error(
	    'val is not a non-empty string or a valid number. val=' +
	      JSON.stringify(val)
	  );
	};

	/**
	 * Parse the given `str` and return milliseconds.
	 *
	 * @param {String} str
	 * @return {Number}
	 * @api private
	 */

	function parse(str) {
	  str = String(str);
	  if (str.length > 100) {
	    return;
	  }
	  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
	    str
	  );
	  if (!match) {
	    return;
	  }
	  var n = parseFloat(match[1]);
	  var type = (match[2] || 'ms').toLowerCase();
	  switch (type) {
	    case 'years':
	    case 'year':
	    case 'yrs':
	    case 'yr':
	    case 'y':
	      return n * y;
	    case 'weeks':
	    case 'week':
	    case 'w':
	      return n * w;
	    case 'days':
	    case 'day':
	    case 'd':
	      return n * d;
	    case 'hours':
	    case 'hour':
	    case 'hrs':
	    case 'hr':
	    case 'h':
	      return n * h;
	    case 'minutes':
	    case 'minute':
	    case 'mins':
	    case 'min':
	    case 'm':
	      return n * m;
	    case 'seconds':
	    case 'second':
	    case 'secs':
	    case 'sec':
	    case 's':
	      return n * s;
	    case 'milliseconds':
	    case 'millisecond':
	    case 'msecs':
	    case 'msec':
	    case 'ms':
	      return n;
	    default:
	      return undefined;
	  }
	}

	/**
	 * Short format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtShort(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return Math.round(ms / d) + 'd';
	  }
	  if (msAbs >= h) {
	    return Math.round(ms / h) + 'h';
	  }
	  if (msAbs >= m) {
	    return Math.round(ms / m) + 'm';
	  }
	  if (msAbs >= s) {
	    return Math.round(ms / s) + 's';
	  }
	  return ms + 'ms';
	}

	/**
	 * Long format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtLong(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return plural(ms, msAbs, d, 'day');
	  }
	  if (msAbs >= h) {
	    return plural(ms, msAbs, h, 'hour');
	  }
	  if (msAbs >= m) {
	    return plural(ms, msAbs, m, 'minute');
	  }
	  if (msAbs >= s) {
	    return plural(ms, msAbs, s, 'second');
	  }
	  return ms + ' ms';
	}

	/**
	 * Pluralization helper.
	 */

	function plural(ms, msAbs, n, name) {
	  var isPlural = msAbs >= n * 1.5;
	  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
	}
	return ms;
}

var common;
var hasRequiredCommon;

function requireCommon () {
	if (hasRequiredCommon) return common;
	hasRequiredCommon = 1;
	/**
	 * This is the common logic for both the Node.js and web browser
	 * implementations of `debug()`.
	 */

	function setup(env) {
		createDebug.debug = createDebug;
		createDebug.default = createDebug;
		createDebug.coerce = coerce;
		createDebug.disable = disable;
		createDebug.enable = enable;
		createDebug.enabled = enabled;
		createDebug.humanize = requireMs();
		createDebug.destroy = destroy;

		Object.keys(env).forEach(key => {
			createDebug[key] = env[key];
		});

		/**
		* The currently active debug mode names, and names to skip.
		*/

		createDebug.names = [];
		createDebug.skips = [];

		/**
		* Map of special "%n" handling functions, for the debug "format" argument.
		*
		* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		*/
		createDebug.formatters = {};

		/**
		* Selects a color for a debug namespace
		* @param {String} namespace The namespace string for the debug instance to be colored
		* @return {Number|String} An ANSI color code for the given namespace
		* @api private
		*/
		function selectColor(namespace) {
			let hash = 0;

			for (let i = 0; i < namespace.length; i++) {
				hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
				hash |= 0; // Convert to 32bit integer
			}

			return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
		}
		createDebug.selectColor = selectColor;

		/**
		* Create a debugger with the given `namespace`.
		*
		* @param {String} namespace
		* @return {Function}
		* @api public
		*/
		function createDebug(namespace) {
			let prevTime;
			let enableOverride = null;
			let namespacesCache;
			let enabledCache;

			function debug(...args) {
				// Disabled?
				if (!debug.enabled) {
					return;
				}

				const self = debug;

				// Set `diff` timestamp
				const curr = Number(new Date());
				const ms = curr - (prevTime || curr);
				self.diff = ms;
				self.prev = prevTime;
				self.curr = curr;
				prevTime = curr;

				args[0] = createDebug.coerce(args[0]);

				if (typeof args[0] !== 'string') {
					// Anything else let's inspect with %O
					args.unshift('%O');
				}

				// Apply any `formatters` transformations
				let index = 0;
				args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
					// If we encounter an escaped % then don't increase the array index
					if (match === '%%') {
						return '%';
					}
					index++;
					const formatter = createDebug.formatters[format];
					if (typeof formatter === 'function') {
						const val = args[index];
						match = formatter.call(self, val);

						// Now we need to remove `args[index]` since it's inlined in the `format`
						args.splice(index, 1);
						index--;
					}
					return match;
				});

				// Apply env-specific formatting (colors, etc.)
				createDebug.formatArgs.call(self, args);

				const logFn = self.log || createDebug.log;
				logFn.apply(self, args);
			}

			debug.namespace = namespace;
			debug.useColors = createDebug.useColors();
			debug.color = createDebug.selectColor(namespace);
			debug.extend = extend;
			debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

			Object.defineProperty(debug, 'enabled', {
				enumerable: true,
				configurable: false,
				get: () => {
					if (enableOverride !== null) {
						return enableOverride;
					}
					if (namespacesCache !== createDebug.namespaces) {
						namespacesCache = createDebug.namespaces;
						enabledCache = createDebug.enabled(namespace);
					}

					return enabledCache;
				},
				set: v => {
					enableOverride = v;
				}
			});

			// Env-specific initialization logic for debug instances
			if (typeof createDebug.init === 'function') {
				createDebug.init(debug);
			}

			return debug;
		}

		function extend(namespace, delimiter) {
			const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
			newDebug.log = this.log;
			return newDebug;
		}

		/**
		* Enables a debug mode by namespaces. This can include modes
		* separated by a colon and wildcards.
		*
		* @param {String} namespaces
		* @api public
		*/
		function enable(namespaces) {
			createDebug.save(namespaces);
			createDebug.namespaces = namespaces;

			createDebug.names = [];
			createDebug.skips = [];

			let i;
			const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
			const len = split.length;

			for (i = 0; i < len; i++) {
				if (!split[i]) {
					// ignore empty strings
					continue;
				}

				namespaces = split[i].replace(/\*/g, '.*?');

				if (namespaces[0] === '-') {
					createDebug.skips.push(new RegExp('^' + namespaces.slice(1) + '$'));
				} else {
					createDebug.names.push(new RegExp('^' + namespaces + '$'));
				}
			}
		}

		/**
		* Disable debug output.
		*
		* @return {String} namespaces
		* @api public
		*/
		function disable() {
			const namespaces = [
				...createDebug.names.map(toNamespace),
				...createDebug.skips.map(toNamespace).map(namespace => '-' + namespace)
			].join(',');
			createDebug.enable('');
			return namespaces;
		}

		/**
		* Returns true if the given mode name is enabled, false otherwise.
		*
		* @param {String} name
		* @return {Boolean}
		* @api public
		*/
		function enabled(name) {
			if (name[name.length - 1] === '*') {
				return true;
			}

			let i;
			let len;

			for (i = 0, len = createDebug.skips.length; i < len; i++) {
				if (createDebug.skips[i].test(name)) {
					return false;
				}
			}

			for (i = 0, len = createDebug.names.length; i < len; i++) {
				if (createDebug.names[i].test(name)) {
					return true;
				}
			}

			return false;
		}

		/**
		* Convert regexp to namespace
		*
		* @param {RegExp} regxep
		* @return {String} namespace
		* @api private
		*/
		function toNamespace(regexp) {
			return regexp.toString()
				.substring(2, regexp.toString().length - 2)
				.replace(/\.\*\?$/, '*');
		}

		/**
		* Coerce `val`.
		*
		* @param {Mixed} val
		* @return {Mixed}
		* @api private
		*/
		function coerce(val) {
			if (val instanceof Error) {
				return val.stack || val.message;
			}
			return val;
		}

		/**
		* XXX DO NOT USE. This is a temporary stub function.
		* XXX It WILL be removed in the next major release.
		*/
		function destroy() {
			console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
		}

		createDebug.enable(createDebug.load());

		return createDebug;
	}

	common = setup;
	return common;
}

/* eslint-env browser */

var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser.exports;
	hasRequiredBrowser = 1;
	(function (module, exports) {
		/**
		 * This is the web browser implementation of `debug()`.
		 */

		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;
		exports.storage = localstorage();
		exports.destroy = (() => {
			let warned = false;

			return () => {
				if (!warned) {
					warned = true;
					console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
				}
			};
		})();

		/**
		 * Colors.
		 */

		exports.colors = [
			'#0000CC',
			'#0000FF',
			'#0033CC',
			'#0033FF',
			'#0066CC',
			'#0066FF',
			'#0099CC',
			'#0099FF',
			'#00CC00',
			'#00CC33',
			'#00CC66',
			'#00CC99',
			'#00CCCC',
			'#00CCFF',
			'#3300CC',
			'#3300FF',
			'#3333CC',
			'#3333FF',
			'#3366CC',
			'#3366FF',
			'#3399CC',
			'#3399FF',
			'#33CC00',
			'#33CC33',
			'#33CC66',
			'#33CC99',
			'#33CCCC',
			'#33CCFF',
			'#6600CC',
			'#6600FF',
			'#6633CC',
			'#6633FF',
			'#66CC00',
			'#66CC33',
			'#9900CC',
			'#9900FF',
			'#9933CC',
			'#9933FF',
			'#99CC00',
			'#99CC33',
			'#CC0000',
			'#CC0033',
			'#CC0066',
			'#CC0099',
			'#CC00CC',
			'#CC00FF',
			'#CC3300',
			'#CC3333',
			'#CC3366',
			'#CC3399',
			'#CC33CC',
			'#CC33FF',
			'#CC6600',
			'#CC6633',
			'#CC9900',
			'#CC9933',
			'#CCCC00',
			'#CCCC33',
			'#FF0000',
			'#FF0033',
			'#FF0066',
			'#FF0099',
			'#FF00CC',
			'#FF00FF',
			'#FF3300',
			'#FF3333',
			'#FF3366',
			'#FF3399',
			'#FF33CC',
			'#FF33FF',
			'#FF6600',
			'#FF6633',
			'#FF9900',
			'#FF9933',
			'#FFCC00',
			'#FFCC33'
		];

		/**
		 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
		 * and the Firebug extension (any Firefox version) are known
		 * to support "%c" CSS customizations.
		 *
		 * TODO: add a `localStorage` variable to explicitly enable/disable colors
		 */

		// eslint-disable-next-line complexity
		function useColors() {
			// NB: In an Electron preload script, document will be defined but not fully
			// initialized. Since we know we're in Chrome, we'll just detect this case
			// explicitly
			if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
				return true;
			}

			// Internet Explorer and Edge do not support colors.
			if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
				return false;
			}

			// Is webkit? http://stackoverflow.com/a/16459606/376773
			// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
			return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
				// Is firebug? http://stackoverflow.com/a/398120/376773
				(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
				// Is firefox >= v31?
				// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
				(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
				// Double check webkit in userAgent just in case we are in a worker
				(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
		}

		/**
		 * Colorize log arguments if enabled.
		 *
		 * @api public
		 */

		function formatArgs(args) {
			args[0] = (this.useColors ? '%c' : '') +
				this.namespace +
				(this.useColors ? ' %c' : ' ') +
				args[0] +
				(this.useColors ? '%c ' : ' ') +
				'+' + module.exports.humanize(this.diff);

			if (!this.useColors) {
				return;
			}

			const c = 'color: ' + this.color;
			args.splice(1, 0, c, 'color: inherit');

			// The final "%c" is somewhat tricky, because there could be other
			// arguments passed either before or after the %c, so we need to
			// figure out the correct index to insert the CSS into
			let index = 0;
			let lastC = 0;
			args[0].replace(/%[a-zA-Z%]/g, match => {
				if (match === '%%') {
					return;
				}
				index++;
				if (match === '%c') {
					// We only are interested in the *last* %c
					// (the user may have provided their own)
					lastC = index;
				}
			});

			args.splice(lastC, 0, c);
		}

		/**
		 * Invokes `console.debug()` when available.
		 * No-op when `console.debug` is not a "function".
		 * If `console.debug` is not available, falls back
		 * to `console.log`.
		 *
		 * @api public
		 */
		exports.log = console.debug || console.log || (() => {});

		/**
		 * Save `namespaces`.
		 *
		 * @param {String} namespaces
		 * @api private
		 */
		function save(namespaces) {
			try {
				if (namespaces) {
					exports.storage.setItem('debug', namespaces);
				} else {
					exports.storage.removeItem('debug');
				}
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}
		}

		/**
		 * Load `namespaces`.
		 *
		 * @return {String} returns the previously persisted debug modes
		 * @api private
		 */
		function load() {
			let r;
			try {
				r = exports.storage.getItem('debug');
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}

			// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
			if (!r && typeof process !== 'undefined' && 'env' in process) {
				r = process.env.DEBUG;
			}

			return r;
		}

		/**
		 * Localstorage attempts to return the localstorage.
		 *
		 * This is necessary because safari throws
		 * when a user disables cookies/localstorage
		 * and you attempt to access it.
		 *
		 * @return {LocalStorage}
		 * @api private
		 */

		function localstorage() {
			try {
				// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
				// The Browser also has localStorage in the global context.
				return localStorage;
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}
		}

		module.exports = requireCommon()(exports);

		const {formatters} = module.exports;

		/**
		 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
		 */

		formatters.j = function (v) {
			try {
				return JSON.stringify(v);
			} catch (error) {
				return '[UnexpectedJSONParseError]: ' + error.message;
			}
		}; 
	} (browser, browser.exports));
	return browser.exports;
}

var node = {exports: {}};

var hasFlag;
var hasRequiredHasFlag;

function requireHasFlag () {
	if (hasRequiredHasFlag) return hasFlag;
	hasRequiredHasFlag = 1;

	hasFlag = (flag, argv = process.argv) => {
		const prefix = flag.startsWith('-') ? '' : (flag.length === 1 ? '-' : '--');
		const position = argv.indexOf(prefix + flag);
		const terminatorPosition = argv.indexOf('--');
		return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
	};
	return hasFlag;
}

var supportsColor_1;
var hasRequiredSupportsColor;

function requireSupportsColor () {
	if (hasRequiredSupportsColor) return supportsColor_1;
	hasRequiredSupportsColor = 1;
	const os = require$$0$1;
	const tty = require$$0;
	const hasFlag = requireHasFlag();

	const {env} = process;

	let forceColor;
	if (hasFlag('no-color') ||
		hasFlag('no-colors') ||
		hasFlag('color=false') ||
		hasFlag('color=never')) {
		forceColor = 0;
	} else if (hasFlag('color') ||
		hasFlag('colors') ||
		hasFlag('color=true') ||
		hasFlag('color=always')) {
		forceColor = 1;
	}

	if ('FORCE_COLOR' in env) {
		if (env.FORCE_COLOR === 'true') {
			forceColor = 1;
		} else if (env.FORCE_COLOR === 'false') {
			forceColor = 0;
		} else {
			forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
		}
	}

	function translateLevel(level) {
		if (level === 0) {
			return false;
		}

		return {
			level,
			hasBasic: true,
			has256: level >= 2,
			has16m: level >= 3
		};
	}

	function supportsColor(haveStream, streamIsTTY) {
		if (forceColor === 0) {
			return 0;
		}

		if (hasFlag('color=16m') ||
			hasFlag('color=full') ||
			hasFlag('color=truecolor')) {
			return 3;
		}

		if (hasFlag('color=256')) {
			return 2;
		}

		if (haveStream && !streamIsTTY && forceColor === undefined) {
			return 0;
		}

		const min = forceColor || 0;

		if (env.TERM === 'dumb') {
			return min;
		}

		if (process.platform === 'win32') {
			// Windows 10 build 10586 is the first Windows release that supports 256 colors.
			// Windows 10 build 14931 is the first release that supports 16m/TrueColor.
			const osRelease = os.release().split('.');
			if (
				Number(osRelease[0]) >= 10 &&
				Number(osRelease[2]) >= 10586
			) {
				return Number(osRelease[2]) >= 14931 ? 3 : 2;
			}

			return 1;
		}

		if ('CI' in env) {
			if (['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI', 'GITHUB_ACTIONS', 'BUILDKITE'].some(sign => sign in env) || env.CI_NAME === 'codeship') {
				return 1;
			}

			return min;
		}

		if ('TEAMCITY_VERSION' in env) {
			return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
		}

		if (env.COLORTERM === 'truecolor') {
			return 3;
		}

		if ('TERM_PROGRAM' in env) {
			const version = parseInt((env.TERM_PROGRAM_VERSION || '').split('.')[0], 10);

			switch (env.TERM_PROGRAM) {
				case 'iTerm.app':
					return version >= 3 ? 3 : 2;
				case 'Apple_Terminal':
					return 2;
				// No default
			}
		}

		if (/-256(color)?$/i.test(env.TERM)) {
			return 2;
		}

		if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
			return 1;
		}

		if ('COLORTERM' in env) {
			return 1;
		}

		return min;
	}

	function getSupportLevel(stream) {
		const level = supportsColor(stream, stream && stream.isTTY);
		return translateLevel(level);
	}

	supportsColor_1 = {
		supportsColor: getSupportLevel,
		stdout: translateLevel(supportsColor(true, tty.isatty(1))),
		stderr: translateLevel(supportsColor(true, tty.isatty(2)))
	};
	return supportsColor_1;
}

/**
 * Module dependencies.
 */

var hasRequiredNode;

function requireNode () {
	if (hasRequiredNode) return node.exports;
	hasRequiredNode = 1;
	(function (module, exports) {
		const tty = require$$0;
		const util = require$$0$2;

		/**
		 * This is the Node.js implementation of `debug()`.
		 */

		exports.init = init;
		exports.log = log;
		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;
		exports.destroy = util.deprecate(
			() => {},
			'Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.'
		);

		/**
		 * Colors.
		 */

		exports.colors = [6, 2, 3, 4, 5, 1];

		try {
			// Optional dependency (as in, doesn't need to be installed, NOT like optionalDependencies in package.json)
			// eslint-disable-next-line import/no-extraneous-dependencies
			const supportsColor = requireSupportsColor();

			if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
				exports.colors = [
					20,
					21,
					26,
					27,
					32,
					33,
					38,
					39,
					40,
					41,
					42,
					43,
					44,
					45,
					56,
					57,
					62,
					63,
					68,
					69,
					74,
					75,
					76,
					77,
					78,
					79,
					80,
					81,
					92,
					93,
					98,
					99,
					112,
					113,
					128,
					129,
					134,
					135,
					148,
					149,
					160,
					161,
					162,
					163,
					164,
					165,
					166,
					167,
					168,
					169,
					170,
					171,
					172,
					173,
					178,
					179,
					184,
					185,
					196,
					197,
					198,
					199,
					200,
					201,
					202,
					203,
					204,
					205,
					206,
					207,
					208,
					209,
					214,
					215,
					220,
					221
				];
			}
		} catch (error) {
			// Swallow - we only care if `supports-color` is available; it doesn't have to be.
		}

		/**
		 * Build up the default `inspectOpts` object from the environment variables.
		 *
		 *   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js
		 */

		exports.inspectOpts = Object.keys(process.env).filter(key => {
			return /^debug_/i.test(key);
		}).reduce((obj, key) => {
			// Camel-case
			const prop = key
				.substring(6)
				.toLowerCase()
				.replace(/_([a-z])/g, (_, k) => {
					return k.toUpperCase();
				});

			// Coerce string value into JS value
			let val = process.env[key];
			if (/^(yes|on|true|enabled)$/i.test(val)) {
				val = true;
			} else if (/^(no|off|false|disabled)$/i.test(val)) {
				val = false;
			} else if (val === 'null') {
				val = null;
			} else {
				val = Number(val);
			}

			obj[prop] = val;
			return obj;
		}, {});

		/**
		 * Is stdout a TTY? Colored output is enabled when `true`.
		 */

		function useColors() {
			return 'colors' in exports.inspectOpts ?
				Boolean(exports.inspectOpts.colors) :
				tty.isatty(process.stderr.fd);
		}

		/**
		 * Adds ANSI color escape codes if enabled.
		 *
		 * @api public
		 */

		function formatArgs(args) {
			const {namespace: name, useColors} = this;

			if (useColors) {
				const c = this.color;
				const colorCode = '\u001B[3' + (c < 8 ? c : '8;5;' + c);
				const prefix = `  ${colorCode};1m${name} \u001B[0m`;

				args[0] = prefix + args[0].split('\n').join('\n' + prefix);
				args.push(colorCode + 'm+' + module.exports.humanize(this.diff) + '\u001B[0m');
			} else {
				args[0] = getDate() + name + ' ' + args[0];
			}
		}

		function getDate() {
			if (exports.inspectOpts.hideDate) {
				return '';
			}
			return new Date().toISOString() + ' ';
		}

		/**
		 * Invokes `util.format()` with the specified arguments and writes to stderr.
		 */

		function log(...args) {
			return process.stderr.write(util.format(...args) + '\n');
		}

		/**
		 * Save `namespaces`.
		 *
		 * @param {String} namespaces
		 * @api private
		 */
		function save(namespaces) {
			if (namespaces) {
				process.env.DEBUG = namespaces;
			} else {
				// If you set a process.env field to null or undefined, it gets cast to the
				// string 'null' or 'undefined'. Just delete instead.
				delete process.env.DEBUG;
			}
		}

		/**
		 * Load `namespaces`.
		 *
		 * @return {String} returns the previously persisted debug modes
		 * @api private
		 */

		function load() {
			return process.env.DEBUG;
		}

		/**
		 * Init logic for `debug` instances.
		 *
		 * Create a new `inspectOpts` object in case `useColors` is set
		 * differently for a particular `debug` instance.
		 */

		function init(debug) {
			debug.inspectOpts = {};

			const keys = Object.keys(exports.inspectOpts);
			for (let i = 0; i < keys.length; i++) {
				debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
			}
		}

		module.exports = requireCommon()(exports);

		const {formatters} = module.exports;

		/**
		 * Map %o to `util.inspect()`, all on a single line.
		 */

		formatters.o = function (v) {
			this.inspectOpts.colors = this.useColors;
			return util.inspect(v, this.inspectOpts)
				.split('\n')
				.map(str => str.trim())
				.join(' ');
		};

		/**
		 * Map %O to `util.inspect()`, allowing multiple lines if needed.
		 */

		formatters.O = function (v) {
			this.inspectOpts.colors = this.useColors;
			return util.inspect(v, this.inspectOpts);
		}; 
	} (node, node.exports));
	return node.exports;
}

/**
 * Detect Electron renderer / nwjs process, which is node, but we should
 * treat as a browser.
 */

if (typeof process === 'undefined' || process.type === 'renderer' || process.browser === true || process.__nwjs) {
	src.exports = requireBrowser();
} else {
	src.exports = requireNode();
}

var srcExports = src.exports;

var mustache = {exports: {}};

(function (module, exports) {
	(function (global, factory) {
	  module.exports = factory() ;
	}(commonjsGlobal, (function () {
	  /*!
	   * mustache.js - Logic-less {{mustache}} templates with JavaScript
	   * http://github.com/janl/mustache.js
	   */

	  var objectToString = Object.prototype.toString;
	  var isArray = Array.isArray || function isArrayPolyfill (object) {
	    return objectToString.call(object) === '[object Array]';
	  };

	  function isFunction (object) {
	    return typeof object === 'function';
	  }

	  /**
	   * More correct typeof string handling array
	   * which normally returns typeof 'object'
	   */
	  function typeStr (obj) {
	    return isArray(obj) ? 'array' : typeof obj;
	  }

	  function escapeRegExp (string) {
	    return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
	  }

	  /**
	   * Null safe way of checking whether or not an object,
	   * including its prototype, has a given property
	   */
	  function hasProperty (obj, propName) {
	    return obj != null && typeof obj === 'object' && (propName in obj);
	  }

	  /**
	   * Safe way of detecting whether or not the given thing is a primitive and
	   * whether it has the given property
	   */
	  function primitiveHasOwnProperty (primitive, propName) {
	    return (
	      primitive != null
	      && typeof primitive !== 'object'
	      && primitive.hasOwnProperty
	      && primitive.hasOwnProperty(propName)
	    );
	  }

	  // Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
	  // See https://github.com/janl/mustache.js/issues/189
	  var regExpTest = RegExp.prototype.test;
	  function testRegExp (re, string) {
	    return regExpTest.call(re, string);
	  }

	  var nonSpaceRe = /\S/;
	  function isWhitespace (string) {
	    return !testRegExp(nonSpaceRe, string);
	  }

	  var entityMap = {
	    '&': '&amp;',
	    '<': '&lt;',
	    '>': '&gt;',
	    '"': '&quot;',
	    "'": '&#39;',
	    '/': '&#x2F;',
	    '`': '&#x60;',
	    '=': '&#x3D;'
	  };

	  function escapeHtml (string) {
	    return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap (s) {
	      return entityMap[s];
	    });
	  }

	  var whiteRe = /\s*/;
	  var spaceRe = /\s+/;
	  var equalsRe = /\s*=/;
	  var curlyRe = /\s*\}/;
	  var tagRe = /#|\^|\/|>|\{|&|=|!/;

	  /**
	   * Breaks up the given `template` string into a tree of tokens. If the `tags`
	   * argument is given here it must be an array with two string values: the
	   * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
	   * course, the default is to use mustaches (i.e. mustache.tags).
	   *
	   * A token is an array with at least 4 elements. The first element is the
	   * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
	   * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
	   * all text that appears outside a symbol this element is "text".
	   *
	   * The second element of a token is its "value". For mustache tags this is
	   * whatever else was inside the tag besides the opening symbol. For text tokens
	   * this is the text itself.
	   *
	   * The third and fourth elements of the token are the start and end indices,
	   * respectively, of the token in the original template.
	   *
	   * Tokens that are the root node of a subtree contain two more elements: 1) an
	   * array of tokens in the subtree and 2) the index in the original template at
	   * which the closing tag for that section begins.
	   *
	   * Tokens for partials also contain two more elements: 1) a string value of
	   * indendation prior to that tag and 2) the index of that tag on that line -
	   * eg a value of 2 indicates the partial is the third tag on this line.
	   */
	  function parseTemplate (template, tags) {
	    if (!template)
	      return [];
	    var lineHasNonSpace = false;
	    var sections = [];     // Stack to hold section tokens
	    var tokens = [];       // Buffer to hold the tokens
	    var spaces = [];       // Indices of whitespace tokens on the current line
	    var hasTag = false;    // Is there a {{tag}} on the current line?
	    var nonSpace = false;  // Is there a non-space char on the current line?
	    var indentation = '';  // Tracks indentation for tags that use it
	    var tagIndex = 0;      // Stores a count of number of tags encountered on a line

	    // Strips all whitespace tokens array for the current line
	    // if there was a {{#tag}} on it and otherwise only space.
	    function stripSpace () {
	      if (hasTag && !nonSpace) {
	        while (spaces.length)
	          delete tokens[spaces.pop()];
	      } else {
	        spaces = [];
	      }

	      hasTag = false;
	      nonSpace = false;
	    }

	    var openingTagRe, closingTagRe, closingCurlyRe;
	    function compileTags (tagsToCompile) {
	      if (typeof tagsToCompile === 'string')
	        tagsToCompile = tagsToCompile.split(spaceRe, 2);

	      if (!isArray(tagsToCompile) || tagsToCompile.length !== 2)
	        throw new Error('Invalid tags: ' + tagsToCompile);

	      openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + '\\s*');
	      closingTagRe = new RegExp('\\s*' + escapeRegExp(tagsToCompile[1]));
	      closingCurlyRe = new RegExp('\\s*' + escapeRegExp('}' + tagsToCompile[1]));
	    }

	    compileTags(tags || mustache.tags);

	    var scanner = new Scanner(template);

	    var start, type, value, chr, token, openSection;
	    while (!scanner.eos()) {
	      start = scanner.pos;

	      // Match any text between tags.
	      value = scanner.scanUntil(openingTagRe);

	      if (value) {
	        for (var i = 0, valueLength = value.length; i < valueLength; ++i) {
	          chr = value.charAt(i);

	          if (isWhitespace(chr)) {
	            spaces.push(tokens.length);
	            indentation += chr;
	          } else {
	            nonSpace = true;
	            lineHasNonSpace = true;
	            indentation += ' ';
	          }

	          tokens.push([ 'text', chr, start, start + 1 ]);
	          start += 1;

	          // Check for whitespace on the current line.
	          if (chr === '\n') {
	            stripSpace();
	            indentation = '';
	            tagIndex = 0;
	            lineHasNonSpace = false;
	          }
	        }
	      }

	      // Match the opening tag.
	      if (!scanner.scan(openingTagRe))
	        break;

	      hasTag = true;

	      // Get the tag type.
	      type = scanner.scan(tagRe) || 'name';
	      scanner.scan(whiteRe);

	      // Get the tag value.
	      if (type === '=') {
	        value = scanner.scanUntil(equalsRe);
	        scanner.scan(equalsRe);
	        scanner.scanUntil(closingTagRe);
	      } else if (type === '{') {
	        value = scanner.scanUntil(closingCurlyRe);
	        scanner.scan(curlyRe);
	        scanner.scanUntil(closingTagRe);
	        type = '&';
	      } else {
	        value = scanner.scanUntil(closingTagRe);
	      }

	      // Match the closing tag.
	      if (!scanner.scan(closingTagRe))
	        throw new Error('Unclosed tag at ' + scanner.pos);

	      if (type == '>') {
	        token = [ type, value, start, scanner.pos, indentation, tagIndex, lineHasNonSpace ];
	      } else {
	        token = [ type, value, start, scanner.pos ];
	      }
	      tagIndex++;
	      tokens.push(token);

	      if (type === '#' || type === '^') {
	        sections.push(token);
	      } else if (type === '/') {
	        // Check section nesting.
	        openSection = sections.pop();

	        if (!openSection)
	          throw new Error('Unopened section "' + value + '" at ' + start);

	        if (openSection[1] !== value)
	          throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
	      } else if (type === 'name' || type === '{' || type === '&') {
	        nonSpace = true;
	      } else if (type === '=') {
	        // Set the tags for the next time around.
	        compileTags(value);
	      }
	    }

	    stripSpace();

	    // Make sure there are no open sections when we're done.
	    openSection = sections.pop();

	    if (openSection)
	      throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);

	    return nestTokens(squashTokens(tokens));
	  }

	  /**
	   * Combines the values of consecutive text tokens in the given `tokens` array
	   * to a single token.
	   */
	  function squashTokens (tokens) {
	    var squashedTokens = [];

	    var token, lastToken;
	    for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
	      token = tokens[i];

	      if (token) {
	        if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
	          lastToken[1] += token[1];
	          lastToken[3] = token[3];
	        } else {
	          squashedTokens.push(token);
	          lastToken = token;
	        }
	      }
	    }

	    return squashedTokens;
	  }

	  /**
	   * Forms the given array of `tokens` into a nested tree structure where
	   * tokens that represent a section have two additional items: 1) an array of
	   * all tokens that appear in that section and 2) the index in the original
	   * template that represents the end of that section.
	   */
	  function nestTokens (tokens) {
	    var nestedTokens = [];
	    var collector = nestedTokens;
	    var sections = [];

	    var token, section;
	    for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
	      token = tokens[i];

	      switch (token[0]) {
	        case '#':
	        case '^':
	          collector.push(token);
	          sections.push(token);
	          collector = token[4] = [];
	          break;
	        case '/':
	          section = sections.pop();
	          section[5] = token[2];
	          collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
	          break;
	        default:
	          collector.push(token);
	      }
	    }

	    return nestedTokens;
	  }

	  /**
	   * A simple string scanner that is used by the template parser to find
	   * tokens in template strings.
	   */
	  function Scanner (string) {
	    this.string = string;
	    this.tail = string;
	    this.pos = 0;
	  }

	  /**
	   * Returns `true` if the tail is empty (end of string).
	   */
	  Scanner.prototype.eos = function eos () {
	    return this.tail === '';
	  };

	  /**
	   * Tries to match the given regular expression at the current position.
	   * Returns the matched text if it can match, the empty string otherwise.
	   */
	  Scanner.prototype.scan = function scan (re) {
	    var match = this.tail.match(re);

	    if (!match || match.index !== 0)
	      return '';

	    var string = match[0];

	    this.tail = this.tail.substring(string.length);
	    this.pos += string.length;

	    return string;
	  };

	  /**
	   * Skips all text until the given regular expression can be matched. Returns
	   * the skipped string, which is the entire tail if no match can be made.
	   */
	  Scanner.prototype.scanUntil = function scanUntil (re) {
	    var index = this.tail.search(re), match;

	    switch (index) {
	      case -1:
	        match = this.tail;
	        this.tail = '';
	        break;
	      case 0:
	        match = '';
	        break;
	      default:
	        match = this.tail.substring(0, index);
	        this.tail = this.tail.substring(index);
	    }

	    this.pos += match.length;

	    return match;
	  };

	  /**
	   * Represents a rendering context by wrapping a view object and
	   * maintaining a reference to the parent context.
	   */
	  function Context (view, parentContext) {
	    this.view = view;
	    this.cache = { '.': this.view };
	    this.parent = parentContext;
	  }

	  /**
	   * Creates a new context using the given view with this context
	   * as the parent.
	   */
	  Context.prototype.push = function push (view) {
	    return new Context(view, this);
	  };

	  /**
	   * Returns the value of the given name in this context, traversing
	   * up the context hierarchy if the value is absent in this context's view.
	   */
	  Context.prototype.lookup = function lookup (name) {
	    var cache = this.cache;

	    var value;
	    if (cache.hasOwnProperty(name)) {
	      value = cache[name];
	    } else {
	      var context = this, intermediateValue, names, index, lookupHit = false;

	      while (context) {
	        if (name.indexOf('.') > 0) {
	          intermediateValue = context.view;
	          names = name.split('.');
	          index = 0;

	          /**
	           * Using the dot notion path in `name`, we descend through the
	           * nested objects.
	           *
	           * To be certain that the lookup has been successful, we have to
	           * check if the last object in the path actually has the property
	           * we are looking for. We store the result in `lookupHit`.
	           *
	           * This is specially necessary for when the value has been set to
	           * `undefined` and we want to avoid looking up parent contexts.
	           *
	           * In the case where dot notation is used, we consider the lookup
	           * to be successful even if the last "object" in the path is
	           * not actually an object but a primitive (e.g., a string, or an
	           * integer), because it is sometimes useful to access a property
	           * of an autoboxed primitive, such as the length of a string.
	           **/
	          while (intermediateValue != null && index < names.length) {
	            if (index === names.length - 1)
	              lookupHit = (
	                hasProperty(intermediateValue, names[index])
	                || primitiveHasOwnProperty(intermediateValue, names[index])
	              );

	            intermediateValue = intermediateValue[names[index++]];
	          }
	        } else {
	          intermediateValue = context.view[name];

	          /**
	           * Only checking against `hasProperty`, which always returns `false` if
	           * `context.view` is not an object. Deliberately omitting the check
	           * against `primitiveHasOwnProperty` if dot notation is not used.
	           *
	           * Consider this example:
	           * ```
	           * Mustache.render("The length of a football field is {{#length}}{{length}}{{/length}}.", {length: "100 yards"})
	           * ```
	           *
	           * If we were to check also against `primitiveHasOwnProperty`, as we do
	           * in the dot notation case, then render call would return:
	           *
	           * "The length of a football field is 9."
	           *
	           * rather than the expected:
	           *
	           * "The length of a football field is 100 yards."
	           **/
	          lookupHit = hasProperty(context.view, name);
	        }

	        if (lookupHit) {
	          value = intermediateValue;
	          break;
	        }

	        context = context.parent;
	      }

	      cache[name] = value;
	    }

	    if (isFunction(value))
	      value = value.call(this.view);

	    return value;
	  };

	  /**
	   * A Writer knows how to take a stream of tokens and render them to a
	   * string, given a context. It also maintains a cache of templates to
	   * avoid the need to parse the same template twice.
	   */
	  function Writer () {
	    this.templateCache = {
	      _cache: {},
	      set: function set (key, value) {
	        this._cache[key] = value;
	      },
	      get: function get (key) {
	        return this._cache[key];
	      },
	      clear: function clear () {
	        this._cache = {};
	      }
	    };
	  }

	  /**
	   * Clears all cached templates in this writer.
	   */
	  Writer.prototype.clearCache = function clearCache () {
	    if (typeof this.templateCache !== 'undefined') {
	      this.templateCache.clear();
	    }
	  };

	  /**
	   * Parses and caches the given `template` according to the given `tags` or
	   * `mustache.tags` if `tags` is omitted,  and returns the array of tokens
	   * that is generated from the parse.
	   */
	  Writer.prototype.parse = function parse (template, tags) {
	    var cache = this.templateCache;
	    var cacheKey = template + ':' + (tags || mustache.tags).join(':');
	    var isCacheEnabled = typeof cache !== 'undefined';
	    var tokens = isCacheEnabled ? cache.get(cacheKey) : undefined;

	    if (tokens == undefined) {
	      tokens = parseTemplate(template, tags);
	      isCacheEnabled && cache.set(cacheKey, tokens);
	    }
	    return tokens;
	  };

	  /**
	   * High-level method that is used to render the given `template` with
	   * the given `view`.
	   *
	   * The optional `partials` argument may be an object that contains the
	   * names and templates of partials that are used in the template. It may
	   * also be a function that is used to load partial templates on the fly
	   * that takes a single argument: the name of the partial.
	   *
	   * If the optional `config` argument is given here, then it should be an
	   * object with a `tags` attribute or an `escape` attribute or both.
	   * If an array is passed, then it will be interpreted the same way as
	   * a `tags` attribute on a `config` object.
	   *
	   * The `tags` attribute of a `config` object must be an array with two
	   * string values: the opening and closing tags used in the template (e.g.
	   * [ "<%", "%>" ]). The default is to mustache.tags.
	   *
	   * The `escape` attribute of a `config` object must be a function which
	   * accepts a string as input and outputs a safely escaped string.
	   * If an `escape` function is not provided, then an HTML-safe string
	   * escaping function is used as the default.
	   */
	  Writer.prototype.render = function render (template, view, partials, config) {
	    var tags = this.getConfigTags(config);
	    var tokens = this.parse(template, tags);
	    var context = (view instanceof Context) ? view : new Context(view, undefined);
	    return this.renderTokens(tokens, context, partials, template, config);
	  };

	  /**
	   * Low-level method that renders the given array of `tokens` using
	   * the given `context` and `partials`.
	   *
	   * Note: The `originalTemplate` is only ever used to extract the portion
	   * of the original template that was contained in a higher-order section.
	   * If the template doesn't use higher-order sections, this argument may
	   * be omitted.
	   */
	  Writer.prototype.renderTokens = function renderTokens (tokens, context, partials, originalTemplate, config) {
	    var buffer = '';

	    var token, symbol, value;
	    for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
	      value = undefined;
	      token = tokens[i];
	      symbol = token[0];

	      if (symbol === '#') value = this.renderSection(token, context, partials, originalTemplate, config);
	      else if (symbol === '^') value = this.renderInverted(token, context, partials, originalTemplate, config);
	      else if (symbol === '>') value = this.renderPartial(token, context, partials, config);
	      else if (symbol === '&') value = this.unescapedValue(token, context);
	      else if (symbol === 'name') value = this.escapedValue(token, context, config);
	      else if (symbol === 'text') value = this.rawValue(token);

	      if (value !== undefined)
	        buffer += value;
	    }

	    return buffer;
	  };

	  Writer.prototype.renderSection = function renderSection (token, context, partials, originalTemplate, config) {
	    var self = this;
	    var buffer = '';
	    var value = context.lookup(token[1]);

	    // This function is used to render an arbitrary template
	    // in the current context by higher-order sections.
	    function subRender (template) {
	      return self.render(template, context, partials, config);
	    }

	    if (!value) return;

	    if (isArray(value)) {
	      for (var j = 0, valueLength = value.length; j < valueLength; ++j) {
	        buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate, config);
	      }
	    } else if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
	      buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate, config);
	    } else if (isFunction(value)) {
	      if (typeof originalTemplate !== 'string')
	        throw new Error('Cannot use higher-order sections without the original template');

	      // Extract the portion of the original template that the section contains.
	      value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

	      if (value != null)
	        buffer += value;
	    } else {
	      buffer += this.renderTokens(token[4], context, partials, originalTemplate, config);
	    }
	    return buffer;
	  };

	  Writer.prototype.renderInverted = function renderInverted (token, context, partials, originalTemplate, config) {
	    var value = context.lookup(token[1]);

	    // Use JavaScript's definition of falsy. Include empty arrays.
	    // See https://github.com/janl/mustache.js/issues/186
	    if (!value || (isArray(value) && value.length === 0))
	      return this.renderTokens(token[4], context, partials, originalTemplate, config);
	  };

	  Writer.prototype.indentPartial = function indentPartial (partial, indentation, lineHasNonSpace) {
	    var filteredIndentation = indentation.replace(/[^ \t]/g, '');
	    var partialByNl = partial.split('\n');
	    for (var i = 0; i < partialByNl.length; i++) {
	      if (partialByNl[i].length && (i > 0 || !lineHasNonSpace)) {
	        partialByNl[i] = filteredIndentation + partialByNl[i];
	      }
	    }
	    return partialByNl.join('\n');
	  };

	  Writer.prototype.renderPartial = function renderPartial (token, context, partials, config) {
	    if (!partials) return;
	    var tags = this.getConfigTags(config);

	    var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
	    if (value != null) {
	      var lineHasNonSpace = token[6];
	      var tagIndex = token[5];
	      var indentation = token[4];
	      var indentedValue = value;
	      if (tagIndex == 0 && indentation) {
	        indentedValue = this.indentPartial(value, indentation, lineHasNonSpace);
	      }
	      var tokens = this.parse(indentedValue, tags);
	      return this.renderTokens(tokens, context, partials, indentedValue, config);
	    }
	  };

	  Writer.prototype.unescapedValue = function unescapedValue (token, context) {
	    var value = context.lookup(token[1]);
	    if (value != null)
	      return value;
	  };

	  Writer.prototype.escapedValue = function escapedValue (token, context, config) {
	    var escape = this.getConfigEscape(config) || mustache.escape;
	    var value = context.lookup(token[1]);
	    if (value != null)
	      return (typeof value === 'number' && escape === mustache.escape) ? String(value) : escape(value);
	  };

	  Writer.prototype.rawValue = function rawValue (token) {
	    return token[1];
	  };

	  Writer.prototype.getConfigTags = function getConfigTags (config) {
	    if (isArray(config)) {
	      return config;
	    }
	    else if (config && typeof config === 'object') {
	      return config.tags;
	    }
	    else {
	      return undefined;
	    }
	  };

	  Writer.prototype.getConfigEscape = function getConfigEscape (config) {
	    if (config && typeof config === 'object' && !isArray(config)) {
	      return config.escape;
	    }
	    else {
	      return undefined;
	    }
	  };

	  var mustache = {
	    name: 'mustache.js',
	    version: '4.2.0',
	    tags: [ '{{', '}}' ],
	    clearCache: undefined,
	    escape: undefined,
	    parse: undefined,
	    render: undefined,
	    Scanner: undefined,
	    Context: undefined,
	    Writer: undefined,
	    /**
	     * Allows a user to override the default caching strategy, by providing an
	     * object with set, get and clear methods. This can also be used to disable
	     * the cache by setting it to the literal `undefined`.
	     */
	    set templateCache (cache) {
	      defaultWriter.templateCache = cache;
	    },
	    /**
	     * Gets the default or overridden caching object from the default writer.
	     */
	    get templateCache () {
	      return defaultWriter.templateCache;
	    }
	  };

	  // All high-level mustache.* functions use this writer.
	  var defaultWriter = new Writer();

	  /**
	   * Clears all cached templates in the default writer.
	   */
	  mustache.clearCache = function clearCache () {
	    return defaultWriter.clearCache();
	  };

	  /**
	   * Parses and caches the given template in the default writer and returns the
	   * array of tokens it contains. Doing this ahead of time avoids the need to
	   * parse templates on the fly as they are rendered.
	   */
	  mustache.parse = function parse (template, tags) {
	    return defaultWriter.parse(template, tags);
	  };

	  /**
	   * Renders the `template` with the given `view`, `partials`, and `config`
	   * using the default writer.
	   */
	  mustache.render = function render (template, view, partials, config) {
	    if (typeof template !== 'string') {
	      throw new TypeError('Invalid template! Template should be a "string" ' +
	                          'but "' + typeStr(template) + '" was given as the first ' +
	                          'argument for mustache#render(template, view, partials)');
	    }

	    return defaultWriter.render(template, view, partials, config);
	  };

	  // Export the escaping function so that the user may override it.
	  // See https://github.com/janl/mustache.js/issues/244
	  mustache.escape = escapeHtml;

	  // Export these mainly for testing, but also for advanced usage.
	  mustache.Scanner = Scanner;
	  mustache.Context = Context;
	  mustache.Writer = Writer;

	  return mustache;

	}))); 
} (mustache));

var mustacheExports = mustache.exports;

var parser$1 = {};

var lexer = {};

var moo = {exports: {}};

(function (module) {
	(function(root, factory) {
	  if (module.exports) {
	    module.exports = factory();
	  } else {
	    root.moo = factory();
	  }
	}(commonjsGlobal, function() {

	  var hasOwnProperty = Object.prototype.hasOwnProperty;
	  var toString = Object.prototype.toString;
	  var hasSticky = typeof new RegExp().sticky === 'boolean';

	  /***************************************************************************/

	  function isRegExp(o) { return o && toString.call(o) === '[object RegExp]' }
	  function isObject(o) { return o && typeof o === 'object' && !isRegExp(o) && !Array.isArray(o) }

	  function reEscape(s) {
	    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
	  }
	  function reGroups(s) {
	    var re = new RegExp('|' + s);
	    return re.exec('').length - 1
	  }
	  function reCapture(s) {
	    return '(' + s + ')'
	  }
	  function reUnion(regexps) {
	    if (!regexps.length) return '(?!)'
	    var source =  regexps.map(function(s) {
	      return "(?:" + s + ")"
	    }).join('|');
	    return "(?:" + source + ")"
	  }

	  function regexpOrLiteral(obj) {
	    if (typeof obj === 'string') {
	      return '(?:' + reEscape(obj) + ')'

	    } else if (isRegExp(obj)) {
	      // TODO: consider /u support
	      if (obj.ignoreCase) throw new Error('RegExp /i flag not allowed')
	      if (obj.global) throw new Error('RegExp /g flag is implied')
	      if (obj.sticky) throw new Error('RegExp /y flag is implied')
	      if (obj.multiline) throw new Error('RegExp /m flag is implied')
	      return obj.source

	    } else {
	      throw new Error('Not a pattern: ' + obj)
	    }
	  }

	  function pad(s, length) {
	    if (s.length > length) {
	      return s
	    }
	    return Array(length - s.length + 1).join(" ") + s
	  }

	  function lastNLines(string, numLines) {
	    var position = string.length;
	    var lineBreaks = 0;
	    while (true) {
	      var idx = string.lastIndexOf("\n", position - 1);
	      if (idx === -1) {
	        break;
	      } else {
	        lineBreaks++;
	      }
	      position = idx;
	      if (lineBreaks === numLines) {
	        break;
	      }
	      if (position === 0) {
	        break;
	      }
	    }
	    var startPosition = 
	      lineBreaks < numLines ?
	      0 : 
	      position + 1;
	    return string.substring(startPosition).split("\n")
	  }

	  function objectToRules(object) {
	    var keys = Object.getOwnPropertyNames(object);
	    var result = [];
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      var thing = object[key];
	      var rules = [].concat(thing);
	      if (key === 'include') {
	        for (var j = 0; j < rules.length; j++) {
	          result.push({include: rules[j]});
	        }
	        continue
	      }
	      var match = [];
	      rules.forEach(function(rule) {
	        if (isObject(rule)) {
	          if (match.length) result.push(ruleOptions(key, match));
	          result.push(ruleOptions(key, rule));
	          match = [];
	        } else {
	          match.push(rule);
	        }
	      });
	      if (match.length) result.push(ruleOptions(key, match));
	    }
	    return result
	  }

	  function arrayToRules(array) {
	    var result = [];
	    for (var i = 0; i < array.length; i++) {
	      var obj = array[i];
	      if (obj.include) {
	        var include = [].concat(obj.include);
	        for (var j = 0; j < include.length; j++) {
	          result.push({include: include[j]});
	        }
	        continue
	      }
	      if (!obj.type) {
	        throw new Error('Rule has no type: ' + JSON.stringify(obj))
	      }
	      result.push(ruleOptions(obj.type, obj));
	    }
	    return result
	  }

	  function ruleOptions(type, obj) {
	    if (!isObject(obj)) {
	      obj = { match: obj };
	    }
	    if (obj.include) {
	      throw new Error('Matching rules cannot also include states')
	    }

	    // nb. error and fallback imply lineBreaks
	    var options = {
	      defaultType: type,
	      lineBreaks: !!obj.error || !!obj.fallback,
	      pop: false,
	      next: null,
	      push: null,
	      error: false,
	      fallback: false,
	      value: null,
	      type: null,
	      shouldThrow: false,
	    };

	    // Avoid Object.assign(), so we support IE9+
	    for (var key in obj) {
	      if (hasOwnProperty.call(obj, key)) {
	        options[key] = obj[key];
	      }
	    }

	    // type transform cannot be a string
	    if (typeof options.type === 'string' && type !== options.type) {
	      throw new Error("Type transform cannot be a string (type '" + options.type + "' for token '" + type + "')")
	    }

	    // convert to array
	    var match = options.match;
	    options.match = Array.isArray(match) ? match : match ? [match] : [];
	    options.match.sort(function(a, b) {
	      return isRegExp(a) && isRegExp(b) ? 0
	           : isRegExp(b) ? -1 : isRegExp(a) ? +1 : b.length - a.length
	    });
	    return options
	  }

	  function toRules(spec) {
	    return Array.isArray(spec) ? arrayToRules(spec) : objectToRules(spec)
	  }

	  var defaultErrorRule = ruleOptions('error', {lineBreaks: true, shouldThrow: true});
	  function compileRules(rules, hasStates) {
	    var errorRule = null;
	    var fast = Object.create(null);
	    var fastAllowed = true;
	    var unicodeFlag = null;
	    var groups = [];
	    var parts = [];

	    // If there is a fallback rule, then disable fast matching
	    for (var i = 0; i < rules.length; i++) {
	      if (rules[i].fallback) {
	        fastAllowed = false;
	      }
	    }

	    for (var i = 0; i < rules.length; i++) {
	      var options = rules[i];

	      if (options.include) {
	        // all valid inclusions are removed by states() preprocessor
	        throw new Error('Inheritance is not allowed in stateless lexers')
	      }

	      if (options.error || options.fallback) {
	        // errorRule can only be set once
	        if (errorRule) {
	          if (!options.fallback === !errorRule.fallback) {
	            throw new Error("Multiple " + (options.fallback ? "fallback" : "error") + " rules not allowed (for token '" + options.defaultType + "')")
	          } else {
	            throw new Error("fallback and error are mutually exclusive (for token '" + options.defaultType + "')")
	          }
	        }
	        errorRule = options;
	      }

	      var match = options.match.slice();
	      if (fastAllowed) {
	        while (match.length && typeof match[0] === 'string' && match[0].length === 1) {
	          var word = match.shift();
	          fast[word.charCodeAt(0)] = options;
	        }
	      }

	      // Warn about inappropriate state-switching options
	      if (options.pop || options.push || options.next) {
	        if (!hasStates) {
	          throw new Error("State-switching options are not allowed in stateless lexers (for token '" + options.defaultType + "')")
	        }
	        if (options.fallback) {
	          throw new Error("State-switching options are not allowed on fallback tokens (for token '" + options.defaultType + "')")
	        }
	      }

	      // Only rules with a .match are included in the RegExp
	      if (match.length === 0) {
	        continue
	      }
	      fastAllowed = false;

	      groups.push(options);

	      // Check unicode flag is used everywhere or nowhere
	      for (var j = 0; j < match.length; j++) {
	        var obj = match[j];
	        if (!isRegExp(obj)) {
	          continue
	        }

	        if (unicodeFlag === null) {
	          unicodeFlag = obj.unicode;
	        } else if (unicodeFlag !== obj.unicode && options.fallback === false) {
	          throw new Error('If one rule is /u then all must be')
	        }
	      }

	      // convert to RegExp
	      var pat = reUnion(match.map(regexpOrLiteral));

	      // validate
	      var regexp = new RegExp(pat);
	      if (regexp.test("")) {
	        throw new Error("RegExp matches empty string: " + regexp)
	      }
	      var groupCount = reGroups(pat);
	      if (groupCount > 0) {
	        throw new Error("RegExp has capture groups: " + regexp + "\nUse (?: … ) instead")
	      }

	      // try and detect rules matching newlines
	      if (!options.lineBreaks && regexp.test('\n')) {
	        throw new Error('Rule should declare lineBreaks: ' + regexp)
	      }

	      // store regex
	      parts.push(reCapture(pat));
	    }


	    // If there's no fallback rule, use the sticky flag so we only look for
	    // matches at the current index.
	    //
	    // If we don't support the sticky flag, then fake it using an irrefutable
	    // match (i.e. an empty pattern).
	    var fallbackRule = errorRule && errorRule.fallback;
	    var flags = hasSticky && !fallbackRule ? 'ym' : 'gm';
	    var suffix = hasSticky || fallbackRule ? '' : '|';

	    if (unicodeFlag === true) flags += "u";
	    var combined = new RegExp(reUnion(parts) + suffix, flags);
	    return {regexp: combined, groups: groups, fast: fast, error: errorRule || defaultErrorRule}
	  }

	  function compile(rules) {
	    var result = compileRules(toRules(rules));
	    return new Lexer({start: result}, 'start')
	  }

	  function checkStateGroup(g, name, map) {
	    var state = g && (g.push || g.next);
	    if (state && !map[state]) {
	      throw new Error("Missing state '" + state + "' (in token '" + g.defaultType + "' of state '" + name + "')")
	    }
	    if (g && g.pop && +g.pop !== 1) {
	      throw new Error("pop must be 1 (in token '" + g.defaultType + "' of state '" + name + "')")
	    }
	  }
	  function compileStates(states, start) {
	    var all = states.$all ? toRules(states.$all) : [];
	    delete states.$all;

	    var keys = Object.getOwnPropertyNames(states);
	    if (!start) start = keys[0];

	    var ruleMap = Object.create(null);
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      ruleMap[key] = toRules(states[key]).concat(all);
	    }
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      var rules = ruleMap[key];
	      var included = Object.create(null);
	      for (var j = 0; j < rules.length; j++) {
	        var rule = rules[j];
	        if (!rule.include) continue
	        var splice = [j, 1];
	        if (rule.include !== key && !included[rule.include]) {
	          included[rule.include] = true;
	          var newRules = ruleMap[rule.include];
	          if (!newRules) {
	            throw new Error("Cannot include nonexistent state '" + rule.include + "' (in state '" + key + "')")
	          }
	          for (var k = 0; k < newRules.length; k++) {
	            var newRule = newRules[k];
	            if (rules.indexOf(newRule) !== -1) continue
	            splice.push(newRule);
	          }
	        }
	        rules.splice.apply(rules, splice);
	        j--;
	      }
	    }

	    var map = Object.create(null);
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      map[key] = compileRules(ruleMap[key], true);
	    }

	    for (var i = 0; i < keys.length; i++) {
	      var name = keys[i];
	      var state = map[name];
	      var groups = state.groups;
	      for (var j = 0; j < groups.length; j++) {
	        checkStateGroup(groups[j], name, map);
	      }
	      var fastKeys = Object.getOwnPropertyNames(state.fast);
	      for (var j = 0; j < fastKeys.length; j++) {
	        checkStateGroup(state.fast[fastKeys[j]], name, map);
	      }
	    }

	    return new Lexer(map, start)
	  }

	  function keywordTransform(map) {

	    // Use a JavaScript Map to map keywords to their corresponding token type
	    // unless Map is unsupported, then fall back to using an Object:
	    var isMap = typeof Map !== 'undefined';
	    var reverseMap = isMap ? new Map : Object.create(null);

	    var types = Object.getOwnPropertyNames(map);
	    for (var i = 0; i < types.length; i++) {
	      var tokenType = types[i];
	      var item = map[tokenType];
	      var keywordList = Array.isArray(item) ? item : [item];
	      keywordList.forEach(function(keyword) {
	        if (typeof keyword !== 'string') {
	          throw new Error("keyword must be string (in keyword '" + tokenType + "')")
	        }
	        if (isMap) {
	          reverseMap.set(keyword, tokenType);
	        } else {
	          reverseMap[keyword] = tokenType;
	        }
	      });
	    }
	    return function(k) {
	      return isMap ? reverseMap.get(k) : reverseMap[k]
	    }
	  }

	  /***************************************************************************/

	  var Lexer = function(states, state) {
	    this.startState = state;
	    this.states = states;
	    this.buffer = '';
	    this.stack = [];
	    this.reset();
	  };

	  Lexer.prototype.reset = function(data, info) {
	    this.buffer = data || '';
	    this.index = 0;
	    this.line = info ? info.line : 1;
	    this.col = info ? info.col : 1;
	    this.queuedToken = info ? info.queuedToken : null;
	    this.queuedText = info ? info.queuedText: "";
	    this.queuedThrow = info ? info.queuedThrow : null;
	    this.setState(info ? info.state : this.startState);
	    this.stack = info && info.stack ? info.stack.slice() : [];
	    return this
	  };

	  Lexer.prototype.save = function() {
	    return {
	      line: this.line,
	      col: this.col,
	      state: this.state,
	      stack: this.stack.slice(),
	      queuedToken: this.queuedToken,
	      queuedText: this.queuedText,
	      queuedThrow: this.queuedThrow,
	    }
	  };

	  Lexer.prototype.setState = function(state) {
	    if (!state || this.state === state) return
	    this.state = state;
	    var info = this.states[state];
	    this.groups = info.groups;
	    this.error = info.error;
	    this.re = info.regexp;
	    this.fast = info.fast;
	  };

	  Lexer.prototype.popState = function() {
	    this.setState(this.stack.pop());
	  };

	  Lexer.prototype.pushState = function(state) {
	    this.stack.push(this.state);
	    this.setState(state);
	  };

	  var eat = hasSticky ? function(re, buffer) { // assume re is /y
	    return re.exec(buffer)
	  } : function(re, buffer) { // assume re is /g
	    var match = re.exec(buffer);
	    // will always match, since we used the |(?:) trick
	    if (match[0].length === 0) {
	      return null
	    }
	    return match
	  };

	  Lexer.prototype._getGroup = function(match) {
	    var groupCount = this.groups.length;
	    for (var i = 0; i < groupCount; i++) {
	      if (match[i + 1] !== undefined) {
	        return this.groups[i]
	      }
	    }
	    throw new Error('Cannot find token type for matched text')
	  };

	  function tokenToString() {
	    return this.value
	  }

	  Lexer.prototype.next = function() {
	    var index = this.index;

	    // If a fallback token matched, we don't need to re-run the RegExp
	    if (this.queuedGroup) {
	      var token = this._token(this.queuedGroup, this.queuedText, index);
	      this.queuedGroup = null;
	      this.queuedText = "";
	      return token
	    }

	    var buffer = this.buffer;
	    if (index === buffer.length) {
	      return // EOF
	    }

	    // Fast matching for single characters
	    var group = this.fast[buffer.charCodeAt(index)];
	    if (group) {
	      return this._token(group, buffer.charAt(index), index)
	    }

	    // Execute RegExp
	    var re = this.re;
	    re.lastIndex = index;
	    var match = eat(re, buffer);

	    // Error tokens match the remaining buffer
	    var error = this.error;
	    if (match == null) {
	      return this._token(error, buffer.slice(index, buffer.length), index)
	    }

	    var group = this._getGroup(match);
	    var text = match[0];

	    if (error.fallback && match.index !== index) {
	      this.queuedGroup = group;
	      this.queuedText = text;

	      // Fallback tokens contain the unmatched portion of the buffer
	      return this._token(error, buffer.slice(index, match.index), index)
	    }

	    return this._token(group, text, index)
	  };

	  Lexer.prototype._token = function(group, text, offset) {
	    // count line breaks
	    var lineBreaks = 0;
	    if (group.lineBreaks) {
	      var matchNL = /\n/g;
	      var nl = 1;
	      if (text === '\n') {
	        lineBreaks = 1;
	      } else {
	        while (matchNL.exec(text)) { lineBreaks++; nl = matchNL.lastIndex; }
	      }
	    }

	    var token = {
	      type: (typeof group.type === 'function' && group.type(text)) || group.defaultType,
	      value: typeof group.value === 'function' ? group.value(text) : text,
	      text: text,
	      toString: tokenToString,
	      offset: offset,
	      lineBreaks: lineBreaks,
	      line: this.line,
	      col: this.col,
	    };
	    // nb. adding more props to token object will make V8 sad!

	    var size = text.length;
	    this.index += size;
	    this.line += lineBreaks;
	    if (lineBreaks !== 0) {
	      this.col = size - nl + 1;
	    } else {
	      this.col += size;
	    }

	    // throw, if no rule with {error: true}
	    if (group.shouldThrow) {
	      var err = new Error(this.formatError(token, "invalid syntax"));
	      throw err;
	    }

	    if (group.pop) this.popState();
	    else if (group.push) this.pushState(group.push);
	    else if (group.next) this.setState(group.next);

	    return token
	  };

	  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
	    var LexerIterator = function(lexer) {
	      this.lexer = lexer;
	    };

	    LexerIterator.prototype.next = function() {
	      var token = this.lexer.next();
	      return {value: token, done: !token}
	    };

	    LexerIterator.prototype[Symbol.iterator] = function() {
	      return this
	    };

	    Lexer.prototype[Symbol.iterator] = function() {
	      return new LexerIterator(this)
	    };
	  }

	  Lexer.prototype.formatError = function(token, message) {
	    if (token == null) {
	      // An undefined token indicates EOF
	      var text = this.buffer.slice(this.index);
	      var token = {
	        text: text,
	        offset: this.index,
	        lineBreaks: text.indexOf('\n') === -1 ? 0 : 1,
	        line: this.line,
	        col: this.col,
	      };
	    }
	    
	    var numLinesAround = 2;
	    var firstDisplayedLine = Math.max(token.line - numLinesAround, 1);
	    var lastDisplayedLine = token.line + numLinesAround;
	    var lastLineDigits = String(lastDisplayedLine).length;
	    var displayedLines = lastNLines(
	        this.buffer, 
	        (this.line - token.line) + numLinesAround + 1
	      )
	      .slice(0, 5);
	    var errorLines = [];
	    errorLines.push(message + " at line " + token.line + " col " + token.col + ":");
	    errorLines.push("");
	    for (var i = 0; i < displayedLines.length; i++) {
	      var line = displayedLines[i];
	      var lineNo = firstDisplayedLine + i;
	      errorLines.push(pad(String(lineNo), lastLineDigits) + "  " + line);
	      if (lineNo === token.line) {
	        errorLines.push(pad("", lastLineDigits + token.col + 1) + "^");
	      }
	    }
	    return errorLines.join("\n")
	  };

	  Lexer.prototype.clone = function() {
	    return new Lexer(this.states, this.state)
	  };

	  Lexer.prototype.has = function(tokenType) {
	    return true
	  };


	  return {
	    compile: compile,
	    states: compileStates,
	    error: Object.freeze({error: true}),
	    fallback: Object.freeze({fallback: true}),
	    keywords: keywordTransform,
	  }

	})); 
} (moo));

var mooExports = moo.exports;

(function (exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.lexer = exports.states = void 0;
	const moo_1 = __importDefault(mooExports);
	exports.states = {
	    body: {
	        doubleapos: { match: "''", value: () => "'" },
	        quoted: {
	            lineBreaks: true,
	            match: /'[{}#](?:[^]*?[^'])?'(?!')/u,
	            value: src => src.slice(1, -1).replace(/''/g, "'")
	        },
	        argument: {
	            lineBreaks: true,
	            match: /\{\s*[^\p{Pat_Syn}\p{Pat_WS}]+\s*/u,
	            push: 'arg',
	            value: src => src.substring(1).trim()
	        },
	        octothorpe: '#',
	        end: { match: '}', pop: 1 },
	        content: { lineBreaks: true, match: /[^][^{}#']*/u }
	    },
	    arg: {
	        select: {
	            lineBreaks: true,
	            match: /,\s*(?:plural|select|selectordinal)\s*,\s*/u,
	            next: 'select',
	            value: src => src.split(',')[1].trim()
	        },
	        'func-args': {
	            lineBreaks: true,
	            match: /,\s*[^\p{Pat_Syn}\p{Pat_WS}]+\s*,/u,
	            next: 'body',
	            value: src => src.split(',')[1].trim()
	        },
	        'func-simple': {
	            lineBreaks: true,
	            match: /,\s*[^\p{Pat_Syn}\p{Pat_WS}]+\s*/u,
	            value: src => src.substring(1).trim()
	        },
	        end: { match: '}', pop: 1 }
	    },
	    select: {
	        offset: {
	            lineBreaks: true,
	            match: /\s*offset\s*:\s*\d+\s*/u,
	            value: src => src.split(':')[1].trim()
	        },
	        case: {
	            lineBreaks: true,
	            match: /\s*(?:=\d+|[^\p{Pat_Syn}\p{Pat_WS}]+)\s*\{/u,
	            push: 'body',
	            value: src => src.substring(0, src.indexOf('{')).trim()
	        },
	        end: { match: /\s*\}/u, pop: 1 }
	    }
	};
	exports.lexer = moo_1.default.states(exports.states); 
} (lexer));

/**
 * An AST parser for ICU MessageFormat strings
 *
 * @packageDocumentation
 * @example
 * ```
 * import { parse } from '@messageformat/parser
 *
 * parse('So {wow}.')
 * [ { type: 'content', value: 'So ' },
 *   { type: 'argument', arg: 'wow' },
 *   { type: 'content', value: '.' } ]
 *
 *
 * parse('Such { thing }. { count, selectordinal, one {First} two {Second}' +
 *       '                  few {Third} other {#th} } word.')
 * [ { type: 'content', value: 'Such ' },
 *   { type: 'argument', arg: 'thing' },
 *   { type: 'content', value: '. ' },
 *   { type: 'selectordinal',
 *     arg: 'count',
 *     cases: [
 *       { key: 'one', tokens: [ { type: 'content', value: 'First' } ] },
 *       { key: 'two', tokens: [ { type: 'content', value: 'Second' } ] },
 *       { key: 'few', tokens: [ { type: 'content', value: 'Third' } ] },
 *       { key: 'other',
 *         tokens: [ { type: 'octothorpe' }, { type: 'content', value: 'th' } ] }
 *     ] },
 *   { type: 'content', value: ' word.' } ]
 *
 *
 * parse('Many{type,select,plural{ numbers}selectordinal{ counting}' +
 *                          'select{ choices}other{ some {type}}}.')
 * [ { type: 'content', value: 'Many' },
 *   { type: 'select',
 *     arg: 'type',
 *     cases: [
 *       { key: 'plural', tokens: [ { type: 'content', value: 'numbers' } ] },
 *       { key: 'selectordinal', tokens: [ { type: 'content', value: 'counting' } ] },
 *       { key: 'select', tokens: [ { type: 'content', value: 'choices' } ] },
 *       { key: 'other',
 *         tokens: [ { type: 'content', value: 'some ' }, { type: 'argument', arg: 'type' } ] }
 *     ] },
 *   { type: 'content', value: '.' } ]
 *
 *
 * parse('{Such compliance')
 * // ParseError: invalid syntax at line 1 col 7:
 * //
 * //  {Such compliance
 * //        ^
 *
 *
 * const msg = '{words, plural, zero{No words} one{One word} other{# words}}'
 * parse(msg)
 * [ { type: 'plural',
 *     arg: 'words',
 *     cases: [
 *       { key: 'zero', tokens: [ { type: 'content', value: 'No words' } ] },
 *       { key: 'one', tokens: [ { type: 'content', value: 'One word' } ] },
 *       { key: 'other',
 *         tokens: [ { type: 'octothorpe' }, { type: 'content', value: ' words' } ] }
 *     ] } ]
 *
 *
 * parse(msg, { cardinal: [ 'one', 'other' ], ordinal: [ 'one', 'two', 'few', 'other' ] })
 * // ParseError: The plural case zero is not valid in this locale at line 1 col 17:
 * //
 * //   {words, plural, zero{
 * //                   ^
 * ```
 */
Object.defineProperty(parser$1, "__esModule", { value: true });
parser$1.parse = parser$1.ParseError = void 0;
const lexer_js_1 = lexer;
const getContext = (lt) => ({
    offset: lt.offset,
    line: lt.line,
    col: lt.col,
    text: lt.text,
    lineBreaks: lt.lineBreaks
});
const isSelectType = (type) => type === 'plural' || type === 'select' || type === 'selectordinal';
function strictArgStyleParam(lt, param) {
    let value = '';
    let text = '';
    for (const p of param) {
        const pText = p.ctx.text;
        text += pText;
        switch (p.type) {
            case 'content':
                value += p.value;
                break;
            case 'argument':
            case 'function':
            case 'octothorpe':
                value += pText;
                break;
            default:
                throw new ParseError(lt, `Unsupported part in strict mode function arg style: ${pText}`);
        }
    }
    const c = {
        type: 'content',
        value: value.trim(),
        ctx: Object.assign({}, param[0].ctx, { text })
    };
    return [c];
}
const strictArgTypes = [
    'number',
    'date',
    'time',
    'spellout',
    'ordinal',
    'duration'
];
const defaultPluralKeys = ['zero', 'one', 'two', 'few', 'many', 'other'];
/**
 * Thrown by {@link parse} on error
 *
 * @public
 */
class ParseError extends Error {
    /** @internal */
    constructor(lt, msg) {
        super(lexer_js_1.lexer.formatError(lt, msg));
    }
}
parser$1.ParseError = ParseError;
class Parser {
    constructor(src, opt) {
        var _a, _b, _c, _d;
        this.lexer = lexer_js_1.lexer.reset(src);
        this.cardinalKeys = (_a = opt === null || opt === void 0 ? void 0 : opt.cardinal) !== null && _a !== void 0 ? _a : defaultPluralKeys;
        this.ordinalKeys = (_b = opt === null || opt === void 0 ? void 0 : opt.ordinal) !== null && _b !== void 0 ? _b : defaultPluralKeys;
        this.strict = (_c = opt === null || opt === void 0 ? void 0 : opt.strict) !== null && _c !== void 0 ? _c : false;
        this.strictPluralKeys = (_d = opt === null || opt === void 0 ? void 0 : opt.strictPluralKeys) !== null && _d !== void 0 ? _d : true;
    }
    parse() {
        return this.parseBody(false, true);
    }
    checkSelectKey(lt, type, key) {
        if (key[0] === '=') {
            if (type === 'select')
                throw new ParseError(lt, `The case ${key} is not valid with select`);
        }
        else if (type !== 'select') {
            const keys = type === 'plural' ? this.cardinalKeys : this.ordinalKeys;
            if (this.strictPluralKeys && keys.length > 0 && !keys.includes(key)) {
                const msg = `The ${type} case ${key} is not valid in this locale`;
                throw new ParseError(lt, msg);
            }
        }
    }
    parseSelect({ value: arg }, inPlural, ctx, type) {
        const sel = { type, arg, cases: [], ctx };
        if (type === 'plural' || type === 'selectordinal')
            inPlural = true;
        else if (this.strict)
            inPlural = false;
        for (const lt of this.lexer) {
            switch (lt.type) {
                case 'offset':
                    if (type === 'select')
                        throw new ParseError(lt, 'Unexpected plural offset for select');
                    if (sel.cases.length > 0)
                        throw new ParseError(lt, 'Plural offset must be set before cases');
                    sel.pluralOffset = Number(lt.value);
                    ctx.text += lt.text;
                    ctx.lineBreaks += lt.lineBreaks;
                    break;
                case 'case': {
                    this.checkSelectKey(lt, type, lt.value);
                    sel.cases.push({
                        key: lt.value,
                        tokens: this.parseBody(inPlural),
                        ctx: getContext(lt)
                    });
                    break;
                }
                case 'end':
                    return sel;
                /* istanbul ignore next: never happens */
                default:
                    throw new ParseError(lt, `Unexpected lexer token: ${lt.type}`);
            }
        }
        throw new ParseError(null, 'Unexpected message end');
    }
    parseArgToken(lt, inPlural) {
        const ctx = getContext(lt);
        const argType = this.lexer.next();
        if (!argType)
            throw new ParseError(null, 'Unexpected message end');
        ctx.text += argType.text;
        ctx.lineBreaks += argType.lineBreaks;
        if (this.strict &&
            (argType.type === 'func-simple' || argType.type === 'func-args') &&
            !strictArgTypes.includes(argType.value)) {
            const msg = `Invalid strict mode function arg type: ${argType.value}`;
            throw new ParseError(lt, msg);
        }
        switch (argType.type) {
            case 'end':
                return { type: 'argument', arg: lt.value, ctx };
            case 'func-simple': {
                const end = this.lexer.next();
                if (!end)
                    throw new ParseError(null, 'Unexpected message end');
                /* istanbul ignore if: never happens */
                if (end.type !== 'end')
                    throw new ParseError(end, `Unexpected lexer token: ${end.type}`);
                ctx.text += end.text;
                if (isSelectType(argType.value.toLowerCase()))
                    throw new ParseError(argType, `Invalid type identifier: ${argType.value}`);
                return {
                    type: 'function',
                    arg: lt.value,
                    key: argType.value,
                    ctx
                };
            }
            case 'func-args': {
                if (isSelectType(argType.value.toLowerCase())) {
                    const msg = `Invalid type identifier: ${argType.value}`;
                    throw new ParseError(argType, msg);
                }
                let param = this.parseBody(this.strict ? false : inPlural);
                if (this.strict && param.length > 0)
                    param = strictArgStyleParam(lt, param);
                return {
                    type: 'function',
                    arg: lt.value,
                    key: argType.value,
                    param,
                    ctx
                };
            }
            case 'select':
                /* istanbul ignore else: never happens */
                if (isSelectType(argType.value))
                    return this.parseSelect(lt, inPlural, ctx, argType.value);
                else
                    throw new ParseError(argType, `Unexpected select type ${argType.value}`);
            /* istanbul ignore next: never happens */
            default:
                throw new ParseError(argType, `Unexpected lexer token: ${argType.type}`);
        }
    }
    parseBody(inPlural, atRoot) {
        const tokens = [];
        let content = null;
        for (const lt of this.lexer) {
            if (lt.type === 'argument') {
                if (content)
                    content = null;
                tokens.push(this.parseArgToken(lt, inPlural));
            }
            else if (lt.type === 'octothorpe' && inPlural) {
                if (content)
                    content = null;
                tokens.push({ type: 'octothorpe', ctx: getContext(lt) });
            }
            else if (lt.type === 'end' && !atRoot) {
                return tokens;
            }
            else {
                let value = lt.value;
                if (!inPlural && lt.type === 'quoted' && value[0] === '#') {
                    if (value.includes('{')) {
                        const errMsg = `Unsupported escape pattern: ${value}`;
                        throw new ParseError(lt, errMsg);
                    }
                    value = lt.text;
                }
                if (content) {
                    content.value += value;
                    content.ctx.text += lt.text;
                    content.ctx.lineBreaks += lt.lineBreaks;
                }
                else {
                    content = { type: 'content', value, ctx: getContext(lt) };
                    tokens.push(content);
                }
            }
        }
        if (atRoot)
            return tokens;
        throw new ParseError(null, 'Unexpected message end');
    }
}
/**
 * Parse an input string into an array of tokens
 *
 * @public
 * @remarks
 * The parser only supports the default `DOUBLE_OPTIONAL`
 * {@link http://www.icu-project.org/apiref/icu4c/messagepattern_8h.html#af6e0757e0eb81c980b01ee5d68a9978b | apostrophe mode}.
 */
function parse$1(src, options = {}) {
    const parser = new Parser(src, options);
    return parser.parse();
}
parser$1.parse = parse$1;

var runtime = {};

/**
 * A set of utility functions that are called by the compiled Javascript
 * functions, these are included locally in the output of {@link MessageFormat.compile compile()}.
 */
Object.defineProperty(runtime, "__esModule", { value: true });
runtime.reqArgs = runtime.select = runtime.plural = runtime.strictNumber = runtime.number = runtime._nf = void 0;
/** @private */
function _nf$1(lc) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return _nf$1[lc] || (_nf$1[lc] = new Intl.NumberFormat(lc));
}
runtime._nf = _nf$1;
/**
 * Utility function for `#` in plural rules
 *
 * @param lc The current locale
 * @param value The value to operate on
 * @param offset An offset, set by the surrounding context
 * @returns The result of applying the offset to the input value
 */
function number$1(lc, value, offset) {
    return _nf$1(lc).format(value - offset);
}
runtime.number = number$1;
/**
 * Strict utility function for `#` in plural rules
 *
 * Will throw an Error if `value` or `offset` are non-numeric.
 *
 * @param lc The current locale
 * @param value The value to operate on
 * @param offset An offset, set by the surrounding context
 * @param name The name of the argument, used for error reporting
 * @returns The result of applying the offset to the input value
 */
function strictNumber(lc, value, offset, name) {
    var n = value - offset;
    if (isNaN(n))
        throw new Error('`' + name + '` or its offset is not a number');
    return _nf$1(lc).format(n);
}
runtime.strictNumber = strictNumber;
/**
 * Utility function for `{N, plural|selectordinal, ...}`
 *
 * @param value The key to use to find a pluralization rule
 * @param offset An offset to apply to `value`
 * @param lcfunc A locale function from `pluralFuncs`
 * @param data The object from which results are looked up
 * @param isOrdinal If true, use ordinal rather than cardinal rules
 * @returns The result of the pluralization
 */
function plural(value, offset, lcfunc, data, isOrdinal) {
    if ({}.hasOwnProperty.call(data, value))
        return data[value];
    if (offset)
        value -= offset;
    var key = lcfunc(value, isOrdinal);
    return key in data ? data[key] : data.other;
}
runtime.plural = plural;
/**
 * Utility function for `{N, select, ...}`
 *
 * @param value The key to use to find a selection
 * @param data The object from which results are looked up
 * @returns The result of the select statement
 */
function select(value, data) {
    return {}.hasOwnProperty.call(data, value) ? data[value] : data.other;
}
runtime.select = select;
/**
 * Checks that all required arguments are set to defined values
 *
 * Throws on failure; otherwise returns undefined
 *
 * @param keys The required keys
 * @param data The data object being checked
 */
function reqArgs(keys, data) {
    for (var i = 0; i < keys.length; ++i)
        if (!data || data[keys[i]] === undefined)
            throw new Error("Message requires argument '".concat(keys[i], "'"));
}
runtime.reqArgs = reqArgs;

var formatters = {};

var date$1 = {};

Object.defineProperty(date$1, "__esModule", { value: true });
date$1.date = void 0;
/**
 * Represent a date as a short/default/long/full string
 *
 * @param value Either a Unix epoch time in milliseconds, or a string value
 *   representing a date. Parsed with `new Date(value)`
 *
 * @example
 * ```js
 * var mf = new MessageFormat(['en', 'fi']);
 *
 * mf.compile('Today is {T, date}')({ T: Date.now() })
 * // 'Today is Feb 21, 2016'
 *
 * mf.compile('Tänään on {T, date}', 'fi')({ T: Date.now() })
 * // 'Tänään on 21. helmikuuta 2016'
 *
 * mf.compile('Unix time started on {T, date, full}')({ T: 0 })
 * // 'Unix time started on Thursday, January 1, 1970'
 *
 * var cf = mf.compile('{sys} became operational on {d0, date, short}');
 * cf({ sys: 'HAL 9000', d0: '12 January 1999' })
 * // 'HAL 9000 became operational on 1/12/1999'
 * ```
 */
function date(value, lc, size) {
    var o = {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    };
    /* eslint-disable no-fallthrough */
    switch (size) {
        case 'full':
            o.weekday = 'long';
        case 'long':
            o.month = 'long';
            break;
        case 'short':
            o.month = 'numeric';
    }
    return new Date(value).toLocaleDateString(lc, o);
}
date$1.date = date;

var duration$1 = {};

Object.defineProperty(duration$1, "__esModule", { value: true });
duration$1.duration = void 0;
/**
 * Represent a duration in seconds as a string
 *
 * @param value A finite number, or its string representation
 * @return Includes one or two `:` separators, and matches the pattern
 *   `hhhh:mm:ss`, possibly with a leading `-` for negative values and a
 *   trailing `.sss` part for non-integer input
 *
 * @example
 * ```js
 * var mf = new MessageFormat();
 *
 * mf.compile('It has been {D, duration}')({ D: 123 })
 * // 'It has been 2:03'
 *
 * mf.compile('Countdown: {D, duration}')({ D: -151200.42 })
 * // 'Countdown: -42:00:00.420'
 * ```
 */
function duration(value) {
    if (typeof value !== 'number')
        value = Number(value);
    if (!isFinite(value))
        return String(value);
    var sign = '';
    if (value < 0) {
        sign = '-';
        value = Math.abs(value);
    }
    else {
        value = Number(value);
    }
    var sec = value % 60;
    var parts = [Math.round(sec) === sec ? sec : sec.toFixed(3)];
    if (value < 60) {
        parts.unshift(0); // at least one : is required
    }
    else {
        value = Math.round((value - Number(parts[0])) / 60);
        parts.unshift(value % 60); // minutes
        if (value >= 60) {
            value = Math.round((value - Number(parts[0])) / 60);
            parts.unshift(value); // hours
        }
    }
    var first = parts.shift();
    return (sign +
        first +
        ':' +
        parts.map(function (n) { return (n < 10 ? '0' + String(n) : String(n)); }).join(':'));
}
duration$1.duration = duration;

var number = {};

/**
 * Represent a number as an integer, percent or currency value
 *
 * Available in MessageFormat strings as `{VAR, number, integer|percent|currency}`.
 * Internally, calls Intl.NumberFormat with appropriate parameters. `currency` will
 * default to USD; to change, set `MessageFormat#currency` to the appropriate
 * three-letter currency code, or use the `currency:EUR` form of the argument.
 *
 * @example
 * ```js
 * var mf = new MessageFormat('en', { currency: 'EUR'});
 *
 * mf.compile('{N} is almost {N, number, integer}')({ N: 3.14 })
 * // '3.14 is almost 3'
 *
 * mf.compile('{P, number, percent} complete')({ P: 0.99 })
 * // '99% complete'
 *
 * mf.compile('The total is {V, number, currency}.')({ V: 5.5 })
 * // 'The total is €5.50.'
 *
 * mf.compile('The total is {V, number, currency:GBP}.')({ V: 5.5 })
 * // 'The total is £5.50.'
 * ```
 */
Object.defineProperty(number, "__esModule", { value: true });
number.numberPercent = number.numberInteger = number.numberCurrency = number.numberFmt = void 0;
var _nf = {};
function nf(lc, opt) {
    var key = String(lc) + JSON.stringify(opt);
    if (!_nf[key])
        _nf[key] = new Intl.NumberFormat(lc, opt);
    return _nf[key];
}
function numberFmt(value, lc, arg, defaultCurrency) {
    var _a = (arg && arg.split(':')) || [], type = _a[0], currency = _a[1];
    var opt = {
        integer: { maximumFractionDigits: 0 },
        percent: { style: 'percent' },
        currency: {
            style: 'currency',
            currency: (currency && currency.trim()) || defaultCurrency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    };
    return nf(lc, opt[type] || {}).format(value);
}
number.numberFmt = numberFmt;
var numberCurrency = function (value, lc, arg) {
    return nf(lc, {
        style: 'currency',
        currency: arg,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
};
number.numberCurrency = numberCurrency;
var numberInteger = function (value, lc) {
    return nf(lc, { maximumFractionDigits: 0 }).format(value);
};
number.numberInteger = numberInteger;
var numberPercent = function (value, lc) {
    return nf(lc, { style: 'percent' }).format(value);
};
number.numberPercent = numberPercent;

var time$1 = {};

Object.defineProperty(time$1, "__esModule", { value: true });
time$1.time = void 0;
/**
 * Represent a time as a short/default/long string
 *
 * @param value Either a Unix epoch time in milliseconds, or a string value
 *   representing a date. Parsed with `new Date(value)`
 *
 * @example
 * ```js
 * var mf = new MessageFormat(['en', 'fi']);
 *
 * mf.compile('The time is now {T, time}')({ T: Date.now() })
 * // 'The time is now 11:26:35 PM'
 *
 * mf.compile('Kello on nyt {T, time}', 'fi')({ T: Date.now() })
 * // 'Kello on nyt 23.26.35'
 *
 * var cf = mf.compile('The Eagle landed at {T, time, full} on {T, date, full}');
 * cf({ T: '1969-07-20 20:17:40 UTC' })
 * // 'The Eagle landed at 10:17:40 PM GMT+2 on Sunday, July 20, 1969'
 * ```
 */
function time(value, lc, size) {
    var o = {
        second: 'numeric',
        minute: 'numeric',
        hour: 'numeric'
    };
    /* eslint-disable no-fallthrough */
    switch (size) {
        case 'full':
        case 'long':
            o.timeZoneName = 'short';
            break;
        case 'short':
            delete o.second;
    }
    return new Date(value).toLocaleTimeString(lc, o);
}
time$1.time = time;

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.time = exports.numberPercent = exports.numberInteger = exports.numberFmt = exports.numberCurrency = exports.duration = exports.date = void 0;
	var date_js_1 = date$1;
	Object.defineProperty(exports, "date", { enumerable: true, get: function () { return date_js_1.date; } });
	var duration_js_1 = duration$1;
	Object.defineProperty(exports, "duration", { enumerable: true, get: function () { return duration_js_1.duration; } });
	var number_js_1 = number;
	Object.defineProperty(exports, "numberCurrency", { enumerable: true, get: function () { return number_js_1.numberCurrency; } });
	Object.defineProperty(exports, "numberFmt", { enumerable: true, get: function () { return number_js_1.numberFmt; } });
	Object.defineProperty(exports, "numberInteger", { enumerable: true, get: function () { return number_js_1.numberInteger; } });
	Object.defineProperty(exports, "numberPercent", { enumerable: true, get: function () { return number_js_1.numberPercent; } });
	var time_js_1 = time$1;
	Object.defineProperty(exports, "time", { enumerable: true, get: function () { return time_js_1.time; } }); 
} (formatters));

const ES3 = {
  break: true,
  continue: true,
  delete: true,
  else: true,
  for: true,
  function: true,
  if: true,
  in: true,
  new: true,
  return: true,
  this: true,
  typeof: true,
  var: true,
  void: true,
  while: true,
  with: true,
  case: true,
  catch: true,
  default: true,
  do: true,
  finally: true,
  instanceof: true,
  switch: true,
  throw: true,
  try: true
};

const ESnext = {
  // in addition to reservedES3
  await: true,
  debugger: true,
  class: true,
  enum: true,
  extends: true,
  super: true,
  const: true,
  export: true,
  import: true,
  null: true,
  true: true,
  false: true,
  implements: true,
  let: true,
  private: true,
  public: true,
  yield: true,
  interface: true,
  package: true,
  protected: true,
  static: true
};

var reserved$1 = { ES3, ESnext };

const reserved = reserved$1;

// from https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; ++i) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash
}

function identifier(key, unique) {
  if (unique) key += ' ' + hashCode(key).toString(36);
  const id = key.trim().replace(/\W+/g, '_');
  return reserved.ES3[id] || reserved.ESnext[id] || /^\d/.test(id)
    ? '_' + id
    : id
}

function property(obj, key) {
  if (/^[A-Z_$][0-9A-Z_$]*$/i.test(key) && !reserved.ES3[key]) {
    return obj ? obj + '.' + key : key
  } else {
    const jkey = JSON.stringify(key);
    return obj ? obj + '[' + jkey + ']' : jkey
  }
}

var safeIdentifier$2 = { identifier, property };

var parser = parser$1;
var Runtime = runtime;
var Formatters = formatters;
var safeIdentifier$1 = safeIdentifier$2;

function _interopNamespaceDefault$2(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var Runtime__namespace = /*#__PURE__*/_interopNamespaceDefault$2(Runtime);
var Formatters__namespace = /*#__PURE__*/_interopNamespaceDefault$2(Formatters);

/**
 * Parent class for errors.
 *
 * @remarks
 * Errors with `type: "warning"` do not necessarily indicate that the parser
 * encountered an error. In addition to a human-friendly `message`, may also
 * includes the `token` at which the error was encountered.
 *
 * @public
 */
class DateFormatError extends Error {
    /** @internal */
    constructor(msg, token, type) {
        super(msg);
        this.token = token;
        this.type = type || 'error';
    }
}
const alpha = (width) => width < 4 ? 'short' : width === 4 ? 'long' : 'narrow';
const numeric = (width) => (width % 2 === 0 ? '2-digit' : 'numeric');
function yearOptions(token, onError) {
    switch (token.char) {
        case 'y':
            return { year: numeric(token.width) };
        case 'r':
            return { calendar: 'gregory', year: 'numeric' };
        case 'u':
        case 'U':
        case 'Y':
        default:
            onError(`${token.desc} is not supported; falling back to year:numeric`, DateFormatError.WARNING);
            return { year: 'numeric' };
    }
}
function monthStyle(token, onError) {
    switch (token.width) {
        case 1:
            return 'numeric';
        case 2:
            return '2-digit';
        case 3:
            return 'short';
        case 4:
            return 'long';
        case 5:
            return 'narrow';
        default:
            onError(`${token.desc} is not supported with width ${token.width}`);
            return undefined;
    }
}
function dayStyle(token, onError) {
    const { char, desc, width } = token;
    if (char === 'd')
        return numeric(width);
    else {
        onError(`${desc} is not supported`);
        return undefined;
    }
}
function weekdayStyle(token, onError) {
    const { char, desc, width } = token;
    if ((char === 'c' || char === 'e') && width < 3) {
        // ignoring stand-alone-ness
        const msg = `Numeric value is not supported for ${desc}; falling back to weekday:short`;
        onError(msg, DateFormatError.WARNING);
    }
    // merging narrow styles
    return alpha(width);
}
function hourOptions(token) {
    const hour = numeric(token.width);
    let hourCycle;
    switch (token.char) {
        case 'h':
            hourCycle = 'h12';
            break;
        case 'H':
            hourCycle = 'h23';
            break;
        case 'k':
            hourCycle = 'h24';
            break;
        case 'K':
            hourCycle = 'h11';
            break;
    }
    return hourCycle ? { hour, hourCycle } : { hour };
}
function timeZoneNameStyle(token, onError) {
    // so much fallback behaviour here
    const { char, desc, width } = token;
    switch (char) {
        case 'v':
        case 'z':
            return width === 4 ? 'long' : 'short';
        case 'V':
            if (width === 4)
                return 'long';
            onError(`${desc} is not supported with width ${width}`);
            return undefined;
        case 'X':
            onError(`${desc} is not supported`);
            return undefined;
    }
    return 'short';
}
function compileOptions(token, onError) {
    switch (token.field) {
        case 'era':
            return { era: alpha(token.width) };
        case 'year':
            return yearOptions(token, onError);
        case 'month':
            return { month: monthStyle(token, onError) };
        case 'day':
            return { day: dayStyle(token, onError) };
        case 'weekday':
            return { weekday: weekdayStyle(token, onError) };
        case 'period':
            return undefined;
        case 'hour':
            return hourOptions(token);
        case 'min':
            return { minute: numeric(token.width) };
        case 'sec':
            return { second: numeric(token.width) };
        case 'tz':
            return { timeZoneName: timeZoneNameStyle(token, onError) };
        case 'quarter':
        case 'week':
        case 'sec-frac':
        case 'ms':
            onError(`${token.desc} is not supported`);
    }
    return undefined;
}
function getDateFormatOptions(tokens, onError = error => {
    throw error;
}) {
    const options = {};
    const fields = [];
    for (const token of tokens) {
        const { error, field, str } = token;
        if (error) {
            const dte = new DateFormatError(error.message, token);
            dte.stack = error.stack;
            onError(dte);
        }
        if (str) {
            const msg = `Ignoring string part: ${str}`;
            onError(new DateFormatError(msg, token, DateFormatError.WARNING));
        }
        if (field) {
            if (fields.indexOf(field) === -1)
                fields.push(field);
            else
                onError(new DateFormatError(`Duplicate ${field} token`, token));
        }
        const opt = compileOptions(token, (msg, isWarning) => onError(new DateFormatError(msg, token, isWarning)));
        if (opt)
            Object.assign(options, opt);
    }
    return options;
}

const fields = {
    G: { field: 'era', desc: 'Era' },
    y: { field: 'year', desc: 'Year' },
    Y: { field: 'year', desc: 'Year of "Week of Year"' },
    u: { field: 'year', desc: 'Extended year' },
    U: { field: 'year', desc: 'Cyclic year name' },
    r: { field: 'year', desc: 'Related Gregorian year' },
    Q: { field: 'quarter', desc: 'Quarter' },
    q: { field: 'quarter', desc: 'Stand-alone quarter' },
    M: { field: 'month', desc: 'Month in year' },
    L: { field: 'month', desc: 'Stand-alone month in year' },
    w: { field: 'week', desc: 'Week of year' },
    W: { field: 'week', desc: 'Week of month' },
    d: { field: 'day', desc: 'Day in month' },
    D: { field: 'day', desc: 'Day of year' },
    F: { field: 'day', desc: 'Day of week in month' },
    g: { field: 'day', desc: 'Modified julian day' },
    E: { field: 'weekday', desc: 'Day of week' },
    e: { field: 'weekday', desc: 'Local day of week' },
    c: { field: 'weekday', desc: 'Stand-alone local day of week' },
    a: { field: 'period', desc: 'AM/PM marker' },
    b: { field: 'period', desc: 'AM/PM/noon/midnight marker' },
    B: { field: 'period', desc: 'Flexible day period' },
    h: { field: 'hour', desc: 'Hour in AM/PM (1~12)' },
    H: { field: 'hour', desc: 'Hour in day (0~23)' },
    k: { field: 'hour', desc: 'Hour in day (1~24)' },
    K: { field: 'hour', desc: 'Hour in AM/PM (0~11)' },
    j: { field: 'hour', desc: 'Hour in preferred cycle' },
    J: { field: 'hour', desc: 'Hour in preferred cycle without marker' },
    C: { field: 'hour', desc: 'Hour in preferred cycle with flexible marker' },
    m: { field: 'min', desc: 'Minute in hour' },
    s: { field: 'sec', desc: 'Second in minute' },
    S: { field: 'sec-frac', desc: 'Fractional second' },
    A: { field: 'ms', desc: 'Milliseconds in day' },
    z: { field: 'tz', desc: 'Time Zone: specific non-location' },
    Z: { field: 'tz', desc: 'Time Zone' },
    O: { field: 'tz', desc: 'Time Zone: localized' },
    v: { field: 'tz', desc: 'Time Zone: generic non-location' },
    V: { field: 'tz', desc: 'Time Zone: ID' },
    X: { field: 'tz', desc: 'Time Zone: ISO8601 with Z' },
    x: { field: 'tz', desc: 'Time Zone: ISO8601' }
};
const isLetter = (char) => (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z');
function readFieldToken(src, pos) {
    const char = src[pos];
    let width = 1;
    while (src[++pos] === char)
        ++width;
    const field = fields[char];
    if (!field) {
        const msg = `The letter ${char} is not a valid field identifier`;
        return { char, error: new Error(msg), width };
    }
    return { char, field: field.field, desc: field.desc, width };
}
function readQuotedToken(src, pos) {
    let str = src[++pos];
    let width = 2;
    if (str === "'")
        return { char: "'", str, width };
    while (true) {
        const next = src[++pos];
        ++width;
        if (next === undefined) {
            const msg = `Unterminated quoted literal in pattern: ${str || src}`;
            return { char: "'", error: new Error(msg), str, width };
        }
        else if (next === "'") {
            if (src[++pos] !== "'")
                return { char: "'", str, width };
            else
                ++width;
        }
        str += next;
    }
}
function readToken(src, pos) {
    const char = src[pos];
    if (!char)
        return null;
    if (isLetter(char))
        return readFieldToken(src, pos);
    if (char === "'")
        return readQuotedToken(src, pos);
    let str = char;
    let width = 1;
    while (true) {
        const next = src[++pos];
        if (!next || isLetter(next) || next === "'")
            return { char, str, width };
        str += next;
        width += 1;
    }
}
/**
 * Parse an {@link http://userguide.icu-project.org/formatparse/datetime | ICU
 * DateFormat skeleton} string into a {@link DateToken} array.
 *
 * @remarks
 * Errors will not be thrown, but if encountered are included as the relevant
 * token's `error` value.
 *
 * @public
 * @param src - The skeleton string
 *
 * @example
 * ```js
 * import { parseDateTokens } from '@messageformat/date-skeleton'
 *
 * parseDateTokens('GrMMMdd', console.error)
 * // [
 * //   { char: 'G', field: 'era', desc: 'Era', width: 1 },
 * //   { char: 'r', field: 'year', desc: 'Related Gregorian year', width: 1 },
 * //   { char: 'M', field: 'month', desc: 'Month in year', width: 3 },
 * //   { char: 'd', field: 'day', desc: 'Day in month', width: 2 }
 * // ]
 * ```
 */
function parseDateTokens(src) {
    const tokens = [];
    let pos = 0;
    while (true) {
        const token = readToken(src, pos);
        if (!token)
            return tokens;
        tokens.push(token);
        pos += token.width;
    }
}

/**
 * Returns a date formatter function for the given locales and date skeleton
 *
 * @remarks
 * Uses `Intl.DateTimeFormat` internally.
 *
 * @public
 * @param locales - One or more valid BCP 47 language tags, e.g. `fr` or `en-CA`
 * @param tokens - An ICU DateFormat skeleton string, or an array or parsed
 *   `DateToken` tokens
 * @param onError - If defined, will be called separately for each encountered
 *   parsing error and unsupported feature.
 * @example
 * ```js
 * import { getDateFormatter } from '@messageformat/date-skeleton'
 *
 * // 2006 Jan 2, 15:04:05.789 in local time
 * const date = new Date(2006, 0, 2, 15, 4, 5, 789)
 *
 * let fmt = getDateFormatter('en-CA', 'GrMMMdd', console.error)
 * fmt(date) // 'Jan. 02, 2006 AD'
 *
 * fmt = getDateFormatter('en-CA', 'hamszzzz', console.error)
 * fmt(date) // '3:04:05 p.m. Newfoundland Daylight Time'
 * ```
 */
function getDateFormatter(locales, tokens, onError) {
    if (typeof tokens === 'string')
        tokens = parseDateTokens(tokens);
    const opt = getDateFormatOptions(tokens, onError);
    const dtf = new Intl.DateTimeFormat(locales, opt);
    return (date) => dtf.format(date);
}
/**
 * Returns a string of JavaScript source that evaluates to a date formatter
 * function with the same `(date: Date | number) => string` signature as the
 * function returned by {@link getDateFormatter}.
 *
 * @remarks
 * The returned function will memoize an `Intl.DateTimeFormat` instance.
 *
 * @public
 * @param locales - One or more valid BCP 47 language tags, e.g. `fr` or `en-CA`
 * @param tokens - An ICU DateFormat skeleton string, or an array or parsed
 *   `DateToken` tokens
 * @param onError - If defined, will be called separately for each encountered
 *   parsing error and unsupported feature.
 * @example
 * ```js
 * import { getDateFormatterSource } from '@messageformat/date-skeleton'
 *
 * getDateFormatterSource('en-CA', 'GrMMMdd', console.error)
 * // '(function() {\n' +
 * // '  var opt = {"era":"short","calendar":"gregory","year":"numeric",' +
 * //      '"month":"short","day":"2-digit"};\n' +
 * // '  var dtf = new Intl.DateTimeFormat("en-CA", opt);\n' +
 * // '  return function(value) { return dtf.format(value); }\n' +
 * // '})()'
 *
 * const src = getDateFormatterSource('en-CA', 'hamszzzz', console.error)
 * // '(function() {\n' +
 * // '  var opt = {"hour":"numeric","hourCycle":"h12","minute":"numeric",' +
 * //      '"second":"numeric","timeZoneName":"long"};\n' +
 * // '  var dtf = new Intl.DateTimeFormat("en-CA", opt);\n' +
 * // '  return function(value) { return dtf.format(value); }\n' +
 * // '})()'
 *
 * const fmt = new Function(`return ${src}`)()
 * const date = new Date(2006, 0, 2, 15, 4, 5, 789)
 * fmt(date) // '3:04:05 p.m. Newfoundland Daylight Time'
 * ```
 */
function getDateFormatterSource(locales, tokens, onError) {
    if (typeof tokens === 'string')
        tokens = parseDateTokens(tokens);
    const opt = getDateFormatOptions(tokens, onError);
    const lines = [
        `(function() {`,
        `var opt = ${JSON.stringify(opt)};`,
        `var dtf = new Intl.DateTimeFormat(${JSON.stringify(locales)}, opt);`,
        `return function(value) { return dtf.format(value); }`
    ];
    return lines.join('\n  ') + '\n})()';
}

/**
 * Base class for errors. In addition to a `code` and a human-friendly
 * `message`, may also includes the token `stem` as well as other fields.
 *
 * @public
 */
class NumberFormatError extends Error {
    /** @internal */
    constructor(code, msg) {
        super(msg);
        this.code = code;
    }
}
/** @internal */
class BadOptionError extends NumberFormatError {
    constructor(stem, opt) {
        super('BAD_OPTION', `Unknown ${stem} option: ${opt}`);
        this.stem = stem;
        this.option = opt;
    }
}
/** @internal */
class BadStemError extends NumberFormatError {
    constructor(stem) {
        super('BAD_STEM', `Unknown stem: ${stem}`);
        this.stem = stem;
    }
}
/** @internal */
class MaskedValueError extends NumberFormatError {
    constructor(type, prev) {
        super('MASKED_VALUE', `Value for ${type} is set multiple times`);
        this.type = type;
        this.prev = prev;
    }
}
/** @internal */
class MissingOptionError extends NumberFormatError {
    constructor(stem) {
        super('MISSING_OPTION', `Required option missing for ${stem}`);
        this.stem = stem;
    }
}
/** @internal */
class PatternError extends NumberFormatError {
    constructor(char, msg) {
        super('BAD_PATTERN', msg);
        this.char = char;
    }
}
/** @internal */
class TooManyOptionsError extends NumberFormatError {
    constructor(stem, options, maxOpt) {
        const maxOptStr = maxOpt > 1 ? `${maxOpt} options` : 'one option';
        super('TOO_MANY_OPTIONS', `Token ${stem} only supports ${maxOptStr} (got ${options.length})`);
        this.stem = stem;
        this.options = options;
    }
}

/**
 * Add
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation | numbering-system tags}
 * to locale identifiers
 *
 * @internal
 */
function getNumberFormatLocales(locales, { numberingSystem }) {
    if (!Array.isArray(locales))
        locales = [locales];
    return numberingSystem
        ? locales
            .map(lc => {
            const ext = lc.indexOf('-u-') === -1 ? 'u-nu' : 'nu';
            return `${lc}-${ext}-${numberingSystem}`;
        })
            .concat(locales)
        : locales;
}

// from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
function round(x, precision) {
    const y = +x + precision / 2;
    return y - (y % +precision);
}
function getNumberFormatMultiplier({ scale, unit }) {
    let mult = typeof scale === 'number' && scale >= 0 ? scale : 1;
    if (unit && unit.style === 'percent')
        mult *= 0.01;
    return mult;
}
/**
 * Determine a modifier for the input value to account for any `scale`,
 * `percent`, and `precision-increment` tokens in the skeleton.
 *
 * @internal
 * @remarks
 * With ICU NumberFormatter, the `percent` skeleton would style `25` as "25%".
 * To achieve the same with `Intl.NumberFormat`, the input value must be `0.25`.
 */
function getNumberFormatModifier(skeleton) {
    const mult = getNumberFormatMultiplier(skeleton);
    const { precision } = skeleton;
    if (precision && precision.style === 'precision-increment') {
        return (n) => round(n, precision.increment) * mult;
    }
    else {
        return (n) => n * mult;
    }
}
/**
 * Returns a string of JavaScript source that evaluates to a modifier for the
 * input value to account for any `scale`, `percent`, and `precision-increment`
 * tokens in the skeleton.
 *
 * @internal
 * @remarks
 * With ICU NumberFormatter, the `percent` skeleton would style `25` as "25%".
 * To achieve the same with `Intl.NumberFormat`, the input value must be `0.25`.
 */
function getNumberFormatModifierSource(skeleton) {
    const mult = getNumberFormatMultiplier(skeleton);
    const { precision } = skeleton;
    if (precision && precision.style === 'precision-increment') {
        // see round() above for source
        const setX = `+n + ${precision.increment / 2}`;
        let res = `x - (x % +${precision.increment})`;
        if (mult !== 1)
            res = `(${res}) * ${mult}`;
        return `function(n) { var x = ${setX}; return ${res}; }`;
    }
    return mult !== 1 ? `function(n) { return n * ${mult}; }` : null;
}

/**
 * Given an input ICU NumberFormatter skeleton, does its best to construct a
 * corresponding `Intl.NumberFormat` options structure.
 *
 * @remarks
 * Some features depend on `Intl.NumberFormat` features defined in ES2020.
 *
 * @internal
 * @param onUnsupported - If defined, called when encountering unsupported (but
 *   valid) tokens, such as `decimal-always` or `permille`. The error `source`
 *   may specify the source of an unsupported option.
 *
 * @example
 * ```js
 * import {
 *   getNumberFormatOptions,
 *   parseNumberSkeleton
 * } from '@messageformat/number-skeleton'
 *
 * const src = 'currency/CAD unit-width-narrow'
 * const skeleton = parseNumberSkeleton(src, console.error)
 * // {
 * //   unit: { style: 'currency', currency: 'CAD' },
 * //   unitWidth: 'unit-width-narrow'
 * // }
 *
 * getNumberFormatOptions(skeleton, console.error)
 * // {
 * //   style: 'currency',
 * //   currency: 'CAD',
 * //   currencyDisplay: 'narrowSymbol',
 * //   unitDisplay: 'narrow'
 * // }
 *
 * const sk2 = parseNumberSkeleton('group-min2')
 * // { group: 'group-min2' }
 *
 * getNumberFormatOptions(sk2, console.error)
 * // Error: The stem group-min2 is not supported
 * //   at UnsupportedError.NumberFormatError ... {
 * //     code: 'UNSUPPORTED',
 * //     stem: 'group-min2'
 * //   }
 * // {}
 * ```
 */
function getNumberFormatOptions(skeleton, onUnsupported) {
    const { decimal, group, integerWidth, notation, precision, roundingMode, sign, unit, unitPer, unitWidth } = skeleton;
    const fail = (stem, source) => {
    };
    const opt = {};
    if (unit) {
        switch (unit.style) {
            case 'base-unit':
                opt.style = 'decimal';
                break;
            case 'currency':
                opt.style = 'currency';
                opt.currency = unit.currency;
                break;
            case 'measure-unit':
                opt.style = 'unit';
                opt.unit = unit.unit.replace(/.*-/, '');
                if (unitPer)
                    opt.unit += '-per-' + unitPer.replace(/.*-/, '');
                break;
            case 'percent':
                opt.style = 'percent';
                break;
        }
    }
    switch (unitWidth) {
        case 'unit-width-full-name':
            opt.currencyDisplay = 'name';
            opt.unitDisplay = 'long';
            break;
        case 'unit-width-hidden':
            break;
        case 'unit-width-iso-code':
            opt.currencyDisplay = 'code';
            break;
        case 'unit-width-narrow':
            opt.currencyDisplay = 'narrowSymbol';
            opt.unitDisplay = 'narrow';
            break;
        case 'unit-width-short':
            opt.currencyDisplay = 'symbol';
            opt.unitDisplay = 'short';
            break;
    }
    switch (group) {
        case 'group-off':
            opt.useGrouping = false;
            break;
        case 'group-auto':
            opt.useGrouping = true;
            break;
        case 'group-min2':
        case 'group-on-aligned':
        case 'group-thousands':
            opt.useGrouping = true;
            break;
    }
    if (precision) {
        switch (precision.style) {
            case 'precision-fraction': {
                const { minFraction: minF, maxFraction: maxF, minSignificant: minS, maxSignificant: maxS, source } = precision;
                if (typeof minF === 'number') {
                    opt.minimumFractionDigits = minF;
                }
                if (typeof maxF === 'number')
                    opt.maximumFractionDigits = maxF;
                if (typeof minS === 'number')
                    opt.minimumSignificantDigits = minS;
                if (typeof maxS === 'number')
                    opt.maximumSignificantDigits = maxS;
                break;
            }
            case 'precision-integer':
                opt.maximumFractionDigits = 0;
                break;
            case 'precision-unlimited':
                opt.maximumFractionDigits = 20;
                break;
            case 'precision-increment':
                break;
            case 'precision-currency-standard':
                opt.trailingZeroDisplay = precision.trailingZero;
                break;
            case 'precision-currency-cash':
                fail(precision.style);
                break;
        }
    }
    if (notation) {
        switch (notation.style) {
            case 'compact-short':
                opt.notation = 'compact';
                opt.compactDisplay = 'short';
                break;
            case 'compact-long':
                opt.notation = 'compact';
                opt.compactDisplay = 'long';
                break;
            case 'notation-simple':
                opt.notation = 'standard';
                break;
            case 'scientific':
            case 'engineering': {
                const { expDigits, expSign, source, style } = notation;
                opt.notation = style;
                break;
            }
        }
    }
    if (integerWidth) {
        const { min, max, source } = integerWidth;
        if (min > 0)
            opt.minimumIntegerDigits = min;
        if (Number(max) > 0) {
            const hasExp = opt.notation === 'engineering' || opt.notation === 'scientific';
            if (max === 3 && hasExp)
                opt.notation = 'engineering';
        }
    }
    switch (sign) {
        case 'sign-auto':
            opt.signDisplay = 'auto';
            break;
        case 'sign-always':
            opt.signDisplay = 'always';
            break;
        case 'sign-except-zero':
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore https://github.com/microsoft/TypeScript/issues/46712
            opt.signDisplay = 'exceptZero';
            break;
        case 'sign-never':
            opt.signDisplay = 'never';
            break;
        case 'sign-accounting':
            opt.currencySign = 'accounting';
            break;
        case 'sign-accounting-always':
            opt.currencySign = 'accounting';
            opt.signDisplay = 'always';
            break;
        case 'sign-accounting-except-zero':
            opt.currencySign = 'accounting';
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore https://github.com/microsoft/TypeScript/issues/46712
            opt.signDisplay = 'exceptZero';
            break;
    }
    return opt;
}

function parseAffixToken(src, pos, onError) {
    const char = src[pos];
    switch (char) {
        case '%':
            return { char: '%', style: 'percent', width: 1 };
        case '‰':
            return { char: '%', style: 'permille', width: 1 };
        case '¤': {
            let width = 1;
            while (src[++pos] === '¤')
                ++width;
            switch (width) {
                case 1:
                    return { char, currency: 'default', width };
                case 2:
                    return { char, currency: 'iso-code', width };
                case 3:
                    return { char, currency: 'full-name', width };
                case 5:
                    return { char, currency: 'narrow', width };
                default: {
                    const msg = `Invalid number (${width}) of ¤ chars in pattern`;
                    onError(new PatternError('¤', msg));
                    return null;
                }
            }
        }
        case '*': {
            const pad = src[pos + 1];
            if (pad)
                return { char, pad, width: 2 };
            break;
        }
        case '+':
        case '-':
            return { char, width: 1 };
        case "'": {
            let str = src[++pos];
            let width = 2;
            if (str === "'")
                return { char, str, width };
            while (true) {
                const next = src[++pos];
                ++width;
                if (next === undefined) {
                    const msg = `Unterminated quoted literal in pattern: ${str}`;
                    onError(new PatternError("'", msg));
                    return { char, str, width };
                }
                else if (next === "'") {
                    if (src[++pos] !== "'")
                        return { char, str, width };
                    else
                        ++width;
                }
                str += next;
            }
        }
    }
    return null;
}

const isDigit = (char) => char >= '0' && char <= '9';
function parseNumberToken(src, pos) {
    const char = src[pos];
    if (isDigit(char)) {
        let digits = char;
        while (true) {
            const next = src[++pos];
            if (isDigit(next))
                digits += next;
            else
                return { char: '0', digits, width: digits.length };
        }
    }
    switch (char) {
        case '#': {
            let width = 1;
            while (src[++pos] === '#')
                ++width;
            return { char, width };
        }
        case '@': {
            let min = 1;
            while (src[++pos] === '@')
                ++min;
            let width = min;
            pos -= 1;
            while (src[++pos] === '#')
                ++width;
            return { char, min, width };
        }
        case 'E': {
            const plus = src[pos + 1] === '+';
            if (plus)
                ++pos;
            let expDigits = 0;
            while (src[++pos] === '0')
                ++expDigits;
            const width = (plus ? 2 : 1) + expDigits;
            if (expDigits)
                return { char, expDigits, plus, width };
            else
                break;
        }
        case '.':
        case ',':
            return { char, width: 1 };
    }
    return null;
}

function parseSubpattern(src, pos, onError) {
    let State;
    (function (State) {
        State[State["Prefix"] = 0] = "Prefix";
        State[State["Number"] = 1] = "Number";
        State[State["Suffix"] = 2] = "Suffix";
    })(State || (State = {}));
    const prefix = [];
    const number = [];
    const suffix = [];
    let state = State.Prefix;
    let str = '';
    while (pos < src.length) {
        const char = src[pos];
        if (char === ';') {
            pos += 1;
            break;
        }
        switch (state) {
            case State.Prefix: {
                const token = parseAffixToken(src, pos, onError);
                if (token) {
                    if (str) {
                        prefix.push({ char: "'", str, width: str.length });
                        str = '';
                    }
                    prefix.push(token);
                    pos += token.width;
                }
                else {
                    const token = parseNumberToken(src, pos);
                    if (token) {
                        if (str) {
                            prefix.push({ char: "'", str, width: str.length });
                            str = '';
                        }
                        state = State.Number;
                        number.push(token);
                        pos += token.width;
                    }
                    else {
                        str += char;
                        pos += 1;
                    }
                }
                break;
            }
            case State.Number: {
                const token = parseNumberToken(src, pos);
                if (token) {
                    number.push(token);
                    pos += token.width;
                }
                else {
                    state = State.Suffix;
                }
                break;
            }
            case State.Suffix: {
                const token = parseAffixToken(src, pos, onError);
                if (token) {
                    if (str) {
                        suffix.push({ char: "'", str, width: str.length });
                        str = '';
                    }
                    suffix.push(token);
                    pos += token.width;
                }
                else {
                    str += char;
                    pos += 1;
                }
                break;
            }
        }
    }
    if (str)
        suffix.push({ char: "'", str, width: str.length });
    return { pattern: { prefix, number, suffix }, pos };
}
function parseTokens(src, onError) {
    const { pattern, pos } = parseSubpattern(src, 0, onError);
    if (pos < src.length) {
        const { pattern: negative } = parseSubpattern(src, pos, onError);
        return { tokens: pattern, negative };
    }
    return { tokens: pattern };
}

function parseNumberAsSkeleton(tokens, onError) {
    const res = {};
    let hasGroups = false;
    let hasExponent = false;
    let intOptional = 0;
    let intDigits = '';
    let decimalPos = -1;
    let fracDigits = '';
    let fracOptional = 0;
    for (let pos = 0; pos < tokens.length; ++pos) {
        const token = tokens[pos];
        switch (token.char) {
            case '#': {
                if (decimalPos === -1) {
                    if (intDigits) {
                        const msg = 'Pattern has # after integer digits';
                        onError(new PatternError('#', msg));
                    }
                    intOptional += token.width;
                }
                else {
                    fracOptional += token.width;
                }
                break;
            }
            case '0': {
                if (decimalPos === -1) {
                    intDigits += token.digits;
                }
                else {
                    if (fracOptional) {
                        const msg = 'Pattern has digits after # in fraction';
                        onError(new PatternError('0', msg));
                    }
                    fracDigits += token.digits;
                }
                break;
            }
            case '@': {
                if (res.precision)
                    onError(new MaskedValueError('precision', res.precision));
                res.precision = {
                    style: 'precision-fraction',
                    minSignificant: token.min,
                    maxSignificant: token.width
                };
                break;
            }
            case ',':
                hasGroups = true;
                break;
            case '.':
                if (decimalPos === 1) {
                    const msg = 'Pattern has more than one decimal separator';
                    onError(new PatternError('.', msg));
                }
                decimalPos = pos;
                break;
            case 'E': {
                if (hasExponent)
                    onError(new MaskedValueError('exponent', res.notation));
                if (hasGroups) {
                    const msg = 'Exponential patterns may not contain grouping separators';
                    onError(new PatternError('E', msg));
                }
                res.notation = { style: 'scientific' };
                if (token.expDigits > 1)
                    res.notation.expDigits = token.expDigits;
                if (token.plus)
                    res.notation.expSign = 'sign-always';
                hasExponent = true;
            }
        }
    }
    // imprecise mapping due to paradigm differences
    if (hasGroups)
        res.group = 'group-auto';
    else if (intOptional + intDigits.length > 3)
        res.group = 'group-off';
    const increment = Number(`${intDigits || '0'}.${fracDigits}`);
    if (increment)
        res.precision = { style: 'precision-increment', increment };
    if (!hasExponent) {
        if (intDigits.length > 1)
            res.integerWidth = { min: intDigits.length };
        if (!res.precision && (fracDigits.length || fracOptional)) {
            res.precision = {
                style: 'precision-fraction',
                minFraction: fracDigits.length,
                maxFraction: fracDigits.length + fracOptional
            };
        }
    }
    else {
        if (!res.precision || increment) {
            res.integerWidth = intOptional
                ? { min: 1, max: intOptional + intDigits.length }
                : { min: Math.max(1, intDigits.length) };
        }
        if (res.precision) {
            if (!increment)
                res.integerWidth = { min: 1, max: 1 };
        }
        else {
            const dc = intDigits.length + fracDigits.length;
            if (decimalPos === -1) {
                if (dc > 0)
                    res.precision = { style: 'precision-fraction', maxSignificant: dc };
            }
            else {
                res.precision = {
                    style: 'precision-fraction',
                    maxSignificant: Math.max(1, dc) + fracOptional
                };
                if (dc > 1)
                    res.precision.minSignificant = dc;
            }
        }
    }
    return res;
}

function handleAffix(affixTokens, res, currency, onError, isPrefix) {
    let inFmt = false;
    let str = '';
    for (const token of affixTokens) {
        switch (token.char) {
            case '%':
                res.unit = { style: token.style };
                if (isPrefix)
                    inFmt = true;
                else
                    str = '';
                break;
            case '¤':
                if (!currency) {
                    const msg = `The ¤ pattern requires a currency`;
                    onError(new PatternError('¤', msg));
                    break;
                }
                res.unit = { style: 'currency', currency };
                switch (token.currency) {
                    case 'iso-code':
                        res.unitWidth = 'unit-width-iso-code';
                        break;
                    case 'full-name':
                        res.unitWidth = 'unit-width-full-name';
                        break;
                    case 'narrow':
                        res.unitWidth = 'unit-width-narrow';
                        break;
                }
                if (isPrefix)
                    inFmt = true;
                else
                    str = '';
                break;
            case '*':
                // TODO
                break;
            case '+':
                if (!inFmt)
                    str += '+';
                break;
            case "'":
                if (!inFmt)
                    str += token.str;
                break;
        }
    }
    return str;
}
function getNegativeAffix(affixTokens, isPrefix) {
    let inFmt = false;
    let str = '';
    for (const token of affixTokens) {
        switch (token.char) {
            case '%':
            case '¤':
                if (isPrefix)
                    inFmt = true;
                else
                    str = '';
                break;
            case '-':
                if (!inFmt)
                    str += '-';
                break;
            case "'":
                if (!inFmt)
                    str += token.str;
                break;
        }
    }
    return str;
}
/**
 * Parse an {@link
 * http://unicode.org/reports/tr35/tr35-numbers.html#Number_Format_Patterns |
 * ICU NumberFormatter pattern} string into a {@link Skeleton} structure.
 *
 * @public
 * @param src - The pattern string
 * @param currency - If the pattern includes ¤ tokens, their skeleton
 *   representation requires a three-letter currency code.
 * @param onError - Called when the parser encounters a syntax error. The
 *   function will still return a {@link Skeleton}, but it will be incomplete
 *   and/or inaccurate. If not defined, the error will be thrown instead.
 *
 * @remarks
 * Unlike the skeleton parser, the pattern parser is not able to return partial
 * results on error, and will instead throw. Output padding is not supported.
 *
 * @example
 * ```js
 * import { parseNumberPattern } from '@messageformat/number-skeleton'
 *
 * parseNumberPattern('#,##0.00 ¤', 'EUR', console.error)
 * // {
 * //   group: 'group-auto',
 * //   precision: {
 * //     style: 'precision-fraction',
 * //     minFraction: 2,
 * //     maxFraction: 2
 * //   },
 * //   unit: { style: 'currency', currency: 'EUR' }
 * // }
 * ```
 */
function parseNumberPattern(src, currency, onError = error => {
    throw error;
}) {
    const { tokens, negative } = parseTokens(src, onError);
    const res = parseNumberAsSkeleton(tokens.number, onError);
    const prefix = handleAffix(tokens.prefix, res, currency, onError, true);
    const suffix = handleAffix(tokens.suffix, res, currency, onError, false);
    if (negative) {
        const negPrefix = getNegativeAffix(negative.prefix, true);
        const negSuffix = getNegativeAffix(negative.suffix, false);
        res.affix = { pos: [prefix, suffix], neg: [negPrefix, negSuffix] };
        res.sign = 'sign-never';
    }
    else if (prefix || suffix) {
        res.affix = { pos: [prefix, suffix] };
    }
    return res;
}

/** @internal */
function isNumberingSystem(ns) {
    const systems = [
        'arab',
        'arabext',
        'bali',
        'beng',
        'deva',
        'fullwide',
        'gujr',
        'guru',
        'hanidec',
        'khmr',
        'knda',
        'laoo',
        'latn',
        'limb',
        'mlym',
        'mong',
        'mymr',
        'orya',
        'tamldec',
        'telu',
        'thai',
        'tibt'
    ];
    return systems.indexOf(ns) !== -1;
}

// FIXME: subtype is not checked
/** @internal */
function isUnit(unit) {
    const types = [
        'acceleration',
        'angle',
        'area',
        'concentr',
        'consumption',
        'digital',
        'duration',
        'electric',
        'energy',
        'force',
        'frequency',
        'graphics',
        'length',
        'light',
        'mass',
        'power',
        'pressure',
        'speed',
        'temperature',
        'torque',
        'volume'
    ];
    const [type] = unit.split('-', 1);
    return types.indexOf(type) !== -1;
}

const maxOptions = {
    'compact-short': 0,
    'compact-long': 0,
    'notation-simple': 0,
    scientific: 2,
    engineering: 2,
    percent: 0,
    permille: 0,
    'base-unit': 0,
    currency: 1,
    'measure-unit': 1,
    'per-measure-unit': 1,
    'unit-width-narrow': 0,
    'unit-width-short': 0,
    'unit-width-full-name': 0,
    'unit-width-iso-code': 0,
    'unit-width-hidden': 0,
    'precision-integer': 0,
    'precision-unlimited': 0,
    'precision-currency-standard': 1,
    'precision-currency-cash': 0,
    'precision-increment': 1,
    'rounding-mode-ceiling': 0,
    'rounding-mode-floor': 0,
    'rounding-mode-down': 0,
    'rounding-mode-up': 0,
    'rounding-mode-half-even': 0,
    'rounding-mode-half-down': 0,
    'rounding-mode-half-up': 0,
    'rounding-mode-unnecessary': 0,
    'integer-width': 1,
    scale: 1,
    'group-off': 0,
    'group-min2': 0,
    'group-auto': 0,
    'group-on-aligned': 0,
    'group-thousands': 0,
    latin: 0,
    'numbering-system': 1,
    'sign-auto': 0,
    'sign-always': 0,
    'sign-never': 0,
    'sign-accounting': 0,
    'sign-accounting-always': 0,
    'sign-except-zero': 0,
    'sign-accounting-except-zero': 0,
    'decimal-auto': 0,
    'decimal-always': 0
};
const minOptions = {
    currency: 1,
    'integer-width': 1,
    'measure-unit': 1,
    'numbering-system': 1,
    'per-measure-unit': 1,
    'precision-increment': 1,
    scale: 1
};
function hasMaxOption(stem) {
    return stem in maxOptions;
}
function hasMinOption(stem) {
    return stem in minOptions;
}
/** @internal */
function validOptions(stem, options, onError) {
    if (hasMaxOption(stem)) {
        const maxOpt = maxOptions[stem];
        if (options.length > maxOpt) {
            if (maxOpt === 0) {
                for (const opt of options)
                    onError(new BadOptionError(stem, opt));
            }
            else {
                onError(new TooManyOptionsError(stem, options, maxOpt));
            }
            return false;
        }
        else if (hasMinOption(stem) && options.length < minOptions[stem]) {
            onError(new MissingOptionError(stem));
            return false;
        }
    }
    return true;
}

function parseBlueprintDigits(src, style) {
    const re = style === 'fraction' ? /^\.(0*)(\+|#*)$/ : /^(@+)(\+|#*)$/;
    const match = src && src.match(re);
    if (match) {
        const min = match[1].length;
        switch (match[2].charAt(0)) {
            case '':
                return { min, max: min };
            case '+':
                return { min, max: null };
            case '#': {
                return { min, max: min + match[2].length };
            }
        }
    }
    return null;
}
function parsePrecisionBlueprint(stem, options, onError) {
    const fd = parseBlueprintDigits(stem, 'fraction');
    if (fd) {
        if (options.length > 1)
            onError(new TooManyOptionsError(stem, options, 1));
        const res = {
            style: 'precision-fraction',
            source: stem,
            minFraction: fd.min
        };
        if (fd.max != null)
            res.maxFraction = fd.max;
        const option = options[0];
        const sd = parseBlueprintDigits(option, 'significant');
        if (sd) {
            res.source = `${stem}/${option}`;
            res.minSignificant = sd.min;
            if (sd.max != null)
                res.maxSignificant = sd.max;
        }
        else if (option)
            onError(new BadOptionError(stem, option));
        return res;
    }
    const sd = parseBlueprintDigits(stem, 'significant');
    if (sd) {
        for (const opt of options)
            onError(new BadOptionError(stem, opt));
        const res = {
            style: 'precision-fraction',
            source: stem,
            minSignificant: sd.min
        };
        if (sd.max != null)
            res.maxSignificant = sd.max;
        return res;
    }
    return null;
}

/** @internal */
class TokenParser {
    constructor(onError) {
        this.skeleton = {};
        this.onError = onError;
    }
    badOption(stem, opt) {
        this.onError(new BadOptionError(stem, opt));
    }
    assertEmpty(key) {
        const prev = this.skeleton[key];
        if (prev)
            this.onError(new MaskedValueError(key, prev));
    }
    parseToken(stem, options) {
        if (!validOptions(stem, options, this.onError))
            return;
        const option = options[0];
        const res = this.skeleton;
        switch (stem) {
            // notation
            case 'compact-short':
            case 'compact-long':
            case 'notation-simple':
                this.assertEmpty('notation');
                res.notation = { style: stem };
                break;
            case 'scientific':
            case 'engineering': {
                let expDigits = null;
                let expSign = undefined;
                for (const opt of options) {
                    switch (opt) {
                        case 'sign-auto':
                        case 'sign-always':
                        case 'sign-never':
                        case 'sign-accounting':
                        case 'sign-accounting-always':
                        case 'sign-except-zero':
                        case 'sign-accounting-except-zero':
                            expSign = opt;
                            break;
                        default:
                            if (/^\+e+$/.test(opt))
                                expDigits = opt.length - 1;
                            else {
                                this.badOption(stem, opt);
                            }
                    }
                }
                this.assertEmpty('notation');
                const source = options.join('/');
                res.notation =
                    expDigits && expSign
                        ? { style: stem, source, expDigits, expSign }
                        : expDigits
                            ? { style: stem, source, expDigits }
                            : expSign
                                ? { style: stem, source, expSign }
                                : { style: stem, source };
                break;
            }
            // unit
            case 'percent':
            case 'permille':
            case 'base-unit':
                this.assertEmpty('unit');
                res.unit = { style: stem };
                break;
            case 'currency':
                if (/^[A-Z]{3}$/.test(option)) {
                    this.assertEmpty('unit');
                    res.unit = { style: stem, currency: option };
                }
                else
                    this.badOption(stem, option);
                break;
            case 'measure-unit': {
                if (isUnit(option)) {
                    this.assertEmpty('unit');
                    res.unit = { style: stem, unit: option };
                }
                else
                    this.badOption(stem, option);
                break;
            }
            // unitPer
            case 'per-measure-unit': {
                if (isUnit(option)) {
                    this.assertEmpty('unitPer');
                    res.unitPer = option;
                }
                else
                    this.badOption(stem, option);
                break;
            }
            // unitWidth
            case 'unit-width-narrow':
            case 'unit-width-short':
            case 'unit-width-full-name':
            case 'unit-width-iso-code':
            case 'unit-width-hidden':
                this.assertEmpty('unitWidth');
                res.unitWidth = stem;
                break;
            // precision
            case 'precision-integer':
            case 'precision-unlimited':
            case 'precision-currency-cash':
                this.assertEmpty('precision');
                res.precision = { style: stem };
                break;
            case 'precision-currency-standard':
                this.assertEmpty('precision');
                if (option === 'w') {
                    res.precision = { style: stem, trailingZero: 'stripIfInteger' };
                }
                else {
                    res.precision = { style: stem };
                }
                break;
            case 'precision-increment': {
                const increment = Number(option);
                if (increment > 0) {
                    this.assertEmpty('precision');
                    res.precision = { style: stem, increment };
                }
                else
                    this.badOption(stem, option);
                break;
            }
            // roundingMode
            case 'rounding-mode-ceiling':
            case 'rounding-mode-floor':
            case 'rounding-mode-down':
            case 'rounding-mode-up':
            case 'rounding-mode-half-even':
            case 'rounding-mode-half-odd':
            case 'rounding-mode-half-ceiling':
            case 'rounding-mode-half-floor':
            case 'rounding-mode-half-down':
            case 'rounding-mode-half-up':
            case 'rounding-mode-unnecessary':
                this.assertEmpty('roundingMode');
                res.roundingMode = stem;
                break;
            // integerWidth
            case 'integer-width': {
                if (/^\+0*$/.test(option)) {
                    this.assertEmpty('integerWidth');
                    res.integerWidth = { source: option, min: option.length - 1 };
                }
                else {
                    const m = option.match(/^#*(0*)$/);
                    if (m) {
                        this.assertEmpty('integerWidth');
                        res.integerWidth = {
                            source: option,
                            min: m[1].length,
                            max: m[0].length
                        };
                    }
                    else
                        this.badOption(stem, option);
                }
                break;
            }
            // scale
            case 'scale': {
                const scale = Number(option);
                if (scale > 0) {
                    this.assertEmpty('scale');
                    res.scale = scale;
                }
                else
                    this.badOption(stem, option);
                break;
            }
            // group
            case 'group-off':
            case 'group-min2':
            case 'group-auto':
            case 'group-on-aligned':
            case 'group-thousands':
                this.assertEmpty('group');
                res.group = stem;
                break;
            // numberingSystem
            case 'latin':
                this.assertEmpty('numberingSystem');
                res.numberingSystem = 'latn';
                break;
            case 'numbering-system': {
                if (isNumberingSystem(option)) {
                    this.assertEmpty('numberingSystem');
                    res.numberingSystem = option;
                }
                else
                    this.badOption(stem, option);
                break;
            }
            // sign
            case 'sign-auto':
            case 'sign-always':
            case 'sign-never':
            case 'sign-accounting':
            case 'sign-accounting-always':
            case 'sign-except-zero':
            case 'sign-accounting-except-zero':
                this.assertEmpty('sign');
                res.sign = stem;
                break;
            // decimal
            case 'decimal-auto':
            case 'decimal-always':
                this.assertEmpty('decimal');
                res.decimal = stem;
                break;
            // precision blueprint
            default: {
                const precision = parsePrecisionBlueprint(stem, options, this.onError);
                if (precision) {
                    this.assertEmpty('precision');
                    res.precision = precision;
                }
                else {
                    this.onError(new BadStemError(stem));
                }
            }
        }
    }
}

/**
 * Parse an {@link
 * https://github.com/unicode-org/icu/blob/master/docs/userguide/format_parse/numbers/skeletons.md
 * | ICU NumberFormatter skeleton} string into a {@link Skeleton} structure.
 *
 * @public
 * @param src - The skeleton string
 * @param onError - Called when the parser encounters a syntax error. The
 *   function will still return a {@link Skeleton}, but it may not contain
 *   information for all tokens. If not defined, the error will be thrown
 *   instead.
 *
 * @example
 * ```js
 * import { parseNumberSkeleton } from '@messageformat/number-skeleton'
 *
 * parseNumberSkeleton('compact-short currency/GBP', console.error)
 * // {
 * //   notation: { style: 'compact-short' },
 * //   unit: { style: 'currency', currency: 'GBP' }
 * // }
 * ```
 */
function parseNumberSkeleton(src, onError = error => {
    throw error;
}) {
    const tokens = [];
    for (const part of src.split(' ')) {
        if (part) {
            const options = part.split('/');
            const stem = options.shift() || '';
            tokens.push({ stem, options });
        }
    }
    const parser = new TokenParser(onError);
    for (const { stem, options } of tokens) {
        parser.parseToken(stem, options);
    }
    return parser.skeleton;
}

/**
 * Returns a number formatter function for the given locales and number skeleton
 *
 * @remarks
 * Uses `Intl.NumberFormat` (ES2020) internally.
 *
 * @public
 * @param locales - One or more valid BCP 47 language tags, e.g. `fr` or `en-CA`
 * @param skeleton - An ICU NumberFormatter pattern or `::`-prefixed skeleton
 *   string, or a parsed `Skeleton` structure
 * @param currency - If `skeleton` is a pattern string that includes ¤ tokens,
 *   their skeleton representation requires a three-letter currency code.
 * @param onError - If defined, will be called separately for each encountered
 *   parsing error and unsupported feature.
 * @example
 * ```js
 * import { getNumberFormatter } from '@messageformat/number-skeleton'
 *
 * let src = ':: currency/CAD unit-width-narrow'
 * let fmt = getNumberFormatter('en-CA', src, console.error)
 * fmt(42) // '$42.00'
 *
 * src = '::percent scale/100'
 * fmt = getNumberFormatter('en', src, console.error)
 * fmt(0.3) // '30%'
 * ```
 */
function getNumberFormatter(locales, skeleton, currency, onError) {
    if (typeof skeleton === 'string') {
        skeleton =
            skeleton.indexOf('::') === 0
                ? parseNumberSkeleton(skeleton.slice(2), onError)
                : parseNumberPattern(skeleton, currency, onError);
    }
    const lc = getNumberFormatLocales(locales, skeleton);
    const opt = getNumberFormatOptions(skeleton);
    const mod = getNumberFormatModifier(skeleton);
    const nf = new Intl.NumberFormat(lc, opt);
    if (skeleton.affix) {
        const [p0, p1] = skeleton.affix.pos;
        const [n0, n1] = skeleton.affix.neg || ['', ''];
        return (value) => {
            const n = nf.format(mod(value));
            return value < 0 ? `${n0}${n}${n1}` : `${p0}${n}${p1}`;
        };
    }
    return (value) => nf.format(mod(value));
}
/**
 * Returns a string of JavaScript source that evaluates to a number formatter
 * function with the same `(value: number) => string` signature as the function
 * returned by {@link getNumberFormatter}.
 *
 * @remarks
 * The returned function will memoize an `Intl.NumberFormat` instance.
 *
 * @public
 * @param locales - One or more valid BCP 47 language tags, e.g. `fr` or `en-CA`
 * @param skeleton - An ICU NumberFormatter pattern or `::`-prefixed skeleton
 *   string, or a parsed `Skeleton` structure
 * @param currency - If `skeleton` is a pattern string that includes ¤ tokens,
 *   their skeleton representation requires a three-letter currency code.
 * @param onError - If defined, will be called separately for each encountered
 *   parsing error and unsupported feature.
 * @example
 * ```js
 * import { getNumberFormatterSource } from '@messageformat/number-skeleton'
 *
 * getNumberFormatterSource('en', '::percent', console.error)
 * // '(function() {\n' +
 * // '  var opt = {"style":"percent"};\n' +
 * // '  var nf = new Intl.NumberFormat(["en"], opt);\n' +
 * // '  var mod = function(n) { return n * 0.01; };\n' +
 * // '  return function(value) { return nf.format(mod(value)); }\n' +
 * // '})()'
 *
 * const src = getNumberFormatterSource('en-CA', ':: currency/CAD unit-width-narrow', console.error)
 * // '(function() {\n' +
 * // '  var opt = {"style":"currency","currency":"CAD","currencyDisplay":"narrowSymbol","unitDisplay":"narrow"};\n' +
 * // '  var nf = new Intl.NumberFormat(["en-CA"], opt);\n'
 * // '  return function(value) { return nf.format(value); }\n' +
 * // '})()'
 * const fmt = new Function(`return ${src}`)()
 * fmt(42) // '$42.00'
 * ```
 */
function getNumberFormatterSource(locales, skeleton, currency, onError) {
    if (typeof skeleton === 'string') {
        skeleton =
            skeleton.indexOf('::') === 0
                ? parseNumberSkeleton(skeleton.slice(2), onError)
                : parseNumberPattern(skeleton, currency, onError);
    }
    const lc = getNumberFormatLocales(locales, skeleton);
    const opt = getNumberFormatOptions(skeleton);
    const modSrc = getNumberFormatModifierSource(skeleton);
    const lines = [
        `(function() {`,
        `var opt = ${JSON.stringify(opt)};`,
        `var nf = new Intl.NumberFormat(${JSON.stringify(lc)}, opt);`
    ];
    let res = 'nf.format(value)';
    if (modSrc) {
        lines.push(`var mod = ${modSrc};`);
        res = 'nf.format(mod(value))';
    }
    if (skeleton.affix) {
        const [p0, p1] = skeleton.affix.pos.map(s => JSON.stringify(s));
        if (skeleton.affix.neg) {
            const [n0, n1] = skeleton.affix.neg.map(s => JSON.stringify(s));
            res = `value < 0 ? ${n0} + ${res} + ${n1} : ${p0} + ${res} + ${p1}`;
        }
        else {
            res = `${p0} + ${res} + ${p1}`;
        }
    }
    lines.push(`return function(value) { return ${res}; }`);
    return lines.join('\n  ') + '\n})()';
}

const rtlLanguages = [
    'ar',
    'ckb',
    'fa',
    'he',
    'ks($|[^bfh])',
    'lrc',
    'mzn',
    'pa-Arab',
    'ps',
    'ug',
    'ur',
    'uz-Arab',
    'yi'
];
const rtlRegExp = new RegExp('^' + rtlLanguages.join('|^'));
function biDiMarkText(text, locale) {
    const isLocaleRTL = rtlRegExp.test(locale);
    const mark = JSON.stringify(isLocaleRTL ? '\u200F' : '\u200E');
    return `${mark} + ${text} + ${mark}`;
}

const RUNTIME_MODULE = '@messageformat/runtime';
const CARDINAL_MODULE = '@messageformat/runtime/lib/cardinals';
const PLURAL_MODULE = '@messageformat/runtime/lib/plurals';
const FORMATTER_MODULE = '@messageformat/runtime/lib/formatters';
let Compiler$1 = class Compiler {
    constructor(options) {
        this.arguments = [];
        this.runtime = {};
        this.options = options;
    }
    compile(src, plural, plurals) {
        const { localeCodeFromKey, requireAllArguments, strict, strictPluralKeys } = this.options;
        if (typeof src === 'object') {
            const result = {};
            for (const key of Object.keys(src)) {
                const lc = localeCodeFromKey ? localeCodeFromKey(key) : key;
                const pl = (plurals && lc && plurals[lc]) || plural;
                result[key] = this.compile(src[key], pl, plurals);
            }
            return result;
        }
        this.plural = plural;
        const parserOptions = {
            cardinal: plural.cardinals,
            ordinal: plural.ordinals,
            strict,
            strictPluralKeys
        };
        this.arguments = [];
        const r = parser.parse(src, parserOptions).map(token => this.token(token, null));
        const hasArgs = this.arguments.length > 0;
        const res = this.concatenate(r, true);
        if (requireAllArguments && hasArgs) {
            this.setRuntimeFn('reqArgs');
            const reqArgs = JSON.stringify(this.arguments);
            return `(d) => { reqArgs(${reqArgs}, d); return ${res}; }`;
        }
        return `(${hasArgs ? 'd' : ''}) => ${res}`;
    }
    cases(token, pluralToken) {
        let needOther = true;
        const r = token.cases.map(({ key, tokens }) => {
            if (key === 'other')
                needOther = false;
            const s = tokens.map(tok => this.token(tok, pluralToken));
            return `${safeIdentifier$1.property(null, key.replace(/^=/, ''))}: ${this.concatenate(s, false)}`;
        });
        if (needOther) {
            const { type } = token;
            const { cardinals, ordinals } = this.plural;
            if (type === 'select' ||
                (type === 'plural' && cardinals.includes('other')) ||
                (type === 'selectordinal' && ordinals.includes('other')))
                throw new Error(`No 'other' form found in ${JSON.stringify(token)}`);
        }
        return `{ ${r.join(', ')} }`;
    }
    concatenate(tokens, root) {
        const asValues = this.options.returnType === 'values';
        return asValues && (root || tokens.length > 1)
            ? '[' + tokens.join(', ') + ']'
            : tokens.join(' + ') || '""';
    }
    token(token, pluralToken) {
        if (token.type === 'content')
            return JSON.stringify(token.value);
        const { id, lc } = this.plural;
        let args, fn;
        if ('arg' in token) {
            this.arguments.push(token.arg);
            args = [safeIdentifier$1.property('d', token.arg)];
        }
        else
            args = [];
        switch (token.type) {
            case 'argument':
                return this.options.biDiSupport
                    ? biDiMarkText(String(args[0]), lc)
                    : String(args[0]);
            case 'select':
                fn = 'select';
                if (pluralToken && this.options.strict)
                    pluralToken = null;
                args.push(this.cases(token, pluralToken));
                this.setRuntimeFn('select');
                break;
            case 'selectordinal':
                fn = 'plural';
                args.push(token.pluralOffset || 0, id, this.cases(token, token), 1);
                this.setLocale(id, true);
                this.setRuntimeFn('plural');
                break;
            case 'plural':
                fn = 'plural';
                args.push(token.pluralOffset || 0, id, this.cases(token, token));
                this.setLocale(id, false);
                this.setRuntimeFn('plural');
                break;
            case 'function':
                if (!this.options.customFormatters[token.key]) {
                    if (token.key === 'date') {
                        fn = this.setDateFormatter(token, args, pluralToken);
                        break;
                    }
                    else if (token.key === 'number') {
                        fn = this.setNumberFormatter(token, args, pluralToken);
                        break;
                    }
                }
                args.push(JSON.stringify(this.plural.locale));
                if (token.param) {
                    if (pluralToken && this.options.strict)
                        pluralToken = null;
                    const arg = this.getFormatterArg(token, pluralToken);
                    if (arg)
                        args.push(arg);
                }
                fn = token.key;
                this.setFormatter(fn);
                break;
            case 'octothorpe':
                if (!pluralToken)
                    return '"#"';
                args = [
                    JSON.stringify(this.plural.locale),
                    safeIdentifier$1.property('d', pluralToken.arg),
                    pluralToken.pluralOffset || 0
                ];
                if (this.options.strict) {
                    fn = 'strictNumber';
                    args.push(JSON.stringify(pluralToken.arg));
                    this.setRuntimeFn('strictNumber');
                }
                else {
                    fn = 'number';
                    this.setRuntimeFn('number');
                }
                break;
        }
        if (!fn)
            throw new Error('Parser error for token ' + JSON.stringify(token));
        return `${fn}(${args.join(', ')})`;
    }
    runtimeIncludes(key, type) {
        if (safeIdentifier$1.identifier(key) !== key)
            throw new SyntaxError(`Reserved word used as ${type} identifier: ${key}`);
        const prev = this.runtime[key];
        if (!prev || prev.type === type)
            return prev;
        throw new TypeError(`Cannot override ${prev.type} runtime function as ${type}: ${key}`);
    }
    setLocale(key, ord) {
        const prev = this.runtimeIncludes(key, 'locale');
        const { getCardinal, getPlural, isDefault } = this.plural;
        let pf, module, toString;
        if (!ord && isDefault && getCardinal) {
            if (prev)
                return;
            pf = (n) => getCardinal(n);
            module = CARDINAL_MODULE;
            toString = () => String(getCardinal);
        }
        else {
            if (prev && (!isDefault || prev.module === PLURAL_MODULE))
                return;
            pf = (n, ord) => getPlural(n, ord);
            module = isDefault ? PLURAL_MODULE : getPlural.module || null;
            toString = () => String(getPlural);
        }
        this.runtime[key] = Object.assign(pf, {
            id: key,
            module,
            toString,
            type: 'locale'
        });
    }
    setRuntimeFn(key) {
        if (this.runtimeIncludes(key, 'runtime'))
            return;
        this.runtime[key] = Object.assign(Runtime__namespace[key], {
            id: key,
            module: RUNTIME_MODULE,
            type: 'runtime'
        });
    }
    getFormatterArg({ key, param }, pluralToken) {
        const fmt = this.options.customFormatters[key] ||
            (isFormatterKey(key) && Formatters__namespace[key]);
        if (!fmt || !param)
            return null;
        const argShape = ('arg' in fmt && fmt.arg) || 'string';
        if (argShape === 'options') {
            let value = '';
            for (const tok of param) {
                if (tok.type === 'content')
                    value += tok.value;
                else
                    throw new SyntaxError(`Expected literal options for ${key} formatter`);
            }
            const options = {};
            for (const pair of value.split(',')) {
                const keyEnd = pair.indexOf(':');
                if (keyEnd === -1)
                    options[pair.trim()] = null;
                else {
                    const k = pair.substring(0, keyEnd).trim();
                    const v = pair.substring(keyEnd + 1).trim();
                    if (v === 'true')
                        options[k] = true;
                    else if (v === 'false')
                        options[k] = false;
                    else if (v === 'null')
                        options[k] = null;
                    else {
                        const n = Number(v);
                        options[k] = Number.isFinite(n) ? n : v;
                    }
                }
            }
            return JSON.stringify(options);
        }
        else {
            const parts = param.map(tok => this.token(tok, pluralToken));
            if (argShape === 'raw')
                return `[${parts.join(', ')}]`;
            const s = parts.join(' + ');
            return s ? `(${s}).trim()` : '""';
        }
    }
    setFormatter(key) {
        if (this.runtimeIncludes(key, 'formatter'))
            return;
        let cf = this.options.customFormatters[key];
        if (cf) {
            if (typeof cf === 'function')
                cf = { formatter: cf };
            this.runtime[key] = Object.assign(cf.formatter, { type: 'formatter' }, 'module' in cf && cf.module && cf.id
                ? { id: safeIdentifier$1.identifier(cf.id), module: cf.module }
                : { id: null, module: null });
        }
        else if (isFormatterKey(key)) {
            this.runtime[key] = Object.assign(Formatters__namespace[key], { type: 'formatter' }, { id: key, module: FORMATTER_MODULE });
        }
        else {
            throw new Error(`Formatting function not found: ${key}`);
        }
    }
    setDateFormatter({ param }, args, plural) {
        const { locale } = this.plural;
        const argStyle = param && param.length === 1 && param[0];
        if (argStyle &&
            argStyle.type === 'content' &&
            /^\s*::/.test(argStyle.value)) {
            const argSkeletonText = argStyle.value.trim().substr(2);
            const key = safeIdentifier$1.identifier(`date_${locale}_${argSkeletonText}`, true);
            if (!this.runtimeIncludes(key, 'formatter')) {
                const fmt = getDateFormatter(locale, argSkeletonText);
                this.runtime[key] = Object.assign(fmt, {
                    id: key,
                    module: null,
                    toString: () => getDateFormatterSource(locale, argSkeletonText),
                    type: 'formatter'
                });
            }
            return key;
        }
        args.push(JSON.stringify(locale));
        if (param && param.length > 0) {
            if (plural && this.options.strict)
                plural = null;
            const s = param.map(tok => this.token(tok, plural));
            args.push('(' + (s.join(' + ') || '""') + ').trim()');
        }
        this.setFormatter('date');
        return 'date';
    }
    setNumberFormatter({ param }, args, plural) {
        const { locale } = this.plural;
        if (!param || param.length === 0) {
            args.unshift(JSON.stringify(locale));
            args.push('0');
            this.setRuntimeFn('number');
            return 'number';
        }
        args.push(JSON.stringify(locale));
        if (param.length === 1 && param[0].type === 'content') {
            const fmtArg = param[0].value.trim();
            switch (fmtArg) {
                case 'currency':
                    args.push(JSON.stringify(this.options.currency));
                    this.setFormatter('numberCurrency');
                    return 'numberCurrency';
                case 'integer':
                    this.setFormatter('numberInteger');
                    return 'numberInteger';
                case 'percent':
                    this.setFormatter('numberPercent');
                    return 'numberPercent';
            }
            const cm = fmtArg.match(/^currency:([A-Z]+)$/);
            if (cm) {
                args.push(JSON.stringify(cm[1]));
                this.setFormatter('numberCurrency');
                return 'numberCurrency';
            }
            const key = safeIdentifier$1.identifier(`number_${locale}_${fmtArg}`, true);
            if (!this.runtimeIncludes(key, 'formatter')) {
                const { currency } = this.options;
                const fmt = getNumberFormatter(locale, fmtArg, currency);
                this.runtime[key] = Object.assign(fmt, {
                    id: null,
                    module: null,
                    toString: () => getNumberFormatterSource(locale, fmtArg, currency),
                    type: 'formatter'
                });
            }
            return key;
        }
        if (plural && this.options.strict)
            plural = null;
        const s = param.map(tok => this.token(tok, plural));
        args.push('(' + (s.join(' + ') || '""') + ').trim()');
        args.push(JSON.stringify(this.options.currency));
        this.setFormatter('numberFmt');
        return 'numberFmt';
    }
};
function isFormatterKey(key) {
    return key in Formatters__namespace;
}

var compiler = Compiler$1;

var cardinals = {exports: {}};

(function (module, exports) {
	const a = (n) => n == 1 ? 'one' : 'other';
	const b = (n) => (n == 0 || n == 1) ? 'one' : 'other';
	const c = (n) => n >= 0 && n <= 1 ? 'one' : 'other';
	const d = (n) => {
	  const s = String(n).split('.'), v0 = !s[1];
	  return n == 1 && v0 ? 'one' : 'other';
	};
	const e = (n) => 'other';
	const f = (n) => n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : 'other';

	(function (root, plurals) {
	  Object.defineProperty(plurals, '__esModule', { value: true });
	  module.exports = plurals;
	}(commonjsGlobal, {
	af: a,

	ak: b,

	am: c,

	an: a,

	ar: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (n100 >= 3 && n100 <= 10) ? 'few'
	    : (n100 >= 11 && n100 <= 99) ? 'many'
	    : 'other';
	},

	ars: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (n100 >= 3 && n100 <= 10) ? 'few'
	    : (n100 >= 11 && n100 <= 99) ? 'many'
	    : 'other';
	},

	as: c,

	asa: a,

	ast: d,

	az: a,

	bal: a,

	be: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  return n10 == 1 && n100 != 11 ? 'one'
	    : (n10 >= 2 && n10 <= 4) && (n100 < 12 || n100 > 14) ? 'few'
	    : t0 && n10 == 0 || (n10 >= 5 && n10 <= 9) || (n100 >= 11 && n100 <= 14) ? 'many'
	    : 'other';
	},

	bem: a,

	bez: a,

	bg: a,

	bho: b,

	bm: e,

	bn: c,

	bo: e,

	br: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), n1000000 = t0 && s[0].slice(-6);
	  return n10 == 1 && n100 != 11 && n100 != 71 && n100 != 91 ? 'one'
	    : n10 == 2 && n100 != 12 && n100 != 72 && n100 != 92 ? 'two'
	    : ((n10 == 3 || n10 == 4) || n10 == 9) && (n100 < 10 || n100 > 19) && (n100 < 70 || n100 > 79) && (n100 < 90 || n100 > 99) ? 'few'
	    : n != 0 && t0 && n1000000 == 0 ? 'many'
	    : 'other';
	},

	brx: a,

	bs: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	ca: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	ce: a,

	ceb: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), f10 = f.slice(-1);
	  return v0 && (i == 1 || i == 2 || i == 3) || v0 && i10 != 4 && i10 != 6 && i10 != 9 || !v0 && f10 != 4 && f10 != 6 && f10 != 9 ? 'one' : 'other';
	},

	cgg: a,

	chr: a,

	ckb: a,

	cs: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1];
	  return n == 1 && v0 ? 'one'
	    : (i >= 2 && i <= 4) && v0 ? 'few'
	    : !v0 ? 'many'
	    : 'other';
	},

	cy: (n) => n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : n == 3 ? 'few'
	    : n == 6 ? 'many'
	    : 'other',

	da: (n) => {
	  const s = String(n).split('.'), i = s[0], t0 = Number(s[0]) == n;
	  return n == 1 || !t0 && (i == 0 || i == 1) ? 'one' : 'other';
	},

	de: d,

	doi: c,

	dsb: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i100 = i.slice(-2), f100 = f.slice(-2);
	  return v0 && i100 == 1 || f100 == 1 ? 'one'
	    : v0 && i100 == 2 || f100 == 2 ? 'two'
	    : v0 && (i100 == 3 || i100 == 4) || (f100 == 3 || f100 == 4) ? 'few'
	    : 'other';
	},

	dv: a,

	dz: e,

	ee: a,

	el: a,

	en: d,

	eo: a,

	es: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return n == 1 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	et: d,

	eu: a,

	fa: c,

	ff: (n) => n >= 0 && n < 2 ? 'one' : 'other',

	fi: d,

	fil: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), f10 = f.slice(-1);
	  return v0 && (i == 1 || i == 2 || i == 3) || v0 && i10 != 4 && i10 != 6 && i10 != 9 || !v0 && f10 != 4 && f10 != 6 && f10 != 9 ? 'one' : 'other';
	},

	fo: a,

	fr: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return n >= 0 && n < 2 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	fur: a,

	fy: d,

	ga: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  return n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (t0 && n >= 3 && n <= 6) ? 'few'
	    : (t0 && n >= 7 && n <= 10) ? 'many'
	    : 'other';
	},

	gd: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  return (n == 1 || n == 11) ? 'one'
	    : (n == 2 || n == 12) ? 'two'
	    : ((t0 && n >= 3 && n <= 10) || (t0 && n >= 13 && n <= 19)) ? 'few'
	    : 'other';
	},

	gl: d,

	gsw: a,

	gu: c,

	guw: b,

	gv: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  return v0 && i10 == 1 ? 'one'
	    : v0 && i10 == 2 ? 'two'
	    : v0 && (i100 == 0 || i100 == 20 || i100 == 40 || i100 == 60 || i100 == 80) ? 'few'
	    : !v0 ? 'many'
	    : 'other';
	},

	ha: a,

	haw: a,

	he: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1];
	  return i == 1 && v0 || i == 0 && !v0 ? 'one'
	    : i == 2 && v0 ? 'two'
	    : 'other';
	},

	hi: c,

	hnj: e,

	hr: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	hsb: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i100 = i.slice(-2), f100 = f.slice(-2);
	  return v0 && i100 == 1 || f100 == 1 ? 'one'
	    : v0 && i100 == 2 || f100 == 2 ? 'two'
	    : v0 && (i100 == 3 || i100 == 4) || (f100 == 3 || f100 == 4) ? 'few'
	    : 'other';
	},

	hu: a,

	hy: (n) => n >= 0 && n < 2 ? 'one' : 'other',

	ia: d,

	id: e,

	ig: e,

	ii: e,

	io: d,

	is: (n) => {
	  const s = String(n).split('.'), i = s[0], t = (s[1] || '').replace(/0+$/, ''), t0 = Number(s[0]) == n, i10 = i.slice(-1), i100 = i.slice(-2);
	  return t0 && i10 == 1 && i100 != 11 || t % 10 == 1 && t % 100 != 11 ? 'one' : 'other';
	},

	it: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	iu: f,

	ja: e,

	jbo: e,

	jgo: a,

	jmc: a,

	jv: e,

	jw: e,

	ka: a,

	kab: (n) => n >= 0 && n < 2 ? 'one' : 'other',

	kaj: a,

	kcg: a,

	kde: e,

	kea: e,

	kk: a,

	kkj: a,

	kl: a,

	km: e,

	kn: c,

	ko: e,

	ks: a,

	ksb: a,

	ksh: (n) => n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : 'other',

	ku: a,

	kw: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2), n1000 = t0 && s[0].slice(-3), n100000 = t0 && s[0].slice(-5), n1000000 = t0 && s[0].slice(-6);
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : (n100 == 2 || n100 == 22 || n100 == 42 || n100 == 62 || n100 == 82) || t0 && n1000 == 0 && ((n100000 >= 1000 && n100000 <= 20000) || n100000 == 40000 || n100000 == 60000 || n100000 == 80000) || n != 0 && n1000000 == 100000 ? 'two'
	    : (n100 == 3 || n100 == 23 || n100 == 43 || n100 == 63 || n100 == 83) ? 'few'
	    : n != 1 && (n100 == 1 || n100 == 21 || n100 == 41 || n100 == 61 || n100 == 81) ? 'many'
	    : 'other';
	},

	ky: a,

	lag: (n) => {
	  const s = String(n).split('.'), i = s[0];
	  return n == 0 ? 'zero'
	    : (i == 0 || i == 1) && n != 0 ? 'one'
	    : 'other';
	},

	lb: a,

	lg: a,

	lij: d,

	lkt: e,

	ln: b,

	lo: e,

	lt: (n) => {
	  const s = String(n).split('.'), f = s[1] || '', t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  return n10 == 1 && (n100 < 11 || n100 > 19) ? 'one'
	    : (n10 >= 2 && n10 <= 9) && (n100 < 11 || n100 > 19) ? 'few'
	    : f != 0 ? 'many'
	    : 'other';
	},

	lv: (n) => {
	  const s = String(n).split('.'), f = s[1] || '', v = f.length, t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), f100 = f.slice(-2), f10 = f.slice(-1);
	  return t0 && n10 == 0 || (n100 >= 11 && n100 <= 19) || v == 2 && (f100 >= 11 && f100 <= 19) ? 'zero'
	    : n10 == 1 && n100 != 11 || v == 2 && f10 == 1 && f100 != 11 || v != 2 && f10 == 1 ? 'one'
	    : 'other';
	},

	mas: a,

	mg: b,

	mgo: a,

	mk: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one' : 'other';
	},

	ml: a,

	mn: a,

	mo: (n) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  return n == 1 && v0 ? 'one'
	    : !v0 || n == 0 || n != 1 && (n100 >= 1 && n100 <= 19) ? 'few'
	    : 'other';
	},

	mr: a,

	ms: e,

	mt: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  return n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : n == 0 || (n100 >= 3 && n100 <= 10) ? 'few'
	    : (n100 >= 11 && n100 <= 19) ? 'many'
	    : 'other';
	},

	my: e,

	nah: a,

	naq: f,

	nb: a,

	nd: a,

	ne: a,

	nl: d,

	nn: a,

	nnh: a,

	no: a,

	nqo: e,

	nr: a,

	nso: b,

	ny: a,

	nyn: a,

	om: a,

	or: a,

	os: a,

	osa: e,

	pa: b,

	pap: a,

	pcm: c,

	pl: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  return n == 1 && v0 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) ? 'few'
	    : v0 && i != 1 && (i10 == 0 || i10 == 1) || v0 && (i10 >= 5 && i10 <= 9) || v0 && (i100 >= 12 && i100 <= 14) ? 'many'
	    : 'other';
	},

	prg: (n) => {
	  const s = String(n).split('.'), f = s[1] || '', v = f.length, t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), f100 = f.slice(-2), f10 = f.slice(-1);
	  return t0 && n10 == 0 || (n100 >= 11 && n100 <= 19) || v == 2 && (f100 >= 11 && f100 <= 19) ? 'zero'
	    : n10 == 1 && n100 != 11 || v == 2 && f10 == 1 && f100 != 11 || v != 2 && f10 == 1 ? 'one'
	    : 'other';
	},

	ps: a,

	pt: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return (i == 0 || i == 1) ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	pt_PT: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	rm: a,

	ro: (n) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  return n == 1 && v0 ? 'one'
	    : !v0 || n == 0 || n != 1 && (n100 >= 1 && n100 <= 19) ? 'few'
	    : 'other';
	},

	rof: a,

	ru: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) ? 'few'
	    : v0 && i10 == 0 || v0 && (i10 >= 5 && i10 <= 9) || v0 && (i100 >= 11 && i100 <= 14) ? 'many'
	    : 'other';
	},

	rwk: a,

	sah: e,

	saq: a,

	sat: f,

	sc: d,

	scn: d,

	sd: a,

	sdh: a,

	se: f,

	seh: a,

	ses: e,

	sg: e,

	sh: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	shi: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  return n >= 0 && n <= 1 ? 'one'
	    : (t0 && n >= 2 && n <= 10) ? 'few'
	    : 'other';
	},

	si: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '';
	  return (n == 0 || n == 1) || i == 0 && f == 1 ? 'one' : 'other';
	},

	sk: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1];
	  return n == 1 && v0 ? 'one'
	    : (i >= 2 && i <= 4) && v0 ? 'few'
	    : !v0 ? 'many'
	    : 'other';
	},

	sl: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i100 = i.slice(-2);
	  return v0 && i100 == 1 ? 'one'
	    : v0 && i100 == 2 ? 'two'
	    : v0 && (i100 == 3 || i100 == 4) || !v0 ? 'few'
	    : 'other';
	},

	sma: f,

	smi: f,

	smj: f,

	smn: f,

	sms: f,

	sn: a,

	so: a,

	sq: a,

	sr: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	ss: a,

	ssy: a,

	st: a,

	su: e,

	sv: d,

	sw: d,

	syr: a,

	ta: a,

	te: a,

	teo: a,

	th: e,

	ti: b,

	tig: a,

	tk: a,

	tl: (n) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), f10 = f.slice(-1);
	  return v0 && (i == 1 || i == 2 || i == 3) || v0 && i10 != 4 && i10 != 6 && i10 != 9 || !v0 && f10 != 4 && f10 != 6 && f10 != 9 ? 'one' : 'other';
	},

	tn: a,

	to: e,

	tpi: e,

	tr: a,

	ts: a,

	tzm: (n) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  return (n == 0 || n == 1) || (t0 && n >= 11 && n <= 99) ? 'one' : 'other';
	},

	ug: a,

	uk: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  return v0 && i10 == 1 && i100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) ? 'few'
	    : v0 && i10 == 0 || v0 && (i10 >= 5 && i10 <= 9) || v0 && (i100 >= 11 && i100 <= 14) ? 'many'
	    : 'other';
	},

	und: e,

	ur: d,

	uz: a,

	ve: a,

	vec: (n) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	vi: e,

	vo: a,

	vun: a,

	wa: b,

	wae: a,

	wo: e,

	xh: a,

	xog: a,

	yi: d,

	yo: e,

	yue: e,

	zh: e,

	zu: c
	})); 
} (cardinals));

var cardinalsExports = cardinals.exports;

var pluralCategories = {exports: {}};

(function (module, exports) {
	var z = "zero", o = "one", t = "two", f = "few", m = "many", x = "other";
	var a = {cardinal:[o,x],ordinal:[x]};
	var b = {cardinal:[o,x],ordinal:[o,x]};
	var c = {cardinal:[x],ordinal:[x]};
	var d = {cardinal:[o,t,x],ordinal:[x]};

	(function (root, pluralCategories) {
	  Object.defineProperty(pluralCategories, '__esModule', { value: true });
	  module.exports = pluralCategories;
	}(commonjsGlobal, {
	af: a,
	ak: a,
	am: a,
	an: a,
	ar: {cardinal:[z,o,t,f,m,x],ordinal:[x]},
	ars: {cardinal:[z,o,t,f,m,x],ordinal:[x]},
	as: {cardinal:[o,x],ordinal:[o,t,f,m,x]},
	asa: a,
	ast: a,
	az: {cardinal:[o,x],ordinal:[o,f,m,x]},
	bal: b,
	be: {cardinal:[o,f,m,x],ordinal:[f,x]},
	bem: a,
	bez: a,
	bg: a,
	bho: a,
	bm: c,
	bn: {cardinal:[o,x],ordinal:[o,t,f,m,x]},
	bo: c,
	br: {cardinal:[o,t,f,m,x],ordinal:[x]},
	brx: a,
	bs: {cardinal:[o,f,x],ordinal:[x]},
	ca: {cardinal:[o,m,x],ordinal:[o,t,f,x]},
	ce: a,
	ceb: a,
	cgg: a,
	chr: a,
	ckb: a,
	cs: {cardinal:[o,f,m,x],ordinal:[x]},
	cy: {cardinal:[z,o,t,f,m,x],ordinal:[z,o,t,f,m,x]},
	da: a,
	de: a,
	doi: a,
	dsb: {cardinal:[o,t,f,x],ordinal:[x]},
	dv: a,
	dz: c,
	ee: a,
	el: a,
	en: {cardinal:[o,x],ordinal:[o,t,f,x]},
	eo: a,
	es: {cardinal:[o,m,x],ordinal:[x]},
	et: a,
	eu: a,
	fa: a,
	ff: a,
	fi: a,
	fil: b,
	fo: a,
	fr: {cardinal:[o,m,x],ordinal:[o,x]},
	fur: a,
	fy: a,
	ga: {cardinal:[o,t,f,m,x],ordinal:[o,x]},
	gd: {cardinal:[o,t,f,x],ordinal:[o,t,f,x]},
	gl: a,
	gsw: a,
	gu: {cardinal:[o,x],ordinal:[o,t,f,m,x]},
	guw: a,
	gv: {cardinal:[o,t,f,m,x],ordinal:[x]},
	ha: a,
	haw: a,
	he: d,
	hi: {cardinal:[o,x],ordinal:[o,t,f,m,x]},
	hnj: c,
	hr: {cardinal:[o,f,x],ordinal:[x]},
	hsb: {cardinal:[o,t,f,x],ordinal:[x]},
	hu: b,
	hy: b,
	ia: a,
	id: c,
	ig: c,
	ii: c,
	io: a,
	is: a,
	it: {cardinal:[o,m,x],ordinal:[m,x]},
	iu: d,
	ja: c,
	jbo: c,
	jgo: a,
	jmc: a,
	jv: c,
	jw: c,
	ka: {cardinal:[o,x],ordinal:[o,m,x]},
	kab: a,
	kaj: a,
	kcg: a,
	kde: c,
	kea: c,
	kk: {cardinal:[o,x],ordinal:[m,x]},
	kkj: a,
	kl: a,
	km: c,
	kn: a,
	ko: c,
	ks: a,
	ksb: a,
	ksh: {cardinal:[z,o,x],ordinal:[x]},
	ku: a,
	kw: {cardinal:[z,o,t,f,m,x],ordinal:[o,m,x]},
	ky: a,
	lag: {cardinal:[z,o,x],ordinal:[x]},
	lb: a,
	lg: a,
	lij: {cardinal:[o,x],ordinal:[m,x]},
	lkt: c,
	ln: a,
	lo: {cardinal:[x],ordinal:[o,x]},
	lt: {cardinal:[o,f,m,x],ordinal:[x]},
	lv: {cardinal:[z,o,x],ordinal:[x]},
	mas: a,
	mg: a,
	mgo: a,
	mk: {cardinal:[o,x],ordinal:[o,t,m,x]},
	ml: a,
	mn: a,
	mo: {cardinal:[o,f,x],ordinal:[o,x]},
	mr: {cardinal:[o,x],ordinal:[o,t,f,x]},
	ms: {cardinal:[x],ordinal:[o,x]},
	mt: {cardinal:[o,t,f,m,x],ordinal:[x]},
	my: c,
	nah: a,
	naq: d,
	nb: a,
	nd: a,
	ne: b,
	nl: a,
	nn: a,
	nnh: a,
	no: a,
	nqo: c,
	nr: a,
	nso: a,
	ny: a,
	nyn: a,
	om: a,
	or: {cardinal:[o,x],ordinal:[o,t,f,m,x]},
	os: a,
	osa: c,
	pa: a,
	pap: a,
	pcm: a,
	pl: {cardinal:[o,f,m,x],ordinal:[x]},
	prg: {cardinal:[z,o,x],ordinal:[x]},
	ps: a,
	pt: {cardinal:[o,m,x],ordinal:[x]},
	pt_PT: {cardinal:[o,m,x],ordinal:[x]},
	rm: a,
	ro: {cardinal:[o,f,x],ordinal:[o,x]},
	rof: a,
	ru: {cardinal:[o,f,m,x],ordinal:[x]},
	rwk: a,
	sah: c,
	saq: a,
	sat: d,
	sc: {cardinal:[o,x],ordinal:[m,x]},
	scn: {cardinal:[o,x],ordinal:[m,x]},
	sd: a,
	sdh: a,
	se: d,
	seh: a,
	ses: c,
	sg: c,
	sh: {cardinal:[o,f,x],ordinal:[x]},
	shi: {cardinal:[o,f,x],ordinal:[x]},
	si: a,
	sk: {cardinal:[o,f,m,x],ordinal:[x]},
	sl: {cardinal:[o,t,f,x],ordinal:[x]},
	sma: d,
	smi: d,
	smj: d,
	smn: d,
	sms: d,
	sn: a,
	so: a,
	sq: {cardinal:[o,x],ordinal:[o,m,x]},
	sr: {cardinal:[o,f,x],ordinal:[x]},
	ss: a,
	ssy: a,
	st: a,
	su: c,
	sv: b,
	sw: a,
	syr: a,
	ta: a,
	te: a,
	teo: a,
	th: c,
	ti: a,
	tig: a,
	tk: {cardinal:[o,x],ordinal:[f,x]},
	tl: b,
	tn: a,
	to: c,
	tpi: c,
	tr: a,
	ts: a,
	tzm: a,
	ug: a,
	uk: {cardinal:[o,f,m,x],ordinal:[f,x]},
	und: c,
	ur: a,
	uz: a,
	ve: a,
	vec: {cardinal:[o,m,x],ordinal:[m,x]},
	vi: {cardinal:[x],ordinal:[o,x]},
	vo: a,
	vun: a,
	wa: a,
	wae: a,
	wo: c,
	xh: a,
	xog: a,
	yi: a,
	yo: c,
	yue: c,
	zh: c,
	zu: a
	})); 
} (pluralCategories));

var pluralCategoriesExports = pluralCategories.exports;

var plurals = {exports: {}};

(function (module, exports) {
	const a = (n, ord) => {
	  if (ord) return 'other';
	  return n == 1 ? 'one' : 'other';
	};
	const b = (n, ord) => {
	  if (ord) return 'other';
	  return (n == 0 || n == 1) ? 'one' : 'other';
	};
	const c = (n, ord) => {
	  if (ord) return 'other';
	  return n >= 0 && n <= 1 ? 'one' : 'other';
	};
	const d = (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1];
	  if (ord) return 'other';
	  return n == 1 && v0 ? 'one' : 'other';
	};
	const e = (n, ord) => 'other';
	const f = (n, ord) => {
	  if (ord) return 'other';
	  return n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : 'other';
	};

	(function (root, plurals) {
	  Object.defineProperty(plurals, '__esModule', { value: true });
	  module.exports = plurals;
	}(commonjsGlobal, {
	af: a,

	ak: b,

	am: c,

	an: a,

	ar: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  if (ord) return 'other';
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (n100 >= 3 && n100 <= 10) ? 'few'
	    : (n100 >= 11 && n100 <= 99) ? 'many'
	    : 'other';
	},

	ars: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  if (ord) return 'other';
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (n100 >= 3 && n100 <= 10) ? 'few'
	    : (n100 >= 11 && n100 <= 99) ? 'many'
	    : 'other';
	},

	as: (n, ord) => {
	  if (ord) return (n == 1 || n == 5 || n == 7 || n == 8 || n == 9 || n == 10) ? 'one'
	    : (n == 2 || n == 3) ? 'two'
	    : n == 4 ? 'few'
	    : n == 6 ? 'many'
	    : 'other';
	  return n >= 0 && n <= 1 ? 'one' : 'other';
	},

	asa: a,

	ast: d,

	az: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], i10 = i.slice(-1), i100 = i.slice(-2), i1000 = i.slice(-3);
	  if (ord) return (i10 == 1 || i10 == 2 || i10 == 5 || i10 == 7 || i10 == 8) || (i100 == 20 || i100 == 50 || i100 == 70 || i100 == 80) ? 'one'
	    : (i10 == 3 || i10 == 4) || (i1000 == 100 || i1000 == 200 || i1000 == 300 || i1000 == 400 || i1000 == 500 || i1000 == 600 || i1000 == 700 || i1000 == 800 || i1000 == 900) ? 'few'
	    : i == 0 || i10 == 6 || (i100 == 40 || i100 == 60 || i100 == 90) ? 'many'
	    : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	bal: (n, ord) => n == 1 ? 'one' : 'other',

	be: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  if (ord) return (n10 == 2 || n10 == 3) && n100 != 12 && n100 != 13 ? 'few' : 'other';
	  return n10 == 1 && n100 != 11 ? 'one'
	    : (n10 >= 2 && n10 <= 4) && (n100 < 12 || n100 > 14) ? 'few'
	    : t0 && n10 == 0 || (n10 >= 5 && n10 <= 9) || (n100 >= 11 && n100 <= 14) ? 'many'
	    : 'other';
	},

	bem: a,

	bez: a,

	bg: a,

	bho: b,

	bm: e,

	bn: (n, ord) => {
	  if (ord) return (n == 1 || n == 5 || n == 7 || n == 8 || n == 9 || n == 10) ? 'one'
	    : (n == 2 || n == 3) ? 'two'
	    : n == 4 ? 'few'
	    : n == 6 ? 'many'
	    : 'other';
	  return n >= 0 && n <= 1 ? 'one' : 'other';
	},

	bo: e,

	br: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), n1000000 = t0 && s[0].slice(-6);
	  if (ord) return 'other';
	  return n10 == 1 && n100 != 11 && n100 != 71 && n100 != 91 ? 'one'
	    : n10 == 2 && n100 != 12 && n100 != 72 && n100 != 92 ? 'two'
	    : ((n10 == 3 || n10 == 4) || n10 == 9) && (n100 < 10 || n100 > 19) && (n100 < 70 || n100 > 79) && (n100 < 90 || n100 > 99) ? 'few'
	    : n != 0 && t0 && n1000000 == 0 ? 'many'
	    : 'other';
	},

	brx: a,

	bs: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  if (ord) return 'other';
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	ca: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return (n == 1 || n == 3) ? 'one'
	    : n == 2 ? 'two'
	    : n == 4 ? 'few'
	    : 'other';
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	ce: a,

	ceb: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), f10 = f.slice(-1);
	  if (ord) return 'other';
	  return v0 && (i == 1 || i == 2 || i == 3) || v0 && i10 != 4 && i10 != 6 && i10 != 9 || !v0 && f10 != 4 && f10 != 6 && f10 != 9 ? 'one' : 'other';
	},

	cgg: a,

	chr: a,

	ckb: a,

	cs: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1];
	  if (ord) return 'other';
	  return n == 1 && v0 ? 'one'
	    : (i >= 2 && i <= 4) && v0 ? 'few'
	    : !v0 ? 'many'
	    : 'other';
	},

	cy: (n, ord) => {
	  if (ord) return (n == 0 || n == 7 || n == 8 || n == 9) ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (n == 3 || n == 4) ? 'few'
	    : (n == 5 || n == 6) ? 'many'
	    : 'other';
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : n == 3 ? 'few'
	    : n == 6 ? 'many'
	    : 'other';
	},

	da: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], t0 = Number(s[0]) == n;
	  if (ord) return 'other';
	  return n == 1 || !t0 && (i == 0 || i == 1) ? 'one' : 'other';
	},

	de: d,

	doi: c,

	dsb: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i100 = i.slice(-2), f100 = f.slice(-2);
	  if (ord) return 'other';
	  return v0 && i100 == 1 || f100 == 1 ? 'one'
	    : v0 && i100 == 2 || f100 == 2 ? 'two'
	    : v0 && (i100 == 3 || i100 == 4) || (f100 == 3 || f100 == 4) ? 'few'
	    : 'other';
	},

	dv: a,

	dz: e,

	ee: a,

	el: a,

	en: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  if (ord) return n10 == 1 && n100 != 11 ? 'one'
	    : n10 == 2 && n100 != 12 ? 'two'
	    : n10 == 3 && n100 != 13 ? 'few'
	    : 'other';
	  return n == 1 && v0 ? 'one' : 'other';
	},

	eo: a,

	es: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return 'other';
	  return n == 1 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	et: d,

	eu: a,

	fa: c,

	ff: (n, ord) => {
	  if (ord) return 'other';
	  return n >= 0 && n < 2 ? 'one' : 'other';
	},

	fi: d,

	fil: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), f10 = f.slice(-1);
	  if (ord) return n == 1 ? 'one' : 'other';
	  return v0 && (i == 1 || i == 2 || i == 3) || v0 && i10 != 4 && i10 != 6 && i10 != 9 || !v0 && f10 != 4 && f10 != 6 && f10 != 9 ? 'one' : 'other';
	},

	fo: a,

	fr: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return n == 1 ? 'one' : 'other';
	  return n >= 0 && n < 2 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	fur: a,

	fy: d,

	ga: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  if (ord) return n == 1 ? 'one' : 'other';
	  return n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : (t0 && n >= 3 && n <= 6) ? 'few'
	    : (t0 && n >= 7 && n <= 10) ? 'many'
	    : 'other';
	},

	gd: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  if (ord) return (n == 1 || n == 11) ? 'one'
	    : (n == 2 || n == 12) ? 'two'
	    : (n == 3 || n == 13) ? 'few'
	    : 'other';
	  return (n == 1 || n == 11) ? 'one'
	    : (n == 2 || n == 12) ? 'two'
	    : ((t0 && n >= 3 && n <= 10) || (t0 && n >= 13 && n <= 19)) ? 'few'
	    : 'other';
	},

	gl: d,

	gsw: a,

	gu: (n, ord) => {
	  if (ord) return n == 1 ? 'one'
	    : (n == 2 || n == 3) ? 'two'
	    : n == 4 ? 'few'
	    : n == 6 ? 'many'
	    : 'other';
	  return n >= 0 && n <= 1 ? 'one' : 'other';
	},

	guw: b,

	gv: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  if (ord) return 'other';
	  return v0 && i10 == 1 ? 'one'
	    : v0 && i10 == 2 ? 'two'
	    : v0 && (i100 == 0 || i100 == 20 || i100 == 40 || i100 == 60 || i100 == 80) ? 'few'
	    : !v0 ? 'many'
	    : 'other';
	},

	ha: a,

	haw: a,

	he: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1];
	  if (ord) return 'other';
	  return i == 1 && v0 || i == 0 && !v0 ? 'one'
	    : i == 2 && v0 ? 'two'
	    : 'other';
	},

	hi: (n, ord) => {
	  if (ord) return n == 1 ? 'one'
	    : (n == 2 || n == 3) ? 'two'
	    : n == 4 ? 'few'
	    : n == 6 ? 'many'
	    : 'other';
	  return n >= 0 && n <= 1 ? 'one' : 'other';
	},

	hnj: e,

	hr: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  if (ord) return 'other';
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	hsb: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i100 = i.slice(-2), f100 = f.slice(-2);
	  if (ord) return 'other';
	  return v0 && i100 == 1 || f100 == 1 ? 'one'
	    : v0 && i100 == 2 || f100 == 2 ? 'two'
	    : v0 && (i100 == 3 || i100 == 4) || (f100 == 3 || f100 == 4) ? 'few'
	    : 'other';
	},

	hu: (n, ord) => {
	  if (ord) return (n == 1 || n == 5) ? 'one' : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	hy: (n, ord) => {
	  if (ord) return n == 1 ? 'one' : 'other';
	  return n >= 0 && n < 2 ? 'one' : 'other';
	},

	ia: d,

	id: e,

	ig: e,

	ii: e,

	io: d,

	is: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], t = (s[1] || '').replace(/0+$/, ''), t0 = Number(s[0]) == n, i10 = i.slice(-1), i100 = i.slice(-2);
	  if (ord) return 'other';
	  return t0 && i10 == 1 && i100 != 11 || t % 10 == 1 && t % 100 != 11 ? 'one' : 'other';
	},

	it: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return (n == 11 || n == 8 || n == 80 || n == 800) ? 'many' : 'other';
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	iu: f,

	ja: e,

	jbo: e,

	jgo: a,

	jmc: a,

	jv: e,

	jw: e,

	ka: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], i100 = i.slice(-2);
	  if (ord) return i == 1 ? 'one'
	    : i == 0 || ((i100 >= 2 && i100 <= 20) || i100 == 40 || i100 == 60 || i100 == 80) ? 'many'
	    : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	kab: (n, ord) => {
	  if (ord) return 'other';
	  return n >= 0 && n < 2 ? 'one' : 'other';
	},

	kaj: a,

	kcg: a,

	kde: e,

	kea: e,

	kk: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1);
	  if (ord) return n10 == 6 || n10 == 9 || t0 && n10 == 0 && n != 0 ? 'many' : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	kkj: a,

	kl: a,

	km: e,

	kn: c,

	ko: e,

	ks: a,

	ksb: a,

	ksh: (n, ord) => {
	  if (ord) return 'other';
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : 'other';
	},

	ku: a,

	kw: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2), n1000 = t0 && s[0].slice(-3), n100000 = t0 && s[0].slice(-5), n1000000 = t0 && s[0].slice(-6);
	  if (ord) return (t0 && n >= 1 && n <= 4) || ((n100 >= 1 && n100 <= 4) || (n100 >= 21 && n100 <= 24) || (n100 >= 41 && n100 <= 44) || (n100 >= 61 && n100 <= 64) || (n100 >= 81 && n100 <= 84)) ? 'one'
	    : n == 5 || n100 == 5 ? 'many'
	    : 'other';
	  return n == 0 ? 'zero'
	    : n == 1 ? 'one'
	    : (n100 == 2 || n100 == 22 || n100 == 42 || n100 == 62 || n100 == 82) || t0 && n1000 == 0 && ((n100000 >= 1000 && n100000 <= 20000) || n100000 == 40000 || n100000 == 60000 || n100000 == 80000) || n != 0 && n1000000 == 100000 ? 'two'
	    : (n100 == 3 || n100 == 23 || n100 == 43 || n100 == 63 || n100 == 83) ? 'few'
	    : n != 1 && (n100 == 1 || n100 == 21 || n100 == 41 || n100 == 61 || n100 == 81) ? 'many'
	    : 'other';
	},

	ky: a,

	lag: (n, ord) => {
	  const s = String(n).split('.'), i = s[0];
	  if (ord) return 'other';
	  return n == 0 ? 'zero'
	    : (i == 0 || i == 1) && n != 0 ? 'one'
	    : 'other';
	},

	lb: a,

	lg: a,

	lij: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n;
	  if (ord) return (n == 11 || n == 8 || (t0 && n >= 80 && n <= 89) || (t0 && n >= 800 && n <= 899)) ? 'many' : 'other';
	  return n == 1 && v0 ? 'one' : 'other';
	},

	lkt: e,

	ln: b,

	lo: (n, ord) => {
	  if (ord) return n == 1 ? 'one' : 'other';
	  return 'other';
	},

	lt: (n, ord) => {
	  const s = String(n).split('.'), f = s[1] || '', t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  if (ord) return 'other';
	  return n10 == 1 && (n100 < 11 || n100 > 19) ? 'one'
	    : (n10 >= 2 && n10 <= 9) && (n100 < 11 || n100 > 19) ? 'few'
	    : f != 0 ? 'many'
	    : 'other';
	},

	lv: (n, ord) => {
	  const s = String(n).split('.'), f = s[1] || '', v = f.length, t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), f100 = f.slice(-2), f10 = f.slice(-1);
	  if (ord) return 'other';
	  return t0 && n10 == 0 || (n100 >= 11 && n100 <= 19) || v == 2 && (f100 >= 11 && f100 <= 19) ? 'zero'
	    : n10 == 1 && n100 != 11 || v == 2 && f10 == 1 && f100 != 11 || v != 2 && f10 == 1 ? 'one'
	    : 'other';
	},

	mas: a,

	mg: b,

	mgo: a,

	mk: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  if (ord) return i10 == 1 && i100 != 11 ? 'one'
	    : i10 == 2 && i100 != 12 ? 'two'
	    : (i10 == 7 || i10 == 8) && i100 != 17 && i100 != 18 ? 'many'
	    : 'other';
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one' : 'other';
	},

	ml: a,

	mn: a,

	mo: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  if (ord) return n == 1 ? 'one' : 'other';
	  return n == 1 && v0 ? 'one'
	    : !v0 || n == 0 || n != 1 && (n100 >= 1 && n100 <= 19) ? 'few'
	    : 'other';
	},

	mr: (n, ord) => {
	  if (ord) return n == 1 ? 'one'
	    : (n == 2 || n == 3) ? 'two'
	    : n == 4 ? 'few'
	    : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	ms: (n, ord) => {
	  if (ord) return n == 1 ? 'one' : 'other';
	  return 'other';
	},

	mt: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  if (ord) return 'other';
	  return n == 1 ? 'one'
	    : n == 2 ? 'two'
	    : n == 0 || (n100 >= 3 && n100 <= 10) ? 'few'
	    : (n100 >= 11 && n100 <= 19) ? 'many'
	    : 'other';
	},

	my: e,

	nah: a,

	naq: f,

	nb: a,

	nd: a,

	ne: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  if (ord) return (t0 && n >= 1 && n <= 4) ? 'one' : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	nl: d,

	nn: a,

	nnh: a,

	no: a,

	nqo: e,

	nr: a,

	nso: b,

	ny: a,

	nyn: a,

	om: a,

	or: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  if (ord) return (n == 1 || n == 5 || (t0 && n >= 7 && n <= 9)) ? 'one'
	    : (n == 2 || n == 3) ? 'two'
	    : n == 4 ? 'few'
	    : n == 6 ? 'many'
	    : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	os: a,

	osa: e,

	pa: b,

	pap: a,

	pcm: c,

	pl: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  if (ord) return 'other';
	  return n == 1 && v0 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) ? 'few'
	    : v0 && i != 1 && (i10 == 0 || i10 == 1) || v0 && (i10 >= 5 && i10 <= 9) || v0 && (i100 >= 12 && i100 <= 14) ? 'many'
	    : 'other';
	},

	prg: (n, ord) => {
	  const s = String(n).split('.'), f = s[1] || '', v = f.length, t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), f100 = f.slice(-2), f10 = f.slice(-1);
	  if (ord) return 'other';
	  return t0 && n10 == 0 || (n100 >= 11 && n100 <= 19) || v == 2 && (f100 >= 11 && f100 <= 19) ? 'zero'
	    : n10 == 1 && n100 != 11 || v == 2 && f10 == 1 && f100 != 11 || v != 2 && f10 == 1 ? 'one'
	    : 'other';
	},

	ps: a,

	pt: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return 'other';
	  return (i == 0 || i == 1) ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	pt_PT: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return 'other';
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	rm: a,

	ro: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n, n100 = t0 && s[0].slice(-2);
	  if (ord) return n == 1 ? 'one' : 'other';
	  return n == 1 && v0 ? 'one'
	    : !v0 || n == 0 || n != 1 && (n100 >= 1 && n100 <= 19) ? 'few'
	    : 'other';
	},

	rof: a,

	ru: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2);
	  if (ord) return 'other';
	  return v0 && i10 == 1 && i100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) ? 'few'
	    : v0 && i10 == 0 || v0 && (i10 >= 5 && i10 <= 9) || v0 && (i100 >= 11 && i100 <= 14) ? 'many'
	    : 'other';
	},

	rwk: a,

	sah: e,

	saq: a,

	sat: f,

	sc: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1];
	  if (ord) return (n == 11 || n == 8 || n == 80 || n == 800) ? 'many' : 'other';
	  return n == 1 && v0 ? 'one' : 'other';
	},

	scn: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1];
	  if (ord) return (n == 11 || n == 8 || n == 80 || n == 800) ? 'many' : 'other';
	  return n == 1 && v0 ? 'one' : 'other';
	},

	sd: a,

	sdh: a,

	se: f,

	seh: a,

	ses: e,

	sg: e,

	sh: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  if (ord) return 'other';
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	shi: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  if (ord) return 'other';
	  return n >= 0 && n <= 1 ? 'one'
	    : (t0 && n >= 2 && n <= 10) ? 'few'
	    : 'other';
	},

	si: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '';
	  if (ord) return 'other';
	  return (n == 0 || n == 1) || i == 0 && f == 1 ? 'one' : 'other';
	},

	sk: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1];
	  if (ord) return 'other';
	  return n == 1 && v0 ? 'one'
	    : (i >= 2 && i <= 4) && v0 ? 'few'
	    : !v0 ? 'many'
	    : 'other';
	},

	sl: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i100 = i.slice(-2);
	  if (ord) return 'other';
	  return v0 && i100 == 1 ? 'one'
	    : v0 && i100 == 2 ? 'two'
	    : v0 && (i100 == 3 || i100 == 4) || !v0 ? 'few'
	    : 'other';
	},

	sma: f,

	smi: f,

	smj: f,

	smn: f,

	sms: f,

	sn: a,

	so: a,

	sq: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  if (ord) return n == 1 ? 'one'
	    : n10 == 4 && n100 != 14 ? 'many'
	    : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	sr: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), i100 = i.slice(-2), f10 = f.slice(-1), f100 = f.slice(-2);
	  if (ord) return 'other';
	  return v0 && i10 == 1 && i100 != 11 || f10 == 1 && f100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) || (f10 >= 2 && f10 <= 4) && (f100 < 12 || f100 > 14) ? 'few'
	    : 'other';
	},

	ss: a,

	ssy: a,

	st: a,

	su: e,

	sv: (n, ord) => {
	  const s = String(n).split('.'), v0 = !s[1], t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2);
	  if (ord) return (n10 == 1 || n10 == 2) && n100 != 11 && n100 != 12 ? 'one' : 'other';
	  return n == 1 && v0 ? 'one' : 'other';
	},

	sw: d,

	syr: a,

	ta: a,

	te: a,

	teo: a,

	th: e,

	ti: b,

	tig: a,

	tk: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1);
	  if (ord) return (n10 == 6 || n10 == 9) || n == 10 ? 'few' : 'other';
	  return n == 1 ? 'one' : 'other';
	},

	tl: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], f = s[1] || '', v0 = !s[1], i10 = i.slice(-1), f10 = f.slice(-1);
	  if (ord) return n == 1 ? 'one' : 'other';
	  return v0 && (i == 1 || i == 2 || i == 3) || v0 && i10 != 4 && i10 != 6 && i10 != 9 || !v0 && f10 != 4 && f10 != 6 && f10 != 9 ? 'one' : 'other';
	},

	tn: a,

	to: e,

	tpi: e,

	tr: a,

	ts: a,

	tzm: (n, ord) => {
	  const s = String(n).split('.'), t0 = Number(s[0]) == n;
	  if (ord) return 'other';
	  return (n == 0 || n == 1) || (t0 && n >= 11 && n <= 99) ? 'one' : 'other';
	},

	ug: a,

	uk: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], t0 = Number(s[0]) == n, n10 = t0 && s[0].slice(-1), n100 = t0 && s[0].slice(-2), i10 = i.slice(-1), i100 = i.slice(-2);
	  if (ord) return n10 == 3 && n100 != 13 ? 'few' : 'other';
	  return v0 && i10 == 1 && i100 != 11 ? 'one'
	    : v0 && (i10 >= 2 && i10 <= 4) && (i100 < 12 || i100 > 14) ? 'few'
	    : v0 && i10 == 0 || v0 && (i10 >= 5 && i10 <= 9) || v0 && (i100 >= 11 && i100 <= 14) ? 'many'
	    : 'other';
	},

	und: e,

	ur: d,

	uz: a,

	ve: a,

	vec: (n, ord) => {
	  const s = String(n).split('.'), i = s[0], v0 = !s[1], i1000000 = i.slice(-6);
	  if (ord) return (n == 11 || n == 8 || n == 80 || n == 800) ? 'many' : 'other';
	  return n == 1 && v0 ? 'one'
	    : i != 0 && i1000000 == 0 && v0 ? 'many'
	    : 'other';
	},

	vi: (n, ord) => {
	  if (ord) return n == 1 ? 'one' : 'other';
	  return 'other';
	},

	vo: a,

	vun: a,

	wa: b,

	wae: a,

	wo: e,

	xh: a,

	xog: a,

	yi: d,

	yo: e,

	yue: e,

	zh: e,

	zu: c
	})); 
} (plurals));

var pluralsExports = plurals.exports;

var Compiler = compiler;
var Cardinals = cardinalsExports;
var PluralCategories = pluralCategoriesExports;
var Plurals = pluralsExports;
var safeIdentifier = safeIdentifier$2;

function _interopNamespaceDefault$1(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var Cardinals__namespace = /*#__PURE__*/_interopNamespaceDefault$1(Cardinals);
var PluralCategories__namespace = /*#__PURE__*/_interopNamespaceDefault$1(PluralCategories);
var Plurals__namespace = /*#__PURE__*/_interopNamespaceDefault$1(Plurals);

function normalize(locale) {
    if (typeof locale !== 'string' || locale.length < 2)
        throw new RangeError(`Invalid language tag: ${locale}`);
    if (locale.startsWith('pt-PT'))
        return 'pt-PT';
    const m = locale.match(/.+?(?=[-_])/);
    return m ? m[0] : locale;
}
function getPlural(locale) {
    if (typeof locale === 'function') {
        const lc = normalize(locale.name);
        return {
            isDefault: false,
            id: safeIdentifier.identifier(lc),
            lc,
            locale: locale.name,
            getPlural: locale,
            cardinals: locale.cardinals || [],
            ordinals: locale.ordinals || []
        };
    }
    const lc = normalize(locale);
    const id = safeIdentifier.identifier(lc);
    if (isPluralId(id)) {
        return {
            isDefault: true,
            id,
            lc,
            locale,
            getCardinal: Cardinals__namespace[id],
            getPlural: Plurals__namespace[id],
            cardinals: PluralCategories__namespace[id].cardinal,
            ordinals: PluralCategories__namespace[id].ordinal
        };
    }
    return null;
}
function getAllPlurals(firstLocale) {
    const keys = Object.keys(Plurals__namespace).filter(key => key !== firstLocale);
    keys.unshift(firstLocale);
    return keys.map(getPlural);
}
function hasPlural(locale) {
    const lc = normalize(locale);
    return safeIdentifier.identifier(lc) in Plurals__namespace;
}
function isPluralId(id) {
    return id in Plurals__namespace;
}

class MessageFormat {
    static escape(str, octothorpe) {
        const esc = octothorpe ? /[#{}]/g : /[{}]/g;
        return String(str).replace(esc, "'$&'");
    }
    static supportedLocalesOf(locales) {
        const la = Array.isArray(locales) ? locales : [locales];
        return la.filter(hasPlural);
    }
    constructor(locale, options) {
        this.plurals = [];
        this.options = Object.assign({
            biDiSupport: false,
            currency: 'USD',
            customFormatters: {},
            localeCodeFromKey: null,
            requireAllArguments: false,
            returnType: 'string',
            strict: (options && options.strictNumberSign) || false,
            strictPluralKeys: true
        }, options);
        if (locale === '*') {
            this.plurals = getAllPlurals(MessageFormat.defaultLocale);
        }
        else if (Array.isArray(locale)) {
            this.plurals = locale.map(getPlural).filter(Boolean);
        }
        else if (locale) {
            const pl = getPlural(locale);
            if (pl)
                this.plurals = [pl];
        }
        if (this.plurals.length === 0) {
            const pl = getPlural(MessageFormat.defaultLocale);
            this.plurals = [pl];
        }
    }
    resolvedOptions() {
        return Object.assign(Object.assign({}, this.options), { locale: this.plurals[0].locale, plurals: this.plurals });
    }
    compile(message) {
        const compiler = new Compiler(this.options);
        const fnBody = 'return ' + compiler.compile(message, this.plurals[0]);
        const nfArgs = [];
        const fnArgs = [];
        for (const [key, fmt] of Object.entries(compiler.runtime)) {
            nfArgs.push(key);
            fnArgs.push(fmt);
        }
        const fn = new Function(...nfArgs, fnBody);
        return fn(...fnArgs);
    }
}
MessageFormat.defaultLocale = 'en';

var messageformat = MessageFormat;

var lib = {};

Object.defineProperty(lib, "__esModule", { value: true });
var patternParts = {
    value: '[-+]?(?:Infinity|[[0-9]*\\.?\\d*(?:[eE][-+]?\\d+)?)',
    leftBrace: '[\\(\\]\\[]',
    delimeter: ',',
    rightBrace: '[\\)\\]\\[]',
};
var PATTERN = new RegExp("(" + patternParts.leftBrace + ")" +
    ("(" + patternParts.value + ")?") +
    ("(" + patternParts.delimeter + ")?") +
    ("(" + patternParts.value + ")?") +
    ("(" + patternParts.rightBrace + ")"));
function execPattern(str) {
    var match = PATTERN.exec(str);
    if (!match) {
        return null;
    }
    match[0]; var leftBrace = match[1], fromValue = match[2], delimeter = match[3], toValue = match[4], rightBrace = match[5];
    return {
        leftBrace: leftBrace,
        fromValue: fromValue,
        delimeter: delimeter,
        toValue: toValue,
        rightBrace: rightBrace,
    };
}
function parse(str) {
    var match = execPattern(str);
    if (!match) {
        return null;
    }
    return {
        from: {
            value: match.fromValue !== undefined ?
                +match.fromValue :
                -Infinity,
            included: match.leftBrace === '['
        },
        to: {
            value: match.toValue !== undefined ?
                +match.toValue :
                (match.delimeter ?
                    +Infinity :
                    match.fromValue !== undefined ?
                        +match.fromValue :
                        NaN),
            included: match.rightBrace === ']'
        }
    };
}
function check(interval) {
    if (interval.from.value === interval.to.value) {
        return interval.from.included && interval.to.included;
    }
    return Math.min(interval.from.value, interval.to.value) === interval.from.value;
}
function entry(str) {
    var interval = parse(str);
    if (!interval || !check(interval)) {
        return null;
    }
    return interval;
}
lib.default = entry;

/**
 * @author      Created by Marcus Spiegel <spiegel@uscreen.de> on 2011-03-25.
 * @link        https://github.com/mashpie/i18n-node
 * @license     http://opensource.org/licenses/MIT
 */

// dependencies
const printf = printf$1.printf;
const pkgVersion = require$$1.version;
const fs = require$$1$1;
const url = require$$3;
const path = require$$1$2;
const debug = srcExports('i18n:debug');
const warn = srcExports('i18n:warn');
const error = srcExports('i18n:error');
const Mustache = mustacheExports;
const Messageformat = messageformat;
const MakePlural = pluralsExports;
const parseInterval = lib.default;

// utils
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string

/**
 * create constructor function
 */
const i18n$1 = function I18n(_OPTS = false) {
  const MessageformatInstanceForLocale = {};
  const PluralsForLocale = {};
  let locales = {};
  const api = {
    __: '__',
    __n: '__n',
    __l: '__l',
    __h: '__h',
    __mf: '__mf',
    getLocale: 'getLocale',
    setLocale: 'setLocale',
    getCatalog: 'getCatalog',
    getLocales: 'getLocales',
    addLocale: 'addLocale',
    removeLocale: 'removeLocale'
  };
  const mustacheConfig = {
    tags: ['{{', '}}'],
    disable: false
  };

  let mustacheRegex;
  const pathsep = path.sep; // ---> means win support will be available in node 0.8.x and above
  let autoReload;
  let cookiename;
  let languageHeaderName;
  let defaultLocale;
  let retryInDefaultLocale;
  let directory;
  let directoryPermissions;
  let extension;
  let fallbacks;
  let indent;
  let logDebugFn;
  let logErrorFn;
  let logWarnFn;
  let preserveLegacyCase;
  let objectNotation;
  let prefix;
  let queryParameter;
  let register;
  let updateFiles;
  let syncFiles;
  let missingKeyFn;
  let parser;

  // public exports
  const i18n = {};

  i18n.version = pkgVersion;

  i18n.configure = function i18nConfigure(opt) {
    // reset locales
    locales = {};

    // Provide custom API method aliases if desired
    // This needs to be processed before the first call to applyAPItoObject()
    if (opt.api && typeof opt.api === 'object') {
      for (const method in opt.api) {
        if (Object.prototype.hasOwnProperty.call(opt.api, method)) {
          const alias = opt.api[method];
          if (typeof api[method] !== 'undefined') {
            api[method] = alias;
          }
        }
      }
    }

    // you may register i18n in global scope, up to you
    if (typeof opt.register === 'object') {
      register = opt.register;
      // or give an array objects to register to
      if (Array.isArray(opt.register)) {
        register = opt.register;
        register.forEach(applyAPItoObject);
      } else {
        applyAPItoObject(opt.register);
      }
    }

    // sets a custom cookie name to parse locale settings from
    cookiename = typeof opt.cookie === 'string' ? opt.cookie : null;

    // set the custom header name to extract the language locale
    languageHeaderName =
      typeof opt.header === 'string' ? opt.header : 'accept-language';

    // query-string parameter to be watched - @todo: add test & doc
    queryParameter =
      typeof opt.queryParameter === 'string' ? opt.queryParameter : null;

    // where to store json files
    directory =
      typeof opt.directory === 'string'
        ? opt.directory
        : path.join(__dirname, 'locales');

    // permissions when creating new directories
    directoryPermissions =
      typeof opt.directoryPermissions === 'string'
        ? parseInt(opt.directoryPermissions, 8)
        : null;

    // write new locale information to disk
    updateFiles = typeof opt.updateFiles === 'boolean' ? opt.updateFiles : true;

    // sync locale information accros all files
    syncFiles = typeof opt.syncFiles === 'boolean' ? opt.syncFiles : false;

    // what to use as the indentation unit (ex: "\t", "  ")
    indent = typeof opt.indent === 'string' ? opt.indent : '\t';

    // json files prefix
    prefix = typeof opt.prefix === 'string' ? opt.prefix : '';

    // where to store json files
    extension = typeof opt.extension === 'string' ? opt.extension : '.json';

    // setting defaultLocale
    defaultLocale =
      typeof opt.defaultLocale === 'string' ? opt.defaultLocale : 'en';

    // allow to retry in default locale, useful for production
    retryInDefaultLocale =
      typeof opt.retryInDefaultLocale === 'boolean'
        ? opt.retryInDefaultLocale
        : false;

    // auto reload locale files when changed
    autoReload = typeof opt.autoReload === 'boolean' ? opt.autoReload : false;

    // enable object notation?
    objectNotation =
      typeof opt.objectNotation !== 'undefined' ? opt.objectNotation : false;
    if (objectNotation === true) objectNotation = '.';

    // read language fallback map
    fallbacks = typeof opt.fallbacks === 'object' ? opt.fallbacks : {};

    // setting custom logger functions
    logDebugFn = typeof opt.logDebugFn === 'function' ? opt.logDebugFn : debug;
    logWarnFn = typeof opt.logWarnFn === 'function' ? opt.logWarnFn : warn;
    logErrorFn = typeof opt.logErrorFn === 'function' ? opt.logErrorFn : error;

    preserveLegacyCase =
      typeof opt.preserveLegacyCase === 'boolean'
        ? opt.preserveLegacyCase
        : true;

    // setting custom missing key function
    missingKeyFn =
      typeof opt.missingKeyFn === 'function' ? opt.missingKeyFn : missingKey;

    parser =
      typeof opt.parser === 'object' &&
      typeof opt.parser.parse === 'function' &&
      typeof opt.parser.stringify === 'function'
        ? opt.parser
        : JSON;

    // when missing locales we try to guess that from directory
    opt.locales = opt.staticCatalog
      ? Object.keys(opt.staticCatalog)
      : opt.locales || guessLocales(directory);

    // some options should be disabled when using staticCatalog
    if (opt.staticCatalog) {
      updateFiles = false;
      autoReload = false;
      syncFiles = false;
    }

    // customize mustache parsing
    if (opt.mustacheConfig) {
      if (Array.isArray(opt.mustacheConfig.tags)) {
        mustacheConfig.tags = opt.mustacheConfig.tags;
      }
      if (opt.mustacheConfig.disable === true) {
        mustacheConfig.disable = true;
      }
    }

    const [start, end] = mustacheConfig.tags;
    mustacheRegex = new RegExp(escapeRegExp(start) + '.*' + escapeRegExp(end));

    // implicitly read all locales
    if (Array.isArray(opt.locales)) {
      if (opt.staticCatalog) {
        locales = opt.staticCatalog;
      } else {
        opt.locales.forEach(read);
      }

      // auto reload locale files when changed
      if (autoReload) {
        // watch changes of locale files (it's called twice because fs.watch is still unstable)
        fs.watch(directory, (event, filename) => {
          const localeFromFile = guessLocaleFromFile(filename);

          if (localeFromFile && opt.locales.indexOf(localeFromFile) > -1) {
            logDebug('Auto reloading locale file "' + filename + '".');
            read(localeFromFile);
          }
        });
      }
    }
  };

  i18n.init = function i18nInit(request, response, next) {
    if (typeof request === 'object') {
      // guess requested language/locale
      guessLanguage(request);

      // bind api to req
      applyAPItoObject(request);

      // looks double but will ensure schema on api refactor
      i18n.setLocale(request, request.locale);
    } else {
      return logError(
        'i18n.init must be called with one parameter minimum, ie. i18n.init(req)'
      )
    }

    if (typeof response === 'object') {
      applyAPItoObject(response);

      // and set that locale to response too
      i18n.setLocale(response, request.locale);
    }

    // head over to next callback when bound as middleware
    if (typeof next === 'function') {
      return next()
    }
  };

  i18n.__ = function i18nTranslate(phrase) {
    let msg;
    const argv = parseArgv(arguments);
    const namedValues = argv[0];
    const args = argv[1];

    // called like __({phrase: "Hello", locale: "en"})
    if (typeof phrase === 'object') {
      if (
        typeof phrase.locale === 'string' &&
        typeof phrase.phrase === 'string'
      ) {
        msg = translate(phrase.locale, phrase.phrase);
      }
    }
    // called like __("Hello")
    else {
      // get translated message with locale from scope (deprecated) or object
      msg = translate(getLocaleFromObject(this), phrase);
    }

    // postprocess to get compatible to plurals
    if (typeof msg === 'object' && msg.one) {
      msg = msg.one;
    }

    // in case there is no 'one' but an 'other' rule
    if (typeof msg === 'object' && msg.other) {
      msg = msg.other;
    }

    // head over to postProcessing
    return postProcess(msg, namedValues, args)
  };

  i18n.__mf = function i18nMessageformat(phrase) {
    let msg, mf, f;
    let targetLocale = defaultLocale;
    const argv = parseArgv(arguments);
    const namedValues = argv[0];
    const args = argv[1];

    // called like __({phrase: "Hello", locale: "en"})
    if (typeof phrase === 'object') {
      if (
        typeof phrase.locale === 'string' &&
        typeof phrase.phrase === 'string'
      ) {
        msg = phrase.phrase;
        targetLocale = phrase.locale;
      }
    }
    // called like __("Hello")
    else {
      // get translated message with locale from scope (deprecated) or object
      msg = phrase;
      targetLocale = getLocaleFromObject(this);
    }

    msg = translate(targetLocale, msg);
    // --- end get msg

    // now head over to Messageformat
    // and try to cache instance
    if (MessageformatInstanceForLocale[targetLocale]) {
      mf = MessageformatInstanceForLocale[targetLocale];
    } else {
      mf = new Messageformat(targetLocale);

      mf.compiledFunctions = {};
      MessageformatInstanceForLocale[targetLocale] = mf;
    }

    // let's try to cache that function
    if (mf.compiledFunctions[msg]) {
      f = mf.compiledFunctions[msg];
    } else {
      f = mf.compile(msg);
      mf.compiledFunctions[msg] = f;
    }

    return postProcess(f(namedValues), namedValues, args)
  };

  i18n.__l = function i18nTranslationList(phrase) {
    const translations = [];
    Object.keys(locales)
      .sort()
      .forEach((l) => {
        translations.push(i18n.__({ phrase: phrase, locale: l }));
      });
    return translations
  };

  i18n.__h = function i18nTranslationHash(phrase) {
    const translations = [];
    Object.keys(locales)
      .sort()
      .forEach((l) => {
        const hash = {};
        hash[l] = i18n.__({ phrase: phrase, locale: l });
        translations.push(hash);
      });
    return translations
  };

  i18n.__n = function i18nTranslatePlural(singular, plural, count) {
    let msg;
    let namedValues;
    let targetLocale;
    let args = [];

    // Accept an object with named values as the last parameter
    if (argsEndWithNamedObject(arguments)) {
      namedValues = arguments[arguments.length - 1];
      args =
        arguments.length >= 5
          ? Array.prototype.slice.call(arguments, 3, -1)
          : [];
    } else {
      namedValues = {};
      args =
        arguments.length >= 4 ? Array.prototype.slice.call(arguments, 3) : [];
    }

    // called like __n({singular: "%s cat", plural: "%s cats", locale: "en"}, 3)
    if (typeof singular === 'object') {
      if (
        typeof singular.locale === 'string' &&
        typeof singular.singular === 'string' &&
        typeof singular.plural === 'string'
      ) {
        targetLocale = singular.locale;
        msg = translate(singular.locale, singular.singular, singular.plural);
      }
      args.unshift(count);

      // some template engines pass all values as strings -> so we try to convert them to numbers
      if (typeof plural === 'number' || Number(plural) + '' === plural) {
        count = plural;
      }

      // called like __n({singular: "%s cat", plural: "%s cats", locale: "en", count: 3})
      if (
        typeof singular.count === 'number' ||
        typeof singular.count === 'string'
      ) {
        count = singular.count;
        args.unshift(plural);
      }
    } else {
      // called like  __n('cat', 3)
      if (typeof plural === 'number' || Number(plural) + '' === plural) {
        count = plural;

        // we add same string as default
        // which efectivly copies the key to the plural.value
        // this is for initialization of new empty translations
        plural = singular;

        args.unshift(count);
        args.unshift(plural);
      }
      // called like __n('%s cat', '%s cats', 3)
      // get translated message with locale from scope (deprecated) or object
      msg = translate(getLocaleFromObject(this), singular, plural);
      targetLocale = getLocaleFromObject(this);
    }

    if (count === null) count = namedValues.count;

    // enforce number
    count = Number(count);

    // find the correct plural rule for given locale
    if (typeof msg === 'object') {
      let p;
      // create a new Plural for locale
      // and try to cache instance
      if (PluralsForLocale[targetLocale]) {
        p = PluralsForLocale[targetLocale];
      } else {
        // split locales with a region code
        const lc = targetLocale
          .toLowerCase()
          .split(/[_-\s]+/)
          .filter((el) => el);
        // take the first part of locale, fallback to full locale
        p = MakePlural[lc[0] || targetLocale];
        PluralsForLocale[targetLocale] = p;
      }

      // fallback to 'other' on case of missing translations
      msg = msg[p(count)] || msg.other;
    }

    // head over to postProcessing
    return postProcess(msg, namedValues, args, count)
  };

  i18n.setLocale = function i18nSetLocale(object, locale, skipImplicitObjects) {
    // when given an array of objects => setLocale on each
    if (Array.isArray(object) && typeof locale === 'string') {
      for (let i = object.length - 1; i >= 0; i--) {
        i18n.setLocale(object[i], locale, true);
      }
      return i18n.getLocale(object[0])
    }

    // defaults to called like i18n.setLocale(req, 'en')
    let targetObject = object;
    let targetLocale = locale;

    // called like req.setLocale('en') or i18n.setLocale('en')
    if (locale === undefined && typeof object === 'string') {
      targetObject = this;
      targetLocale = object;
    }

    // consider a fallback
    if (!locales[targetLocale]) {
      targetLocale = getFallback(targetLocale, fallbacks) || targetLocale;
    }

    // now set locale on object
    targetObject.locale = locales[targetLocale] ? targetLocale : defaultLocale;

    // consider any extra registered objects
    if (typeof register === 'object') {
      if (Array.isArray(register) && !skipImplicitObjects) {
        register.forEach((r) => {
          r.locale = targetObject.locale;
        });
      } else {
        register.locale = targetObject.locale;
      }
    }

    // consider res
    if (targetObject.res && !skipImplicitObjects) {
      // escape recursion
      // @see  - https://github.com/balderdashy/sails/pull/3631
      //       - https://github.com/mashpie/i18n-node/pull/218
      if (targetObject.res.locals) {
        i18n.setLocale(targetObject.res, targetObject.locale, true);
        i18n.setLocale(targetObject.res.locals, targetObject.locale, true);
      } else {
        i18n.setLocale(targetObject.res, targetObject.locale);
      }
    }

    // consider locals
    if (targetObject.locals && !skipImplicitObjects) {
      // escape recursion
      // @see  - https://github.com/balderdashy/sails/pull/3631
      //       - https://github.com/mashpie/i18n-node/pull/218
      if (targetObject.locals.res) {
        i18n.setLocale(targetObject.locals, targetObject.locale, true);
        i18n.setLocale(targetObject.locals.res, targetObject.locale, true);
      } else {
        i18n.setLocale(targetObject.locals, targetObject.locale);
      }
    }

    return i18n.getLocale(targetObject)
  };

  i18n.getLocale = function i18nGetLocale(request) {
    // called like i18n.getLocale(req)
    if (request && request.locale) {
      return request.locale
    }

    // called like req.getLocale()
    return this.locale || defaultLocale
  };

  i18n.getCatalog = function i18nGetCatalog(object, locale) {
    let targetLocale;

    // called like i18n.getCatalog(req)
    if (
      typeof object === 'object' &&
      typeof object.locale === 'string' &&
      locale === undefined
    ) {
      targetLocale = object.locale;
    }

    // called like i18n.getCatalog(req, 'en')
    if (
      !targetLocale &&
      typeof object === 'object' &&
      typeof locale === 'string'
    ) {
      targetLocale = locale;
    }

    // called like req.getCatalog('en')
    if (!targetLocale && locale === undefined && typeof object === 'string') {
      targetLocale = object;
    }

    // called like req.getCatalog()
    if (
      !targetLocale &&
      object === undefined &&
      locale === undefined &&
      typeof this.locale === 'string'
    ) {
      if (register && register.global) {
        targetLocale = '';
      } else {
        targetLocale = this.locale;
      }
    }

    // called like i18n.getCatalog()
    if (targetLocale === undefined || targetLocale === '') {
      return locales
    }

    if (!locales[targetLocale]) {
      targetLocale = getFallback(targetLocale, fallbacks) || targetLocale;
    }

    if (locales[targetLocale]) {
      return locales[targetLocale]
    } else {
      logWarn('No catalog found for "' + targetLocale + '"');
      return false
    }
  };

  i18n.getLocales = function i18nGetLocales() {
    return Object.keys(locales)
  };

  i18n.addLocale = function i18nAddLocale(locale) {
    read(locale);
  };

  i18n.removeLocale = function i18nRemoveLocale(locale) {
    delete locales[locale];
  };

  // ===================
  // = private methods =
  // ===================

  const postProcess = (msg, namedValues, args, count) => {
    // test for parsable interval string
    if (/\|/.test(msg)) {
      msg = parsePluralInterval(msg, count);
    }

    // replace the counter
    if (typeof count === 'number') {
      msg = printf(msg, Number(count));
    }

    // if the msg string contains {{Mustache}} patterns we render it as a mini template
    if (!mustacheConfig.disable && mustacheRegex.test(msg)) {
      msg = Mustache.render(msg, namedValues, {}, mustacheConfig.tags);
    }

    // if we have extra arguments with values to get replaced,
    // an additional substition injects those strings afterwards
    if (/%/.test(msg) && args && args.length > 0) {
      msg = printf(msg, ...args);
    }

    return msg
  };

  const argsEndWithNamedObject = (args) =>
    args.length > 1 &&
    args[args.length - 1] !== null &&
    typeof args[args.length - 1] === 'object';

  const parseArgv = (args) => {
    let namedValues, returnArgs;

    if (argsEndWithNamedObject(args)) {
      namedValues = args[args.length - 1];
      returnArgs = Array.prototype.slice.call(args, 1, -1);
    } else {
      namedValues = {};
      returnArgs = args.length >= 2 ? Array.prototype.slice.call(args, 1) : [];
    }

    return [namedValues, returnArgs]
  };

  /**
   * registers all public API methods to a given response object when not already declared
   */
  const applyAPItoObject = (object) => {
    let alreadySetted = true;

    // attach to itself if not provided
    for (const method in api) {
      if (Object.prototype.hasOwnProperty.call(api, method)) {
        const alias = api[method];

        // be kind rewind, or better not touch anything already existing
        if (!object[alias]) {
          alreadySetted = false;
          object[alias] = i18n[method].bind(object);
        }
      }
    }

    // set initial locale if not set
    if (!object.locale) {
      object.locale = defaultLocale;
    }

    // escape recursion
    if (alreadySetted) {
      return
    }

    // attach to response if present (ie. in express)
    if (object.res) {
      applyAPItoObject(object.res);
    }

    // attach to locals if present (ie. in express)
    if (object.locals) {
      applyAPItoObject(object.locals);
    }
  };

  /**
   * tries to guess locales by scanning the given directory
   */
  const guessLocales = (directory) => {
    const entries = fs.readdirSync(directory);
    const localesFound = [];

    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].match(/^\./)) continue
      const localeFromFile = guessLocaleFromFile(entries[i]);
      if (localeFromFile) localesFound.push(localeFromFile);
    }

    return localesFound.sort()
  };

  /**
   * tries to guess locales from a given filename
   */
  const guessLocaleFromFile = (filename) => {
    const extensionRegex = new RegExp(extension + '$', 'g');
    const prefixRegex = new RegExp('^' + prefix, 'g');

    if (!filename) return false
    if (prefix && !filename.match(prefixRegex)) return false
    if (extension && !filename.match(extensionRegex)) return false
    return filename.replace(prefix, '').replace(extensionRegex, '')
  };

  /**
   * @param queryLanguage - language query parameter, either an array or a string.
   * @return the first non-empty language query parameter found, null otherwise.
   */
  const extractQueryLanguage = (queryLanguage) => {
    if (Array.isArray(queryLanguage)) {
      return queryLanguage.find((lang) => lang !== '' && lang)
    }
    return typeof queryLanguage === 'string' && queryLanguage
  };

  /**
   * guess language setting based on http headers
   */

  const guessLanguage = (request) => {
    if (typeof request === 'object') {
      const languageHeader = request.headers
        ? request.headers[languageHeaderName]
        : undefined;
      const languages = [];
      const regions = [];

      request.languages = [defaultLocale];
      request.regions = [defaultLocale];
      request.language = defaultLocale;
      request.region = defaultLocale;

      // a query parameter overwrites all
      if (queryParameter && request.url) {
        const urlAsString =
          typeof request.url === 'string' ? request.url : request.url.toString();

        /**
         * @todo WHATWG new URL() requires full URL including hostname - that might change
         * @see https://github.com/nodejs/node/issues/12682
         */
        // eslint-disable-next-line node/no-deprecated-api
        const urlObj = url.parse(urlAsString, true);
        const languageQueryParameter = urlObj.query[queryParameter];
        if (languageQueryParameter) {
          let queryLanguage = extractQueryLanguage(languageQueryParameter);
          if (queryLanguage) {
            logDebug('Overriding locale from query: ' + queryLanguage);
            if (preserveLegacyCase) {
              queryLanguage = queryLanguage.toLowerCase();
            }
            return i18n.setLocale(request, queryLanguage)
          }
        }
      }

      // a cookie overwrites headers
      if (cookiename && request.cookies && request.cookies[cookiename]) {
        request.language = request.cookies[cookiename];
        return i18n.setLocale(request, request.language)
      }

      // 'accept-language' is the most common source
      if (languageHeader) {
        const acceptedLanguages = getAcceptedLanguagesFromHeader(languageHeader);
        let match;
        let fallbackMatch;
        let fallback;
        for (let i = 0; i < acceptedLanguages.length; i++) {
          const lang = acceptedLanguages[i];
          const lr = lang.split('-', 2);
          const parentLang = lr[0];
          const region = lr[1];

          // Check if we have a configured fallback set for this language.
          const fallbackLang = getFallback(lang, fallbacks);
          if (fallbackLang) {
            fallback = fallbackLang;
            // Fallbacks for languages should be inserted
            // where the original, unsupported language existed.
            const acceptedLanguageIndex = acceptedLanguages.indexOf(lang);
            const fallbackIndex = acceptedLanguages.indexOf(fallback);
            if (fallbackIndex > -1) {
              acceptedLanguages.splice(fallbackIndex, 1);
            }
            acceptedLanguages.splice(acceptedLanguageIndex + 1, 0, fallback);
          }

          // Check if we have a configured fallback set for the parent language of the locale.
          const fallbackParentLang = getFallback(parentLang, fallbacks);
          if (fallbackParentLang) {
            fallback = fallbackParentLang;
            // Fallbacks for a parent language should be inserted
            // to the end of the list, so they're only picked
            // if there is no better match.
            if (acceptedLanguages.indexOf(fallback) < 0) {
              acceptedLanguages.push(fallback);
            }
          }

          if (languages.indexOf(parentLang) < 0) {
            languages.push(parentLang.toLowerCase());
          }
          if (region) {
            regions.push(region.toLowerCase());
          }

          if (!match && locales[lang]) {
            match = lang;
            break
          }

          if (!fallbackMatch && locales[parentLang]) {
            fallbackMatch = parentLang;
          }
        }

        request.language = match || fallbackMatch || request.language;
        request.region = regions[0] || request.region;
        return i18n.setLocale(request, request.language)
      }
    }

    // last resort: defaultLocale
    return i18n.setLocale(request, defaultLocale)
  };

  /**
   * Get a sorted list of accepted languages from the HTTP Accept-Language header
   */
  const getAcceptedLanguagesFromHeader = (header) => {
    const languages = header.split(',');
    const preferences = {};
    return languages
      .map((item) => {
        const preferenceParts = item.trim().split(';q=');
        if (preferenceParts.length < 2) {
          preferenceParts[1] = 1.0;
        } else {
          const quality = parseFloat(preferenceParts[1]);
          preferenceParts[1] = quality || 0.0;
        }
        preferences[preferenceParts[0]] = preferenceParts[1];

        return preferenceParts[0]
      })
      .filter((lang) => preferences[lang] > 0)
      .sort((a, b) => preferences[b] - preferences[a])
  };

  /**
   * searches for locale in given object
   */

  const getLocaleFromObject = (obj) => {
    let locale;
    if (obj && obj.scope) {
      locale = obj.scope.locale;
    }
    if (obj && obj.locale) {
      locale = obj.locale;
    }
    return locale
  };

  /**
   * splits and parses a phrase for mathematical interval expressions
   */
  const parsePluralInterval = (phrase, count) => {
    let returnPhrase = phrase;
    const phrases = phrase.split(/\|/);
    let intervalRuleExists = false;

    // some() breaks on 1st true
    phrases.some((p) => {
      const matches = p.match(/^\s*([()[\]]+[\d,]+[()[\]]+)?\s*(.*)$/);

      // not the same as in combined condition
      if (matches != null && matches[1]) {
        intervalRuleExists = true;
        if (matchInterval(count, matches[1]) === true) {
          returnPhrase = matches[2];
          return true
        }
      } else {
        // this is a other or catch all case, this only is taken into account if there is actually another rule
        if (intervalRuleExists) {
          returnPhrase = p;
        }
      }
      return false
    });
    return returnPhrase
  };

  /**
   * test a number to match mathematical interval expressions
   * [0,2] - 0 to 2 (including, matches: 0, 1, 2)
   * ]0,3[ - 0 to 3 (excluding, matches: 1, 2)
   * [1]   - 1 (matches: 1)
   * [20,] - all numbers ≥20 (matches: 20, 21, 22, ...)
   * [,20] - all numbers ≤20 (matches: 20, 21, 22, ...)
   */
  const matchInterval = (number, interval) => {
    interval = parseInterval(interval);
    if (interval && typeof number === 'number') {
      if (interval.from.value === number) {
        return interval.from.included
      }
      if (interval.to.value === number) {
        return interval.to.included
      }

      return (
        Math.min(interval.from.value, number) === interval.from.value &&
        Math.max(interval.to.value, number) === interval.to.value
      )
    }
    return false
  };

  /**
   * read locale file, translate a msg and write to fs if new
   */
  const translate = (locale, singular, plural, skipSyncToAllFiles) => {
    // add same key to all translations
    if (!skipSyncToAllFiles && syncFiles) {
      syncToAllFiles(singular, plural);
    }

    if (locale === undefined) {
      logWarn(
        'WARN: No locale found - check the context of the call to __(). Using ' +
          defaultLocale +
          ' as current locale'
      );
      locale = defaultLocale;
    }

    // try to get a fallback
    if (!locales[locale]) {
      locale = getFallback(locale, fallbacks) || locale;
    }

    // attempt to read when defined as valid locale
    if (!locales[locale]) {
      read(locale);
    }

    // fallback to default when missed
    if (!locales[locale]) {
      logWarn(
        'WARN: Locale ' +
          locale +
          " couldn't be read - check the context of the call to $__. Using " +
          defaultLocale +
          ' (default) as current locale'
      );

      locale = defaultLocale;
      read(locale);
    }

    // dotnotaction add on, @todo: factor out
    let defaultSingular = singular;
    let defaultPlural = plural;
    if (objectNotation) {
      let indexOfColon = singular.indexOf(':');
      // We compare against 0 instead of -1 because
      // we don't really expect the string to start with ':'.
      if (indexOfColon > 0) {
        defaultSingular = singular.substring(indexOfColon + 1);
        singular = singular.substring(0, indexOfColon);
      }
      if (plural && typeof plural !== 'number') {
        indexOfColon = plural.indexOf(':');
        if (indexOfColon > 0) {
          defaultPlural = plural.substring(indexOfColon + 1);
          plural = plural.substring(0, indexOfColon);
        }
      }
    }

    const accessor = localeAccessor(locale, singular);
    const mutator = localeMutator(locale, singular);

    // if (plural) {
    //   if (accessor() == null) {
    //     mutator({
    //       'one': defaultSingular || singular,
    //       'other': defaultPlural || plural
    //     });
    //     write(locale);
    //   }
    // }
    // if (accessor() == null) {
    //   mutator(defaultSingular || singular);
    //   write(locale);
    // }
    if (plural) {
      if (accessor() == null) {
        // when retryInDefaultLocale is true - try to set default value from defaultLocale
        if (retryInDefaultLocale && locale !== defaultLocale) {
          logDebug(
            'Missing ' +
              singular +
              ' in ' +
              locale +
              ' retrying in ' +
              defaultLocale
          );
          mutator(translate(defaultLocale, singular, plural, true));
        } else {
          mutator({
            one: defaultSingular || singular,
            other: defaultPlural || plural
          });
        }
        write(locale);
      }
    }

    if (accessor() == null) {
      // when retryInDefaultLocale is true - try to set default value from defaultLocale
      if (retryInDefaultLocale && locale !== defaultLocale) {
        logDebug(
          'Missing ' +
            singular +
            ' in ' +
            locale +
            ' retrying in ' +
            defaultLocale
        );
        mutator(translate(defaultLocale, singular, plural, true));
      } else {
        mutator(defaultSingular || singular);
      }
      write(locale);
    }

    return accessor()
  };

  /**
   * initialize the same key in all locales
   * when not already existing, checked via translate
   */
  const syncToAllFiles = (singular, plural) => {
    // iterate over locales and translate again
    // this will implicitly write/sync missing keys
    // to the rest of locales
    for (const l in locales) {
      translate(l, singular, plural, true);
    }
  };

  /**
   * Allows delayed access to translations nested inside objects.
   * @param {String} locale The locale to use.
   * @param {String} singular The singular term to look up.
   * @param {Boolean} [allowDelayedTraversal=true] Is delayed traversal of the tree allowed?
   * This parameter is used internally. It allows to signal the accessor that
   * a translation was not found in the initial lookup and that an invocation
   * of the accessor may trigger another traversal of the tree.
   * @returns {Function} A function that, when invoked, returns the current value stored
   * in the object at the requested location.
   */
  const localeAccessor = (locale, singular, allowDelayedTraversal) => {
    // Bail out on non-existent locales to defend against internal errors.
    if (!locales[locale]) return Function.prototype

    // Handle object lookup notation
    const indexOfDot = objectNotation && singular.lastIndexOf(objectNotation);
    if (objectNotation && indexOfDot > 0 && indexOfDot < singular.length - 1) {
      // If delayed traversal wasn't specifically forbidden, it is allowed.
      if (typeof allowDelayedTraversal === 'undefined')
        allowDelayedTraversal = true;
      // The accessor we're trying to find and which we want to return.
      let accessor = null;
      // An accessor that returns null.
      const nullAccessor = () => null;
      // Do we need to re-traverse the tree upon invocation of the accessor?
      let reTraverse = false;
      // Split the provided term and run the callback for each subterm.
      singular.split(objectNotation).reduce((object, index) => {
        // Make the accessor return null.
        accessor = nullAccessor;
        // If our current target object (in the locale tree) doesn't exist or
        // it doesn't have the next subterm as a member...
        if (
          object === null ||
          !Object.prototype.hasOwnProperty.call(object, index)
        ) {
          // ...remember that we need retraversal (because we didn't find our target).
          reTraverse = allowDelayedTraversal;
          // Return null to avoid deeper iterations.
          return null
        }
        // We can traverse deeper, so we generate an accessor for this current level.
        accessor = () => object[index];
        // Return a reference to the next deeper level in the locale tree.
        return object[index]
      }, locales[locale]);
      // Return the requested accessor.
      return () =>
        // If we need to re-traverse (because we didn't find our target term)
        // traverse again and return the new result (but don't allow further iterations)
        // or return the previously found accessor if it was already valid.
        reTraverse ? localeAccessor(locale, singular, false)() : accessor()
    } else {
      // No object notation, just return an accessor that performs array lookup.
      return () => locales[locale][singular]
    }
  };

  /**
   * Allows delayed mutation of a translation nested inside objects.
   * @description Construction of the mutator will attempt to locate the requested term
   * inside the object, but if part of the branch does not exist yet, it will not be
   * created until the mutator is actually invoked. At that point, re-traversal of the
   * tree is performed and missing parts along the branch will be created.
   * @param {String} locale The locale to use.
   * @param {String} singular The singular term to look up.
   * @param [Boolean} [allowBranching=false] Is the mutator allowed to create previously
   * non-existent branches along the requested locale path?
   * @returns {Function} A function that takes one argument. When the function is
   * invoked, the targeted translation term will be set to the given value inside the locale table.
   */
  const localeMutator = function (locale, singular, allowBranching) {
    // Bail out on non-existent locales to defend against internal errors.
    if (!locales[locale]) return Function.prototype

    // Handle object lookup notation
    const indexOfDot = objectNotation && singular.lastIndexOf(objectNotation);
    if (objectNotation && indexOfDot > 0 && indexOfDot < singular.length - 1) {
      // If branching wasn't specifically allowed, disable it.
      if (typeof allowBranching === 'undefined') allowBranching = false;
      // This will become the function we want to return.
      let accessor = null;
      // An accessor that takes one argument and returns null.
      const nullAccessor = () => null;
      // Fix object path.
      let fixObject = () => ({});
      // Are we going to need to re-traverse the tree when the mutator is invoked?
      let reTraverse = false;
      // Split the provided term and run the callback for each subterm.
      singular.split(objectNotation).reduce((object, index) => {
        // Make the mutator do nothing.
        accessor = nullAccessor;
        // If our current target object (in the locale tree) doesn't exist or
        // it doesn't have the next subterm as a member...
        if (
          object === null ||
          !Object.prototype.hasOwnProperty.call(object, index)
        ) {
          // ...check if we're allowed to create new branches.
          if (allowBranching) {
            // Fix `object` if `object` is not Object.
            if (object === null || typeof object !== 'object') {
              object = fixObject();
            }
            // If we are allowed to, create a new object along the path.
            object[index] = {};
          } else {
            // If we aren't allowed, remember that we need to re-traverse later on and...
            reTraverse = true;
            // ...return null to make the next iteration bail our early on.
            return null
          }
        }
        // Generate a mutator for the current level.
        accessor = (value) => {
          object[index] = value;
          return value
        };
        // Generate a fixer for the current level.
        fixObject = () => {
          object[index] = {};
          return object[index]
        };

        // Return a reference to the next deeper level in the locale tree.
        return object[index]
      }, locales[locale]);

      // Return the final mutator.
      return (value) => {
        // If we need to re-traverse the tree
        // invoke the search again, but allow branching
        // this time (because here the mutator is being invoked)
        // otherwise, just change the value directly.
        value = missingKeyFn(locale, value);
        return reTraverse
          ? localeMutator(locale, singular, true)(value)
          : accessor(value)
      }
    } else {
      // No object notation, just return a mutator that performs array lookup and changes the value.
      return (value) => {
        value = missingKeyFn(locale, value);
        locales[locale][singular] = value;
        return value
      }
    }
  };

  /**
   * try reading a file
   */
  const read = (locale) => {
    let localeFile = {};
    const file = getStorageFilePath(locale);
    try {
      logDebug('read ' + file + ' for locale: ' + locale);
      localeFile = fs.readFileSync(file, 'utf-8');
      try {
        // parsing filecontents to locales[locale]
        locales[locale] = parser.parse(localeFile);
      } catch (parseError) {
        logError(
          'unable to parse locales from file (maybe ' +
            file +
            ' is empty or invalid json?): ',
          parseError
        );
      }
    } catch (readError) {
      // unable to read, so intialize that file
      // locales[locale] are already set in memory, so no extra read required
      // or locales[locale] are empty, which initializes an empty locale.json file
      // since the current invalid locale could exist, we should back it up
      if (fs.existsSync(file)) {
        logDebug(
          'backing up invalid locale ' + locale + ' to ' + file + '.invalid'
        );
        fs.renameSync(file, file + '.invalid');
      }

      logDebug('initializing ' + file);
      write(locale);
    }
  };

  /**
   * try writing a file in a created directory
   */
  const write = (locale) => {
    let stats, target, tmp;

    // don't write new locale information to disk if updateFiles isn't true
    if (!updateFiles) {
      return
    }

    // creating directory if necessary
    try {
      stats = fs.lstatSync(directory);
    } catch (e) {
      logDebug('creating locales dir in: ' + directory);
      try {
        fs.mkdirSync(directory, directoryPermissions);
      } catch (e) {
        // in case of parallel tasks utilizing in same dir
        if (e.code !== 'EEXIST') throw e
      }
    }

    // first time init has an empty file
    if (!locales[locale]) {
      locales[locale] = {};
    }

    // writing to tmp and rename on success
    try {
      target = getStorageFilePath(locale);
      tmp = target + '.tmp';
      fs.writeFileSync(
        tmp,
        parser.stringify(locales[locale], null, indent),
        'utf8'
      );
      stats = fs.statSync(tmp);
      if (stats.isFile()) {
        fs.renameSync(tmp, target);
      } else {
        logError(
          'unable to write locales to file (either ' +
            tmp +
            ' or ' +
            target +
            ' are not writeable?): '
        );
      }
    } catch (e) {
      logError(
        'unexpected error writing files (either ' +
          tmp +
          ' or ' +
          target +
          ' are not writeable?): ');
    }
  };

  /**
   * basic normalization of filepath
   */
  const getStorageFilePath = (locale) => {
    // changed API to use .json as default, #16
    const ext = extension || '.json';
    const filepath = path.normalize(directory + pathsep + prefix + locale + ext);
    const filepathJS = path.normalize(
      directory + pathsep + prefix + locale + '.js'
    );
    // use .js as fallback if already existing
    try {
      if (fs.statSync(filepathJS)) {
        logDebug('using existing file ' + filepathJS);
        extension = '.js';
        return filepathJS
      }
    } catch (e) {
      logDebug('will use ' + filepath);
    }
    return filepath
  };

  /**
   * Get locales with wildcard support
   */
  const getFallback = (targetLocale, fallbacks) => {
    fallbacks = fallbacks || {};
    if (fallbacks[targetLocale]) return fallbacks[targetLocale]
    let fallBackLocale = null;
    for (const key in fallbacks) {
      if (targetLocale.match(new RegExp('^' + key.replace('*', '.*') + '$'))) {
        fallBackLocale = fallbacks[key];
        break
      }
    }
    return fallBackLocale
  };

  /**
   * Logging proxies
   */
  const logDebug = (msg) => {
    logDebugFn(msg);
  };

  const logWarn = (msg) => {
    logWarnFn(msg);
  };

  const logError = (msg) => {
    logErrorFn(msg);
  };

  /**
   * Missing key function
   */
  const missingKey = (locale, value) => {
    return value
  };

  /**
   * implicitly configure when created with given options
   * @example
   * const i18n = new I18n({
   *   locales: ['en', 'fr']
   * });
   */
  if (_OPTS) i18n.configure(_OPTS);

  return i18n
};

var i18n_1 = i18n$1;

const i18n = i18n_1;

/**
 * defaults to singleton, backward compat
 */
i18n$2.exports = i18n();

/**
 * exports constructor with capital letter
 */
var I18n = i18n$2.exports.I18n = i18n;

exports.I18n = I18n;
exports.chalk = chalk;
exports.commonjsGlobal = commonjsGlobal;
exports.getAugmentedNamespace = getAugmentedNamespace;
exports.getDefaultExportFromCjs = getDefaultExportFromCjs;
exports.requireSupportsColor = requireSupportsColor;
exports.srcExports = srcExports;

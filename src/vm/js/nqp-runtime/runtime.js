'use strict';
var op = {};
exports.op = op;

var refs = require('./refs.js');

var NQPInt = require('./nqp-int.js');
var NQPException = require('./nqp-exception.js');

var nullStr = require('./null_s.js');
var Null = require('./null.js');

var Capture = require('./capture.js');

var StaticCtx = require('./static-ctx.js');

const BOOT = require('./BOOT.js');

const nativeArgs = require('./native-args.js');

const NativeIntArg = exports.NativeIntArg = nativeArgs.NativeIntArg;
const NativeNumArg = exports.NativeNumArg = nativeArgs.NativeNumArg;
const NativeStrArg = exports.NativeStrArg = nativeArgs.NativeStrArg;

const fs = require('fs');

exports.NQPInt = NQPInt;

function loadOps(module) {
  for (var name in module.op) {
    op[name] = module.op[name];
  }
}

exports.loadOps = loadOps;

var core = require('./core');
loadOps(core);
exports.hash = core.hash;
exports.slurpyNamed = core.slurpyNamed;
exports.slurpyPos = core.slurpyPos;
exports.named = core.named;
exports.unwrapNamed = core.unwrapNamed;
exports.arg = core.arg;

exports.intToObj = core.intToObj;
exports.numToObj = core.numToObj;
exports.strToObj = core.strToObj;

exports.EvalResult = core.EvalResult;

var io = require('./io.js');
loadOps(io);

var bignum = require('./bignum.js');
loadOps(bignum);

var nfa = require('./nfa.js');
loadOps(nfa);

var cclass = require('./cclass.js');
loadOps(cclass);

var hll = require('./hll.js');
loadOps(hll);

loadOps(require('./multicache.js'));

var deserialization = require('./deserialization.js');
exports.wval = deserialization.wval;
loadOps(deserialization);

var serialization = require('./serialization.js');
loadOps(serialization);

var nativecall = require('./nativecall.js');
loadOps(nativecall);

var CodeRef = require('./code-ref.js');
exports.CodeRef = CodeRef;

exports.CodeRefWithStateVars = require('./code-ref-with-statevars.js');

exports.CurLexpad = require('./curlexpad.js');

var Ctx = require('./ctx.js');
module.exports.Ctx = Ctx;

module.exports.CtxWithStatic = require('./ctx-with-static.js');
module.exports.CtxJustHandler = require('./ctx-just-handler.js');

var bootstrap = require('./bootstrap.js');
module.exports.knowhowattr = bootstrap.knowhowattr;
module.exports.knowhow = bootstrap.knowhow;

loadOps(refs);
for (let name in refs.helpers) {
  exports[name] = refs.helpers[name];
}

let libpath = [];
exports.libpath = function(paths) {
  libpath = paths;
};

exports.loaderCtx = null;

op.loadbytecode = function(ctx, file) {
  // HACK - temporary hack for rakudo-js
  if (file == '/nqp/lib/Perl6/BOOTSTRAP.js') {
    file = 'Perl6::BOOTSTRAP';
  }

  var loadFrom;
  if (ctx && ((loadFrom = ctx.lookupDynamic('$*LOADBYTECODE_FROM')) !== Null)) {
  } else {
    loadFrom = module;
  }

  var oldLoaderCtx = exports.loaderCtx;
  exports.loaderCtx = ctx;
  var mangled = file.replace(/::/g, '-');

  var prefixes = libpath.slice();
  prefixes.push('./', './nqp-js-on-js/');
  var found = false;
  for (var prefix of prefixes) {
    try {
      loadFrom.require(prefix + mangled);
      found = true;
      break;
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
    }
  }
  if (!found) throw `can't find: ${file}, looking in: ${prefixes.join(', ')} from ${loadFrom.filename}`;
  exports.loaderCtx = oldLoaderCtx;

  return file;
};

op.loadbytecodefh = function(ctx, fh, file) {
  let oldLoaderCtx = exports.loaderCtx;
  exports.loaderCtx = ctx;
  let js = fs.readFileSync(fh.fd, {encoding: 'utf8'});
  eval(js);
  exports.loaderCtx = oldLoaderCtx;
};

op.ctxlexpad = function(ctx) {
  if (ctx instanceof Ctx) {
    return ctx;
  } else if (ctx instanceof StaticCtx) {
    return ctx;
  } else {
    console.trace('ctxlexpad needs a ctx as an argument');
    throw 'ctxlexpad needs a ctx as an argument';
  }
};

op.lexprimspec = function(pad, key) {
  // HACK
  return 0;
};

op.ctxouter = function(ctx) {
  return ctx.$$outer === null ? Null : ctx.$$outer;
};

exports.currentDispatcherFor = undefined;

op.setdispatcherfor = function(dispatcher, dispatcherFor) {
  exports.currentDispatcher = dispatcher;
  let spec;
  if (dispatcherFor instanceof CodeRef) {
    exports.currentDispatcherFor = dispatcherFor;
  } else if (spec = dispatcherFor._STable.invocationSpec) {
    if (spec.classHandle) {
      exports.currentDispatcherFor = dispatcherFor.$$getattr(spec.classHandle, spec.attrName);
    } else {
      throw 'setdispatcherfor needs simple invokable target';
    }
  } else {
    throw 'setdispatcherfor needs invokable target';
  }
};

exports.toStr = function(arg_, ctx) {
  var arg = arg_.$$decont(ctx);
  if (typeof arg == 'number') {
    return numToStr(arg);
  } else if (typeof arg == 'string') {
    return arg;
  } else if (arg === Null) {
    return '';
  } else if (arg === nullStr) {
    return arg;
  } else if (arg.typeObject_) {
    return '';
  } else if (arg.$$getStr) {
    return arg.$$getStr();
  } else if (arg.Str) {
    let ret = arg.Str(ctx, null, arg).$$decont(ctx); // eslint-disable-line new-cap
    if (typeof ret == 'string') return ret;
    return ret.$$getStr();
  } else if (arg.$$getNum) {
    return numToStr(arg.$$getNum());
  } else if (arg.$$getInt) {
    return arg.$$getInt().toString();
  } else {
    throw new NQPException(`Can't convert to str`);
  }
};

function strToNum(str) {
  if (str === 'NaN') return NaN;
  if (str === 'Inf') return Infinity;
  if (str === '-Inf') return -Infinity;
  if (str === '+Inf') return Infinity;
  let parsed = parseFloat(str);
  if (isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

exports.strToNum = strToNum;

function numToStr(num) {
  if (num === Infinity) return 'Inf';
  if (num === -Infinity) return '-Inf';
  if (num === 0 && 1/num === -Infinity) return '-0';

  return num.toString();
}

exports.numToStr = numToStr;

exports.toNum = function(arg_, ctx) {
  let arg = arg_.$$decont(ctx);
  if (typeof arg == 'number') {
    return arg;
  } else if (arg === Null) {
    return 0;
  } else if (typeof arg == 'string') {
    return strToNum(arg);
  } else if (arg._STable && arg._STable.methodCache && arg._STable.methodCache.get('Num')) {
    var result = arg.Num(ctx, null, arg); // eslint-disable-line new-cap
    if (result.$$getNum) {
      return result.$$getNum();
    } else if (result.$$numify) {
      return result.$$numify();
    } else if (typeof result == 'number') {
      return result;
    } else {
      throw new NQPException('we can\'t numify result of toNum');
    }
  } else if (arg.typeObject_) {
    return 0;
  } else if (arg.$$getNum) {
    return arg.$$getNum();
  } else if (arg.$$getInt) {
    return arg.$$getInt();
  } else if (arg.$$numify) {
    return arg.$$numify();
  } else {
    throw 'Can\'t convert to num';
  }
};

exports.toInt = function(arg, ctx) {
  return (exports.toNum(arg, ctx) | 0);
};


if (!Math.imul) {
  /* Polyfill from:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
  */
  Math.imul = function(a, b) {
    var ah = (a >>> 16) & 0xffff;
    var al = a & 0xffff;
    var bh = (b >>> 16) & 0xffff;
    var bl = b & 0xffff;
    // the shift by 0 fixes the sign on the high part
    // the final |0 converts the unsigned value into a signed value
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
  };
}

// Placeholder
exports.topContext = function() {
  return null;
};

// helper for regexs
exports.regexPeek = function(bstack, mark) {
  var ptr = bstack.length;
  while (ptr >= 0) {
    if (bstack[ptr] == mark) break;
    ptr -= 4;
  }
  return ptr;
};

exports.regexCommit = function(bstack, mark) {
  var ptr = bstack.length;
  var caps;
  if (ptr > 0) {
    caps = bstack[ptr - 1];
  } else {
    caps = 0;
  }

  while (ptr >= 0) {
    if (bstack[ptr] == mark) {
      break;
    }
    ptr -= 4;
  }

  bstack.length = ptr;

  if (caps > 0) {
    if (ptr > 0) {
      /* top mark frame is an autofail frame, reuse it to hold captures */
      if (bstack[ptr - 3] < 0) {
        bstack[ptr - 1] = caps;
      }
    }

    /* push a new autofail frame onto bstack to hold the captures */
    bstack.push(0, -1, 0, caps);
  }
};

exports.NYI = function(msg) {
  console.trace(msg);
  return null;
};

exports.args = function(module) {
  return require.main === module ? process.argv.slice(1) : [];
};

exports.NQPException = NQPException;

exports.wrapException = function(e) {
  return new NQPException('<<wrapped exception:\n' + e.stack + '\n>>\n');
};

exports.setCodeRefHLL = function(codeRefs, currentHLL) {
  for (var i = 0; i < codeRefs.length; i++) {
    codeRefs[i].hll = currentHLL;
  }
};


/* TODO - make monkey patching builtin things optional */

Number.prototype.$$decont = function(ctx) {
  return this;
};

Number.prototype.$$toBool = function(ctx) {
  return this === 0 ? 0 : 1;
};

Number.prototype.$$istype = function(ctx, type) {
  return 0;
};

Number.prototype.$$can = function(ctx, name) {
  return 0;
};

Number.prototype.$$isrwcont = function(ctx) {
  return 0;
};

Number.prototype.$$getNum = function() {
  return this;
};

Number.prototype.$$getInt = function() {
  return this;
};

String.prototype.$$decont = function(ctx) {
  return this;
};

String.prototype.$$toBool = function(ctx) {
  return this === '' ? 0 : 1;
};

String.prototype.$$can = function(ctx, name) {
  return 0;
};

String.prototype.$$istype = function(ctx, type) {
  return 0;
};

String.prototype.$$isrwcont = function(ctx) {
  return 0;
};

String.prototype.$$getStr = function() {
  return this;
};

// needed for continuations
Function.prototype.$$toBool = function(ctx) {
  return 1;
};


exports.null_s = nullStr;
exports.Null = Null;

exports.list = hll.list;


exports.list_i = function lowlevelList(array) {
  let stable = BOOT.IntArray._STable;
  return stable.REPR.allocateFromArray(stable, array);
};

exports.list_n = function lowlevelList(array) {
  let stable = BOOT.NumArray._STable;
  return stable.REPR.allocateFromArray(stable, array);
};

exports.list_s = function lowlevelList(array) {
  let stable = BOOT.StrArray._STable;
  return stable.REPR.allocateFromArray(stable, array);
};

exports.slurpyArray = hll.slurpyArray;
exports.createArray = require('./BOOT').createArray;

exports.dumpObj = function(obj) {
  console.log(typeof obj);
  if (typeof obj === 'object') {
    if (obj._STable) {
      console.log(obj._STable.REPR.name);
      console.log(obj._STable.HOW.name(null, null, obj._STable.HOW, obj));
    } else {
      console.log('no STable', obj.constructor.name);
    }
  } else {
    console.log(obj);
  }
};

let containerSpecs = require('./container-specs.js');
exports.extraRuntime = function(lang, path) {
  if (lang != 'perl6') throw 'only loading extra runtime for perl 6 is supported';
  let runtime = require(path);
  if (!runtime.loaded) {
    runtime.loaded = true;
    runtime.load(exports, CodeRef, Capture, containerSpecs);
  }
};

exports.paramcheckfailed = function(currentHLL, ctx, args) {
  let capture = new Capture(args[1], Array.prototype.slice.call(args, 2));
  return currentHLL.get('bind_error').$$call(ctx, null, capture);
};

let execname;
exports.execname = function(path) {
  execname = path;
};

op.execname = function() {
  return execname;
};

exports.exitHandler = function(ctx, currentHLL, value) {
  currentHLL.get('exit_handler').$$call(ctx, null, ctx.codeRef(), value === undefined ? Null : value);
};

exports.NativeRef = require('./reprs.js').NativeRef;

exports.getHLL = hll.getHLL;

exports.tooFewPos = function(got, expected) {
  throw new NQPException(`Too few positionals passed; expected ${expected} arguments but got ${got-2}`);
};

exports.tooManyPos = function(got, expected) {
  throw new NQPException(`Too many positionals passed; expected ${expected} arguments but got ${got-2}`);
};


exports.arg_i = function(ctx, contedArg) {
  if (contedArg instanceof NativeIntArg) {
    return contedArg.value;
  } else if (contedArg instanceof NativeNumArg) {
    throw new NQPException('Expected native int argument, but got num');
  } else if (contedArg instanceof NativeStrArg) {
    throw new NQPException('Expected native int argument, but got str');
  }

  const arg = contedArg.$$decont(ctx);
  if (arg instanceof NQPInt) {
    return arg.value;
  } else if (arg.$$getInt) {
    return arg.$$getInt();
  } else {
    throw new NQPException('Expected native int argument, but got something else');
  }
};

exports.arg_n = function(ctx, contedArg) {
  if (contedArg instanceof NativeNumArg) {
    return contedArg.value;
  } else if (contedArg instanceof NativeIntArg) {
    throw new NQPException('Expected native num argument, but got int');
  } else if (contedArg instanceof NativeStrArg) {
    throw new NQPException('Expected native num argument, but got str');
  }

  const arg = contedArg.$$decont(ctx);
  if (typeof arg === 'number') {
    return arg;
  } else if (arg.$$getNum) {
    return arg.$$getNum();
  } else {
    throw new NQPException('Expected native num argument, but got something else');
  }
};

exports.arg_s = function(ctx, contedArg) {
  if (contedArg instanceof NativeStrArg) {
    return contedArg.value;
  } else if (contedArg instanceof NativeIntArg) {
    throw new NQPException('Expected native str argument, but got int');
  } else if (contedArg instanceof NativeNumArg) {
    throw new NQPException('Expected native str argument, but got num');
  }

  const arg = contedArg.$$decont(ctx);
  if (typeof arg === 'string') {
    return arg;
  } else if (arg.$$getStr) {
    return arg.$$getStr();
  } else {
    throw new NQPException('Expected native str argument, but got something else');
  }
};

exports.missingNamed = function(name) {
  throw new NQPException(`Required named parameter '${name}' not passed`);
};


const chunkNamesToTypes = {
  T_OBJ: 0,
  T_INT: 1,
  T_NUM: 2,
  T_STR: 3,
  T_BOOL: 4,
  T_CALL_ARG: 5,
  T_INT16: 6,

  T_VOID: -1,
  T_NONVAL: -2,
  T_ARGS: -3,
  T_ARGS_ARRAY: -4,
};

const chunkTypesToNames = {};
for (let name of Object.keys(chunkNamesToTypes)) {
  chunkTypesToNames[chunkNamesToTypes[name]] = name;
}

exports.coercion = function(got, expected) {
  throw new Error("Can't convert, got: " + chunkTypesToNames[got] + ' expected:' + chunkTypesToNames[expected]);
};

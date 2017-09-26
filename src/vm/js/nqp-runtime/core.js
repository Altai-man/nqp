var op = {};
exports.op = op;

var os = require('os');

var Hash = require('./hash.js');
var CodeRef = require('./code-ref.js');

var Ctx = require('./ctx.js');

var NQPInt = require('./nqp-int.js');

var NQPException = require('./nqp-exception.js');

var reprs = require('./reprs.js');

var hll = require('./hll.js');

var NQPObject = require('./nqp-object.js');

var constants = require('./constants.js');

var containerSpecs = require('./container-specs.js');

var Null = require('./null.js');
const null_s = require('./null_s.js');

var BOOT = require('./BOOT.js');

var exceptionsStack = require('./exceptions-stack.js');

var repossession = require('./repossession.js');

var sixmodel = require('./sixmodel.js');

var Capture = require('./capture.js');

const shortid = require('shortid');

exports.CodeRef = CodeRef;

op.isinvokable = function(obj) {
  return (obj instanceof CodeRef || (obj._STable && obj._STable.invocationSpec) ? 1 : 0);
};

op.escape = function(str) {
  return str
      .replace(/\\/g, '\\\\')
      .replace(/\x1B/g, '\\e')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\f/g, '\\f')
      .replace(/[\b]/g, '\\b')
      .replace(/"/g, '\\"');
};

function radixHelper(radix, str, zpos, flags) {
  var lowercase = 'a-' + String.fromCharCode('a'.charCodeAt(0) + radix - 11);
  var uppercase = 'A-' + String.fromCharCode('A'.charCodeAt(0) + radix - 11);

  var letters = radix >= 11 ? lowercase + uppercase : '';

  var digitclass = '[0-' + Math.min(radix - 1, 9) + letters + ']';
  var minus = flags & 0x02 ? '(?:-?|\\+?)' : '';
  var regex = new RegExp(
      '^' + minus + digitclass + '(?:_' +
      digitclass + '|' + digitclass + ')*');
  var str = str.slice(zpos);
  var search = str.match(regex);
  if (search == null) {
    return null;
  }
  var number = search[0].replace(/_/g, '').replace(/^\+/, '');
  if (flags & 0x01) number = '-' + number;
  if (flags & 0x04) number = number.replace(/0+$/, '');
  var power = number[0] == '-' ? number.length - 1 : number.length;
  return {power: power, offset: zpos + search[0].length, number: number};
}

exports.radixHelper = radixHelper;

op.radix = function(currentHLL, radix, str, zpos, flags) {
  var extracted = radixHelper(radix, str, zpos, flags);
  if (extracted == null) {
    return hll.slurpyArray(currentHLL, [0, 1, -1]);
  }
  var pow = Math.pow(radix, extracted.power);
  return hll.slurpyArray(currentHLL, [parseInt(extracted.number, radix), pow, extracted.offset]);
};

op.setdebugtypename = function(type, debugName) {
  type._STable.debugName = debugName;
  return type;
};

exports.hash = function() {
  return new Hash();
};

const nativeArgs = require('./native-args.js');
const NativeIntArg = nativeArgs.NativeIntArg;
const NativeNumArg = nativeArgs.NativeNumArg;
const NativeStrArg = nativeArgs.NativeStrArg;

const intToObj = exports.intToObj = function(currentHLL, i) {
  const type = currentHLL.get('int_box');
  if (!type) {
    return new NQPInt(i);
  } else {
    var repr = type._STable.REPR;
    var obj = repr.allocate(type._STable);
    obj.$$setInt(i);
    return obj;
  }
};

const numToObj = exports.numToObj = function(currentHLL, n) {
  const type = currentHLL.get('num_box');
  if (!type) {
    return n;
  } else {
    var repr = type._STable.REPR;
    var obj = repr.allocate(type._STable);
    obj.$$setNum(n);
    return obj;
  }
};

const strToObj = exports.strToObj = function(currentHLL, s) {
  const type = currentHLL.get('str_box');
  if (!type) {
    return s;
  } else {
    var repr = type._STable.REPR;
    var obj = repr.allocate(type._STable);
    obj.$$setStr(s);
    return obj;
  }
};

const arg = exports.arg = function(currentHLL, arg) {
  if (arg instanceof NativeIntArg) {
    return intToObj(currentHLL, arg.value);
  }
  else if (arg instanceof NativeNumArg) {
    return numToObj(currentHLL, arg.value);
  }
  else if (arg instanceof NativeStrArg) {
    return strToObj(currentHLL, arg.value);
  } else {
    return arg;
  }
};

exports.slurpyPos = function(currentHLL, args, from) {
  const unpacked = new Array(args.length - from);
  for (let i=from; i < args.length; i++) {
    unpacked[i-from] = arg(currentHLL, args[i]);
  }
  return hll.slurpyArray(currentHLL, unpacked);
};

exports.slurpyNamed = function(currentHLL, named, skip) {
  const hash = new Hash();
  for (key in named) {
    if (!skip[key]) {
      hash.content.set(key, arg(currentHLL, named[key]));
    }
  }
  return hash;
};

exports.unwrapNamed = function(named) {
  if (!named instanceof Hash) console.log('expecting a hash here');
  return named.$$toObject();
};

exports.named = function(parts) {
  var all = {};
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    for (var key in part) {
      all[key] = part[key];
    }
  }
  return all;
};

exports.op.ishash = function(obj) {
  return obj instanceof Hash || (obj._STable && obj._STable.REPR instanceof reprs.VMHash) ? 1 : 0;
};

op.create = function(obj) {
  return obj._STable.REPR.allocate(obj._STable);
};

op.bootarray = function() {
  return BOOT.Array;
};

op.defined = function(obj) {
  // TODO - handle more things that aren't defined
  if (obj === Null || obj.typeObject_) {
    return 0;
  }
  return 1;
};


op.setinvokespec = function(obj, classHandle, attrName, invocationHandler) {
  obj._STable.setinvokespec(classHandle, attrName, invocationHandler);
  return obj;
};

// Stub
op.setboolspec = function(obj, mode, method) {
  obj._STable.setboolspec(mode, method);
  return obj;
};


op.savecapture = function(args) {
  return new Capture(args[1], Array.prototype.slice.call(args, 2));
};

op.captureposelems = function(capture) {
  return capture.pos.length;
};

op.captureposarg = function(currentHLL, capture, i) {
  return arg(currentHLL, capture.pos[i]);
};

op.captureposarg_i = function(capture, i) {
  return op.unbox_i(capture.pos[i]);
};

op.captureposarg_s = function(capture, i) {
  return op.unbox_s(capture.pos[i]);
};

op.captureposarg_n = function(capture, i) {
  return op.unbox_n(capture.pos[i]);
};

op.capturehasnameds = function(capture) {
  return (!capture.named || Object.keys(capture.named).length == 0) ? 0 : 1;
};

op.captureexistsnamed = function(capture, arg) {
  return (capture.named && capture.named.hasOwnProperty(arg)) ? 1 : 0;
};

op.capturenamedshash = function(currentHLL, capture) {
  var hash = new Hash();
  for (key in capture.named) {
    hash.content.set(key, arg(currentHLL, capture.named[key]));
  }
  return hash;
};

op.setcodeobj = function(codeRef, codeObj) {
  codeRef.codeObj = codeObj;
  return codeRef;
};
op.getcodeobj = function(codeRef) {
  const codeObj = codeRef.codeObj;
  return (codeObj === undefined ? Null : codeObj);
};

op.settypecache = function(obj, cache) {
  obj._STable.typeCheckCache = cache.array;
  if (obj._STable._SC !== undefined) obj._STable.scwb();
  return obj;
};

op.settypecheckmode = function(obj, mode) {
  const TYPE_CHECK_CACHE_FLAG_MASK = 3;
  obj._STable.modeFlags = mode | (obj.STable.modeFlags & TYPE_CHECK_CACHE_FLAG_MASK);
  return obj;
};

op.setmethcache = function(obj, cache) {
  if (!cache instanceof Hash) {
    console.log('we expect a hash here');
  }
  obj._STable.setMethodCache(cache.content);
  if (obj._STable._SC !== undefined) obj._STable.scwb();
  return obj;
};

op.setmethcacheauth = function(obj, isAuth) {
  if (isAuth) {
    obj._STable.modeFlags |= constants.METHOD_CACHE_AUTHORITATIVE;
  } else {
    obj._STable.modeFlags &= ~constants.METHOD_CACHE_AUTHORITATIVE;
  }
  if (obj._STable._SC !== undefined) obj._STable.scwb();
  return obj;
};

op.reprname = function(obj) {
  if (obj._STable) {
    return obj._STable.REPR.name;
  } else if (obj instanceof Capture) {
    return 'MVMCallCapture';
  } else if (obj instanceof NQPInt) {
    return 'P6int';
  } else if (typeof obj == 'string') {
    return 'P6str';
  } else if (typeof obj == 'number') {
    return 'P6num';
  } else {
    console.log(obj);
    throw new Error('unsupported thing passed to reprname');
  }
};

op.newtype = function(how, repr) {
  if (!reprs[repr]) {
    throw 'Unknown REPR: ' + repr;
  }
  var REPR = new reprs[repr]();
  REPR.name = repr;
  return REPR.typeObjectFor(how);
};

op.findmethod = function(ctx, obj, name) {
  var method = sixmodel.findMethod(ctx, obj, name);
  if (method === Null) {
    throw new NQPException(`Cannot find method '${name}' on object of type '${obj._STable.debugName}'`);
  }
  return method;
};

op.getcodename = function(code) {
  return code.name;
};

op.setcodename = function(code, name) {
  code.name = name;
  return code;
};

op.rebless = function(obj, newType) {
  obj._STable.REPR.changeType(obj, newType);
  if (obj._SC !== undefined) obj.$$scwb();
  return obj;
};

op.composetype = function(obj, reprinfo) {
  obj._STable.REPR.compose(obj._STable, reprinfo);
};

var whereCounter = 0;
op.where = function(obj) {
  if (obj._STable || obj instanceof CodeRef || obj === Null) { // HACK
    if (!obj._WHERE) {
      obj._WHERE = ++whereCounter;
    }
    return obj._WHERE;
  } else {
    throw 'WHERE/objectid on this type of thing unimplemented';
  }
};

op.objectid = op.where;

/* HACK - take the current HLL settings into regard */


var sha1 = require('sha1');

op.sha1 = function(text) {
  return sha1(text).toUpperCase();
};

op.curlexpad = function(get, set) {
  return new CurLexpad(get, set);
};

op.setcontspec = function(type, specType, conf) {
  if (containerSpecs[specType]) {
    type._STable.containerSpec = new containerSpecs[specType](type._STable);
    type._STable.containerSpec.configure(conf);
  } else {
    throw 'NYI cont spec: ' + specType;
  }
};

op.iscont = function(cont) {
  return cont.$$iscont ? cont.$$iscont() : 0;
};

op.iscont_i = function(cont) {
  if (cont.typeObject_) return 0;
  if (cont.$$iscont_i) return cont.$$iscont_i();
  return 0;
};

op.iscont_n = function(cont) {
  if (cont.typeObject_) return 0;
  if (cont.$$iscont_n) return cont.$$iscont_n();
  return 0;
};

op.iscont_s = function(cont) {
  if (cont.typeObject_) return 0;
  if (cont.$$iscont_s) {
    return cont.$$iscont_s();
  }
  return 0;
};

op.isrwcont = function(cont) {
  return cont.$$isrwcont ? cont.$$isrwcont() : 0;
};

op.box_n = function(n, type) {
  var repr = type._STable.REPR;
  var obj = repr.allocate(type._STable);
  obj.$$setNum(n);
  return obj;
};

op.unbox_n = function(obj) {
  if (typeof obj == 'number') return obj;
  return obj.$$getNum();
};

op.box_s = function(value, type) {
  var repr = type._STable.REPR;
  var obj = repr.allocate(type._STable);
  obj.$$setStr(value);
  return obj;
};

op.unbox_s = function(obj) {
  if (typeof obj == 'string') return obj;
  return obj.$$getStr();
};


op.box_i = function(i, type) {
  var repr = type._STable.REPR;
  var obj = repr.allocate(type._STable);
  obj.$$setInt(i);
  return obj;
};

op.unbox_i = function(obj) {
  if (typeof obj == 'number') return obj;
  return obj.$$getInt();
};

op.setelems = function(obj, elems) {
  obj.$$setelems(elems);
  return obj;
};

op.markcodestatic = function(code) {
  code.isStatic = true;
  return code;
};

op.markcodestub = function(code) {
  code.isCompilerStub = true;
  return code;
};

op.freshcoderef = function(code) {
  var fresh = code.$$clone();
  fresh.staticCode = fresh;
  return fresh;
};

op.pushcompsc = function(sc) {
  repossession.compilingSCs.push(sc);
  return sc;
};

op.popcompsc = function(sc) {
  return repossession.compilingSCs.pop();
};

op.scwbenable = function() {
  return --repossession.scwbDisableDepth;
};

op.scwbdisable = function() {
  return ++repossession.scwbDisableDepth;
};

var compilerRegistry = new Map();

op.bindcomp = function(language, compiler) {
  compilerRegistry.set(language, compiler);
  return compiler;
};

class WrappedFunction extends NQPObject {
  constructor(func) {
    super();
    this.func = func;
  }

  $$apply(args) {
    var converted = [];
    for (var i = 2; i < args.length; i++) {
      converted.push(toJS(args[i]));
    }
    return fromJS(this.func.apply(null, converted));
  }

  $$call(args) {
    return this.$$apply(arguments);
  }
};

function fromJS(obj) {
  if (typeof obj === 'function') {
    return new WrappedFunction(obj);
  } else if (obj === undefined) {
    return Null;
  } else {
    return obj;
  }
}

function toJS(obj) {
  if (obj instanceof NativeIntArg) {
    return obj.value;
  } else if (obj instanceof NativeNumArg) {
    return obj.value;
  } else if (obj instanceof NativeStrArg) {
    return obj.value;
  } else if (obj instanceof NQPInt) {
    return obj.value;
  } else if (obj instanceof CodeRef) {
    return function() {
      var converted = [null, {}];
      for (var i = 0; i < arguments.length; i++) {
        converted.push(fromJS(arguments[i]));
      }
      return toJS(obj.$$apply(converted));
    };
  } else {
    return obj;
  }
}

const nqp = require('nqp-runtime');

const Script = require('vm').Script;

const sourceMaps = {};

const SourceMapGenerator = require('source-map').SourceMapGenerator;
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const SourceNode = require('source-map').SourceNode;

const charProps = require('char-props');

function createSourceMap(js, p6, mapping, jsFile, p6File) {
  const generator = new SourceMapGenerator({file: jsFile});

  let jsProps = charProps(js);
  let p6Props = charProps(p6);


  for (let i=0; i < mapping.length; i += 2) {
    generator.addMapping({
      generated: {
        line: jsProps.lineAt(mapping[i+1])+1,
        column: jsProps.columnAt(mapping[i+1])+1
      },
      original: {
        line: p6Props.lineAt(mapping[i])+1,
        column: p6Props.columnAt(mapping[i])+1
      },
      source: p6File
    });
  }

  return new SourceMapConsumer(generator.toString());
}

class JavaScriptCompiler extends NQPObject {
  eval(ctx, _NAMED, self, code) {

    if (!(_NAMED !== null && _NAMED.hasOwnProperty('mapping'))) {
      return fromJS(eval(nqp.arg_s(ctx, code)));
    }

    const fakeFilename = 'nqpEval' + shortid.generate();

    const codeStr = nqp.toStr(code, ctx);

    // TODO - think about the LOAD_BYTECODE_FROM_MODULE HACK
    const preamble = 'var nqp = global.nqp; var module = global.nqpModule;var require = global.nqpRequire;';

    global.nqp = nqp;

    if (_NAMED !== null && _NAMED.hasOwnProperty('mapping')) {
      sourceMaps[fakeFilename] = createSourceMap(codeStr, _NAMED['p6-source'], _NAMED.mapping.array, fakeFilename, nqp.toStr(_NAMED.file, ctx));
      const node = SourceNode.fromStringWithSourceMap(codeStr, sourceMaps[fakeFilename]);

      //HACK
      sourceMaps[fakeFilename] = new SourceMapConsumer(node.toStringWithSourceMap({file: fakeFilename}).map.toString())

      const jsProps = charProps(codeStr);
      const p6Props = charProps(_NAMED['p6-source']);
      sourceMaps[fakeFilename].eachMapping(m => {
        m.generatedPos = jsProps.indexAt({line: m.generatedLine, column: m.generatedColumn});
        m.originalPos = p6Props.indexAt({line: m.originalLine, column: m.originalColumn});
    }, undefined, SourceMapConsumer.GENERATED_ORDER);
    }

    const script = new Script(preamble + codeStr, {filename: fakeFilename});

    global.nqpModule = module;

    const oldNqpRequire = global.nqpRequire;
    global.nqpRequire = function(path) {
      return require(path);
    };

    const ret = fromJS(script.runInThisContext());
    global.nqpRequire = oldNqpRequire;

    return ret;
  }

  compile(ctx, _NAMED, self, code) {
    console.log('compiling');
    const script = new Script(code);

    const codeRef = new CodeRef();
    codeRef.$$call = function(ctx, _NAMED) {
      return fromJS(script.runInThisContext());
    };
    return codeRef;
  }
};

compilerRegistry.set('JavaScript', new JavaScriptCompiler());

class JSBackendStub extends NQPObject {
  name(ctx, named) {
    return 'js';
  }
};

class NQPStub extends NQPObject {
  constructor() {
    super();
    this.backend_ = new JSBackendStub();
  }
  backend(ctx, named) {
    return this.backend_;
  }
};

compilerRegistry.set('nqp', new NQPStub());

op.getcomp = function(language) {
  return compilerRegistry.has(language) ? compilerRegistry.get(language) : Null;
};

op.backendconfig = function() {
  var config = new Hash();
  config.content.set('intvalsize', 4);
  config.content.set('osname', os.platform());
  return config;
};

op.ordbaseat = function(str, index) {
  throw 'ordbaseat NYI';
};

op.getpid = function() {
  return process.pid;
};

op.getmessage = function(exception) {
  return (exception.$$message === undefined ? null_s : exception.$$message);
};

op.setmessage = function(exception, message) {
  return (exception.$$message = message);
};

op.getpayload = function(exception) {
  return Object.prototype.hasOwnProperty.call(exception, '$$payload') ? exception.$$payload : Null;
};

op.setpayload = function(exception, payload) {
  return (exception.$$payload = payload);
};

op.isnum = function(value) {
  return (typeof value == 'number') ? 1 : 0;
};

op.isint = function(value) {
  return (value instanceof NQPInt) ? 1 : 0;
};

/* HACK - utf8-c is a different encoding than utf8 */
function renameEncoding(encoding) {
  return {'utf8-c8': 'utf8', 'utf16': 'utf16le', 'iso-8859-1': 'binary'}[encoding] || encoding;
}
exports.renameEncoding = renameEncoding;

let encodings = ['ascii', 'utf8', 'utf16le', 'ucs2', 'base64', 'latin1', 'binary', 'hex'];
function isKnownEncoding(encoding) {
  return encodings.indexOf(encoding) == -1 ? false : true;
}
exports.isKnownEncoding = isKnownEncoding;


function byteSize(buf) {
  var bits = buf._STable.REPR.type._STable.REPR.bits;

  if (bits % 8) {
    throw 'only buffer sizes that are a multiple of 8 are supported';
  }

  return bits / 8;
}

exports.byteSize = byteSize;

op.encode = function(str, encoding_, buf) {
  if (buf.array.length) {
    throw new NQPException('encode requires an empty array');
  }

  var encoding = renameEncoding(encoding_);

  var elementSize = byteSize(buf);

  var isUnsigned = buf._STable.REPR.type._STable.REPR.isUnsigned;

  var buffer = new Buffer(str, encoding);

  var offset = 0;
  for (var i = 0; i < buffer.length / elementSize; i++) {
    buf.array[i] = isUnsigned ? buffer.readUIntLE(offset, elementSize) : buffer.readIntLE(offset, elementSize);
    offset += elementSize;
  }

  return buf;
};

function toRawBuffer(buf) {
  let elementSize = byteSize(buf);
  let isUnsigned = buf._STable.REPR.type._STable.REPR.isUnsigned;
  let array = buf.array;

  let buffer = new Buffer(array.length * elementSize);

  let offset = 0;
  for (let i = 0; i < array.length; i++) {
    if (isUnsigned) {
      buffer.writeUIntLE(array[i], offset, elementSize);
    } else {
      buffer.writeIntLE(array[i], offset, elementSize);
    }
    offset += elementSize;
  }

  return buffer;
}

exports.toRawBuffer = toRawBuffer;

op.decode = function(buf, encoding) {
  return toRawBuffer(buf).toString(renameEncoding(encoding));
};

op.objprimspec = function(obj) {
  if (obj === Null) return 0;
  if (typeof obj === 'object') {
    if (obj instanceof NQPInt) {
      return 1;
    } else {
      return (obj._STable && obj._STable.REPR.boxedPrimitive ? obj._STable.REPR.boxedPrimitive : 0);
    }
  } else if (typeof obj == 'number') {
    return 2;
  } else if (typeof obj == 'string') {
    return 3;
  } else {
    throw new NQPException(`objprimspec can't handle things of type: ${typeof obj}`);
  }
};

op.objprimbits = function(type) {
  return type._STable.REPR.bits;
};

/* Parametricity operations. */
op.setparameterizer = function(ctx, type, parameterizer) {
  var st = type._STable;
  /* Ensure that the type is not already parametric or parameterized. */
  if (st.parameterizer) {
    ctx.die('This type is already parametric');
    return Null;
  } else if (st.parametricType) {
    ctx.die('Cannot make a parameterized type also be parametric');
    return Null;
  }

  /* Set up the type as parameterized. */
  st.parameterizer = parameterizer;
  st.parameterizerCache = [];

  st.modeFlags |= constants.PARAMETRIC_TYPE;

  return type;
};

op.parameterizetype = function(ctx, type, params) {
  /* Ensure we have a parametric type. */
  var st = type._STable;
  if (!st.parameterizer) {
    ctx.die('This type is not parametric');
  }

  var unpackedParams = params.array;

  var lookup = st.parameterizerCache;
  for (var i = 0; i < lookup.length; i++) {
    if (unpackedParams.length == lookup[i].params.length) {
      var match = true;
      for (var j = 0; j < unpackedParams.length; j++) {
        /* XXX More cases to consider here. - copied over from the jvm backend, need to consider what they are*/
        if (unpackedParams[j] !== lookup[i].params[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        return lookup[i].type;
      }
    }
  }

  var result = st.parameterizer.$$call(ctx, {}, st.WHAT, params);

  var newSTable = result._STable;
  newSTable.parametricType = type;
  newSTable.parameters = params;
  newSTable.modeFlags |= constants.PARAMETERIZED_TYPE;

  lookup.push({type: result, params: unpackedParams});

  return result;
};

op.gcd_i = function(a, b) {
  var c;
  while (a != 0) {
    c = a;
    a = b % a;
    b = c;
  }
  return b;
};

// TODO think about overflow
op.lcm_i = function(a, b) {
  return (a * b) / op.gcd_i(a, b);
};

op.div_i = function(a, b) {
  if (b == 0) {
    throw new NQPException("Division by zero");
  } else {
    return Math.floor(a/b);
  }
};

op.mod_n = function(a, b) {
  return a - Math.floor(a / b) * b;
};

op.sec_n = function(x) {
  return 1 / Math.cos(x);
};

op.asec_n = function(x) {
  return Math.acos(1 / x);
};

op.sech_n = function(x) {
  if (x == Infinity || x == -Infinity) return 0;
  return (2 * Math.cosh(x)) / (Math.cosh(2 * x) + 1);
};

op.isnanorinf = function(n) {
  return (isNaN(n) || n == Infinity || n == -Infinity) ? 1 : 0;
};

function typeparameters(ctx, type) {
  var st = type._STable;
  if (!st.parametricType) {
    ctx.die('This type is not parameterized');
  }

  return st.parameters;
}

op.typeparameters = typeparameters;

op.typeparameterat = function(ctx, type, idx) {
  return typeparameters(ctx, type).$$atpos(idx);
};

op.typeparameterized = function(type) {
  var st = type._STable;
  return st.parametricType ? st.parametricType : Null;
};

let fibers = require('fibers');

function runTagged(tag, fiber, val, ctx) {
  let arg = val;
  while (1) {
    let control = fiber.run(arg);
    if (control.tag == tag || control.tag === Null) {
      if (control.value) {
        return control.value;
      } else {
        const cont = new Cont(tag, fiber);
        let value = control.closure.$$call(ctx, null, cont);
        return value;
      }
    } else {
      arg = fibers.yield(control);
    }
  }
}

class Cont {
  constructor(tag, fiber) {
    this.tag = tag;
    this.fiber = fiber;
  }

  $$decont(ctx) {
    return this;
  }

  $$toBool(ctx) {
    return 1;
  }
};

op.continuationreset = function(ctx, tag, block) {
  if (block instanceof Cont) {
    return runTagged(tag, block.fiber, Null, ctx);
  } else {
    const fiber = fibers(function() {
      return {value: block.$$call(ctx, null), tag: tag};
    });
    fiber.tag = tag;
    return runTagged(tag, fiber, Null, ctx);
  }
};


op.continuationcontrol = function(ctx, protect, tag, closure) {
  return fibers.yield({closure: closure, tag: tag});
};

op.continuationinvoke = function(ctx, cont, inject) {
  var val = inject.$$call(ctx, null);
  return runTagged(cont.tag, cont.fiber, val, ctx);
};

var generator = Math;
op.rand_n = function(limit) {
  return generator.random() * limit;
};


op.srand = function(seed) {
  var XorShift = require('xorshift').constructor;
  generator = new XorShift([seed, 0, 0, 0]);
  return seed;
};

op.getlexrel = function(pad, name) {
  return pad.lookup(name);
};


op.bitand_s = function(a, b) {
  var ret = '';
  var i = 0;
  while (true) {
    var codepointA = a.codePointAt(i);
    var codepointB = b.codePointAt(i);
    if (codepointA === undefined || codepointB == undefined) {
      return ret;
    }
    ret += String.fromCodePoint(codepointA & codepointB);
    i++;
  }
};

op.bitor_s = function(a, b) {
  var ret = '';
  var i = 0;
  while (true) {
    var codepointA = a.codePointAt(i);
    var codepointB = b.codePointAt(i);
    if (codepointA === undefined && codepointB == undefined) {
      return ret;
    }
    if (codepointA === undefined) codepointA = 0;
    if (codepointB === undefined) codepointB = 0;
    ret += String.fromCodePoint(codepointA | codepointB);
    i++;
  }
};

op.bitxor_s = function(a, b) {
  var ret = '';
  var i = 0;
  while (true) {
    var codepointA = a.codePointAt(i);
    var codepointB = b.codePointAt(i);
    if (codepointA === undefined && codepointB == undefined) {
      return ret;
    }
    if (codepointA === undefined) codepointA = 0;
    if (codepointB === undefined) codepointB = 0;
    ret += String.fromCodePoint(codepointA ^ codepointB);
    i++;
  }
};

op.replace = function(str, offset, count, repl) {
  return str.substr(0, offset) + repl + str.substr(offset + count);
};

op.getcodelocation = function(code) {
  var hash = new Hash();
  hash.content.set('file', 'unknown');
  hash.content.set('line', new NQPInt(-1));
  return hash;
};

op.getcodecuid = function(codeRef) {
  return codeRef.cuid;
};

op.numdimensions = function(array) {
  return array.$$numdimensions();
};

op.dimensions = function(array) {
  return array.$$dimensions();
};

op.setdimensions = function(array, dimensions) {
  array.$$setdimensions(dimensions);
  return dimensions;
};

// TODO optimize

['_n', '_s', '_i', ''].forEach(function(type) {
  op['atposnd' + type] = function(array, idx) {
    return array['$$atposnd' + type](idx);
  };

  op['bindposnd' + type] = function(array, idx, value) {
    return array['$$bindposnd' + type](idx, value);
  };

  op['atpos2d' + type] = function(array, x, y) {
    return op['atposnd' + type](array, BOOT.createArray([x, y]));
  };

  op['atpos3d' + type] = function(array, x, y, z) {
    return op['atposnd' + type](array, BOOT.createArray([x, y, z]));
  };

  op['bindpos2d' + type] = function(array, x, y, value) {
    return op['bindposnd' + type](array, BOOT.createArray([x, y]), value);
  };

  op['bindpos3d' + type] = function(array, x, y, z, value) {
    return op['bindposnd' + type](array, BOOT.createArray([x, y, z]), value);
  };
});

/* TODO HLL support */
op.newexception = function() {
  var exType = BOOT.Exception;
  return exType._STable.REPR.allocate(exType._STable);
};

op.throwextype = function(ctx, category) {
  var exType = BOOT.Exception;
  let ex = exType._STable.REPR.allocate(exType._STable);
  ex.$$category = category;
  ctx.throw(ex);
};

function EvalResult(mainline, codeRefs) {
  this.mainline = mainline;
  this.codeRefs = codeRefs;
}

exports.EvalResult = EvalResult;

op.iscompunit = function(obj) {
  return obj instanceof EvalResult ? 1 : 0;
};

op.compunitmainline = function(cu) {
  return cu.mainline;
};

op.compunitcodes = function(cu) {
  return cu.codeRefs;
};

op.getstaticcode = function(codeRef) {
  return codeRef.staticCode;
};

function backtrace(exception) {
  if (exception.$$ctx) {
    let ctx = exception.$$ctx.$$skipHandlers();

    const stack = exception.$$stack;

    const rows = [];


    let stackIndex = 0;

    while (ctx) {
      const row = new Hash();
      const annotations = new Hash();
      row.content.set('annotations', annotations);

      let file = '<unknown file>';
      let line = 1;

      if (ctx instanceof Ctx) {
        ctx = ctx.$$skipHandlers();
        const codeRef = ctx.codeRef();
        const wanted = codeRef.$$call.name;
        while (stackIndex < stack.length) {
          if (stack[stackIndex].getFunctionName() == wanted) {
            file = stack[stackIndex].getFileName();
            line = stack[stackIndex].getLineNumber();
            let column = stack[stackIndex].getColumnNumber();

            if (sourceMaps.hasOwnProperty(file)) {
              let original = sourceMaps[file].originalPositionFor({line: line, column: column});
              if (original.source) {
                file = original.source;
                line = original.line;
                column = original.column;
              }
            }
            if (file === undefined) file = '?';
            break;
          }
          stackIndex++;
        }
        row.content.set('sub', codeRef);
      }

      annotations.content.set('file', file);
      annotations.content.set('line', line);

      rows.push(row);

      ctx = ctx.$$caller;
    }
    return rows;
  } else {
    return [];
  }
};

op.backtrace = function(currentHLL, exception) {
  return hll.list(currentHLL, backtrace(exception));
};

op.backtracestrings = function(currentHLL, exception) {
  const lines = [];
  let first = true;
  for (let row of backtrace(exception)) {
    let annotations = row.$$atkey('annotations');
    let sub = row.$$atkey('sub');
    lines.push((first ? '  at ' : ' from ') + 'cuid' + sub.cuid + ' ' + annotations.$$atkey('file')+ ':'+ annotations.$$atkey('line'));
    first = false;
  }
  return hll.list(currentHLL, lines);
};

op.hintfor = function(classHandle, attrName) {
  if (!classHandle._STable.REPR.hintfor) return -1;
  return classHandle._STable.REPR.hintfor(classHandle, attrName);
};

op.ctxcaller = function(ctx) {
  return ctx.$$caller.$$skipHandlers();
};

op.ctxcallerskipthunks = function(ctx) {
  let caller = ctx.$$skipHandlers().$$caller;
  if (caller) caller = caller.$$skipHandlers();

  // FIXME - ctxs that don't have a codeRef
  while (caller && caller.codeRef().staticCode.isThunk) {
    caller = caller.$$caller;
    if (caller) caller = caller.$$skipHandlers();
  }
  return caller || Null;
};

op.ctxouterskipthunks = function(ctx) {
  var outer = ctx.$$skipHandlers().$$outer;

  // FIXME - ctxs that don't have a codeRef
  while (outer && outer.codeRef().staticCode.isThunk) {
    outer = outer.$$outer;
    if (outer) outer = outer.$$skipHandlers();
  }
  return outer || Null;
};

op.captureposprimspec = function(capture, idx) {
  if (capture.pos[idx] instanceof NativeIntArg) {
    return 1;
  } else if (capture.pos[idx] instanceof NativeNumArg) {
    return 2;
  } else if (capture.pos[idx] instanceof NativeStrArg) {
    return 3;
  } else if (capture.pos[idx].typeObject_) {
    return 0;
  } else {
    return op.objprimspec(capture.pos[idx]);
  }
};

op.forceouterctx = function(code, ctx) {
  if (!(code instanceof CodeRef)) {
    throw 'forceouterctx first operand must be a CodeRef';
  }
  if (!(ctx instanceof Ctx)) {
    throw 'forceouterctx second operand must be a Ctx';
  }

  code.outerCtx = ctx;

  return code;
};

// TODO: replace it with a fully correct implementation
op.fc = function(string) {
  return string.toLowerCase();
};

function tcChar(c) {
  if (c === 'ß') return 'Ss';
  var unicharadata = require('unicharadata');
  var titled = unicharadata.title(c);
  return titled === '' ? c : titled;
}

op.tc = function(string) {
  var ret = '';
  for (let c of string) {
    ret += tcChar(c);
  }
  return ret;
};

op.tclc = function(string) {
  let isFirst = true;
  let lower = '';
  let first = '';
  for (let c of string) {
    if (isFirst) {
      isFirst = false;
      first = tcChar(c);
    } else {
      lower += c;
    }
  }
  return first + lower.toLowerCase();
};

let ucd = require('nqp-js-ucd');

op.getstrfromname = function(name) {
  const uppercased = name.toUpperCase();

  let codePoint;
  let codePoints;

  if (codePoint = ucd.nameToCodePoint(uppercased)) {
    return String.fromCodePoint(codePoint);
  } else if (codePoint = ucd.aliasToCodePoint(uppercased)) {
    return String.fromCodePoint(codePoint);
  } else if (codePoints = ucd.sequenceToCodePoints(uppercased)) {
    return codePoints.map(codePoint => String.fromCodePoint(codePoint)).join('');
  } else {
    return '';
  }
};

op.codepointfromname = function(name) {
  let codePoint

  if (codePoint = ucd.nameToCodePoint(name)) {
    return codePoint;
  } else if (codePoint = ucd.aliasToCodePoint(name)) {
    return codePoint;
  } else {
    return -1;
  }
};

op.getuniname = function(codePoint) {
  return ucd.codePointToName(codePoint);
};

const forms = ['NONE', 'NFC', 'NFD', 'NFKC', 'NFKD'];
op.normalizecodes = function(input, form, output) {
  const stringified = input.array.map(codePoint => String.fromCodePoint(codePoint)).join('');
  const normalized = form == 0 ? stringified : stringified.normalize(forms[form]);

  for (let c of normalized) {
    output.array.push(c.codePointAt(0));
  }

  return output;
};

op.strfromcodes = function(codes) {
  return codes.array.map(codePoint => String.fromCodePoint(codePoint)).join('');
};

op.strtocodes = function(str, form, codes) {
  const normalized = form == 0 ? str : str.normalize(forms[form]);

  for (let c of normalized) {
    codes.array.push(c.codePointAt(0));
  }
  return codes;
};

op.codes = function(str) {
  return str.normalize('NFC').length;
}

op.islist = function(list) {
  return (list._STable && list._STable.REPR instanceof reprs.VMArray) ? 1 : 0;
};

op.split = function(currentHLL, separator, string) {
  return hll.slurpyArray(currentHLL, string !== '' ? string.split(separator) : []);
};

op.exception = function() {
  return exceptionsStack[exceptionsStack.length - 1];
};

op.lastexpayload = function() {
  return exceptionsStack[exceptionsStack.length - 1].$$payload;
};

op.setextype = function(exception, category) {
  exception.$$category = category;
  return exception;
};

op.getextype = function(exception) {
  if (exception.$$category === undefined) {
    return 0;
  } else {
    return exception.$$category;
  }
};

op.pow_n = function(base, exponent) {
  if (base === 1) return 1;
  return Math.pow(base, exponent);
};

op.getlockcondvar = function(lock, type) {
  // STUB
  return type._STable.REPR.allocate(type._STable);
};

op.condwait = function(cv) {
  // STUB
  console.log('condwait NYI');
  process.exit();
  return cv;
};

op.condsignalall = function(cv) {
  // STUB
  return cv;
};

op.condsignalone = function(cv) {
  // STUB
  return cv;
};

op.semtryacquire = function(semaphore) {
  console.log('sematrycquire NYI');
  // STUB
  return 1;
};

op.semacquire = function(semaphore) {
  // STUB
  console.log('semacquire NYI');
  return semaphore;
};

op.semrelease = function(semaphore) {
  // STUB
  console.log('semrelease NYI');
  return semaphore;
};

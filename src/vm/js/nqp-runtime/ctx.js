'use strict';
const NQPExceptionWithCtx = require('./nqp-exception-with-ctx.js');
const NQPException = require('./nqp-exception.js');
const NQPObject = require('./nqp-object.js');
const Null = require('./null.js');
const exceptionsStack = require('./exceptions-stack.js');

const BOOT = require('./BOOT.js');

const NQPInt = require('./nqp-int.js');
const NQPStr = require('./nqp-str.js');


const stackTrace = require('stack-trace');

const NEXT = 4;
const REDO = 8;
const LAST = 16;
const RETURN = 32;
const TAKE = 128;
const WARN = 256;
const SUCCEED = 512;
const PROCEED = 1024;
const LABELED = 4096;
const AWAIT = 8192;
const EMIT = 16384;
const DONE = 32768;

const categoryIDs = {
  NEXT: NEXT,
  REDO: REDO,
  LAST: LAST,
  RETURN: RETURN,
  TAKE: TAKE,
  WARN: WARN,
  SUCCEED: SUCCEED,
  PROCEED: PROCEED,
  AWAIT: AWAIT,
  EMIT: EMIT,
  DONE: DONE,
};

const categoryToName = {};
for (const name of Object.keys(categoryIDs)) {
  categoryToName[categoryIDs[name]] = name;
}

class ResumeException {
  constructor(exception) {
    this.exception = exception;
  }
};

class Ctx extends NQPObject {
  constructor(callerCtx, outerCtx, callThis) {
    super();
    this.$$caller = callerCtx;
    this.$$outer = outerCtx;
    this.$$callThis = callThis;
  }

  codeRef() {
    return this.$$callThis;
  }

  last() {
    return this.controlException(LAST);
  }

  lastLabeled(label) {
    return this.controlExceptionLabeled(label, LAST);
  }

  next() {
    return this.controlException(NEXT);
  }

  nextLabeled(label) {
    return this.controlExceptionLabeled(label, NEXT);
  }

  redo() {
    return this.controlException(REDO);
  }

  redoLabeled(label) {
    return this.controlExceptionLabeled(label, REDO);
  }

  controlException(category) {
    const exType = BOOT.Exception;
    const exception = exType._STable.REPR.allocate(exType._STable);
    exception.$$category = category;
    return this.propagateControlException(exception);
  }

  controlExceptionLabeled(label, category) {
    const exType = BOOT.Exception;
    const exception = exType._STable.REPR.allocate(exType._STable);
    exception.$$category = category | LABELED;
    exception.$$payload = label;
    return this.propagateControlException(exception);
  }

  /*async*/ propagateControlException(exception) {
    const handler = '$$' + categoryToName[exception.$$category & ~LABELED];
    const labeled = exception.$$category & LABELED;

    let ctx = this;

    while (ctx) {
      if (ctx.$$controlHandlerOuter) {
        ctx = ctx.$$controlHandlerOuter;
      }

      if (ctx.$$CONTROL || (ctx[handler] && (!labeled || ctx.$$label === exception.$$payload))) {
        exception.caught = ctx;
        ctx.exception = exception;

        exceptionsStack().push(exception);
        try {
          const wrapped = new Ctx(this, this, null);
          if (ctx[handler]) {
            ctx.$$unwind.ret = ctx[handler](wrapped);
          } else {
            ctx.$$unwind.ret = /*await*/ ctx.$$CONTROL(wrapped);
          }
        } catch (e) {
          if (e instanceof ResumeException && e.exception === exception) {
            return;
          } else {
            throw e;
          }
        } finally {
          exceptionsStack().pop();
        }

        throw ctx.$$unwind;
      }
      ctx = ctx.$$caller;
    }

    const uncaught_control = this.$$getHLL().get('uncaught_control')
    if (uncaught_control) {
      try {
        uncaught_control.$$call(ctx, null, exception.$$decont(this));
      } catch (e) {
        if (e instanceof ResumeException && e.exception === exception) {
          return;
        } else {
          throw e;
        }
      }
    } else {
      // TODO maybe wrap this up?
      throw exception;
    }
  }

  /*async*/ propagateException(exception) {
    if (exception.$$category) {
      return this.propagateControlException(exception);
      return;
    }

    let ctx = this;

    while (ctx) {
      if (ctx.$$catchHandlerOuter) {
        ctx = ctx.$$catchHandlerOuter;
      }

      if (ctx.$$CATCH) {
        exception.caught = ctx;
        ctx.exception = exception;

        exceptionsStack().push(exception);
        try {
          const wrapped = new Ctx(this, this, null);
          ctx.$$unwind.ret = /*await*/ ctx.$$CATCH(wrapped);
        } catch (e) {
          if (e instanceof ResumeException && e.exception === exception) {
            return;
          } else {
            throw e;
          }
        } finally {
          exceptionsStack().pop();
        }

        throw ctx.$$unwind;
      }
      ctx = ctx.$$caller;
    }

    const uncaught_exception = this.$$getHLL().get('uncaught_exception')
    if (uncaught_exception) {
      try {
        uncaught_exception.$$call(ctx, null, exception);
      } catch (e) {
        if (e instanceof ResumeException && e.exception === exception) {
          return;
        } else {
          throw e;
        }
      }
    } else {
      // TODO maybe wrap this up?
      throw exception;
    }
  }

  /*async*/ catchException(exception) {
    this.exception = exception;
    exceptionsStack().push(exception);
    try {
      // we don't have access to the most correct ctx in case of this sort of exception
      return /*await*/ this.$$CATCH(this);
    } finally {
      exceptionsStack().pop();
    }
  }

  rethrow(exception) {
    return this.propagateException(exception);
  }

  die(msg) {
    return this.propagateException(new NQPExceptionWithCtx(msg, this, stackTrace.get()));
  }

  resume(exception) {
    throw new ResumeException(exception);
  }

  throw(exception) {
    exception.$$stack = stackTrace.get();
    exception.$$ctx = this;
    return this.propagateException(exception);
  }

  throwpayloadlexcaller(category, payload) {
    let ctx = this.$$skipHandlers().$$caller;
    const isThunkOrCompilerStub = code => code !== null && (code.staticCode.isThunk || code.isCompilerStub);
    while (ctx && isThunkOrCompilerStub(ctx.codeRef())) {
      ctx = ctx.$$caller;
    }

    return this.$$throwLexicalException(ctx, category, payload);
  }

  throwpayloadlex(category, payload) {
    return this.$$throwLexicalException(this, category, payload);
  }

  /*async*/ $$throwLexicalException(lookFrom, category, payload) {
    const exType = BOOT.Exception;
    const exception = exType._STable.REPR.allocate(exType._STable);

    exception.$$category = category;
    exception.$$payload = payload;
    const handler = '$$' + categoryToName[category];

    let ctx = lookFrom;

    while (ctx) {
      if (ctx.$$controlHandlerOuter) {
        ctx = ctx.$$controlHandlerOuter;
      }

      // TODO - think about checking the label
      if (ctx[handler] || ctx.$$CONTROL) {
        exception.caught = ctx;
        ctx.exception = exception;

        exceptionsStack().push(exception);
        try {
          const wrapped = new Ctx(this, this, null);
          if (ctx[handler]) {
            ctx.$$unwind.ret = ctx[handler](wrapped);
          } else {
            ctx.$$unwind.ret = /*await*/ ctx.$$CONTROL(wrapped);
          }
        } catch (e) {
          if (e instanceof ResumeException && e.exception === exception) {
            return;
          } else {
            throw e;
          }
        } finally {
          exceptionsStack().pop();
        }

        let check = lookFrom;
        while (check) {
          if (check === ctx) {
            throw ctx.$$unwind;
          }
          check = check.$$caller;
        }

        this.$$getHLL().get('lexical_handler_not_found_error').$$call(this, null, new NQPInt(category), new NQPInt(1));
        return;
      }

      ctx = ctx.$$outer;
    }

    this.$$getHLL().get('lexical_handler_not_found_error').$$call(this, null, new NQPInt(category), new NQPInt(0));
  }

  lookupDynamic(name) {
    let ctx = this;
    while (ctx) {
      if (ctx.hasOwnProperty(name)) {
        return ctx[name];
      }
      ctx = ctx.$$caller;
    }
    return Null;
    /* Looking up of a contextual is allowed to fail,
       nqp code usually fallbacks to looking up of global */
  }

  lookupOrNull(name) {
    if (this.hasOwnProperty(name)) {
      return this[name];
    } else {
      return Null;
    }
  }

  lookupDynamicFromCaller(name) {
    let ctx = this.$$caller;
    while (ctx) {
      if (ctx.hasOwnProperty(name)) {
        return ctx[name];
      }
      ctx = ctx.$$caller;
    }
    return Null;
    /* Looking up of a contextual is allowed to fail,
       nqp code usually fallbacks to looking up of global */
  }

  lookupWithCallers(name) {
    let currentCallerCtx = this;
    while (currentCallerCtx) {
      let currentCtx = currentCallerCtx;
      while (currentCtx) {
        if (currentCtx.hasOwnProperty(name)) {
          return currentCtx[name];
        }
        currentCtx = currentCtx.$$outer;
      }
      currentCallerCtx = currentCallerCtx.$$caller;
    }
    return Null;
  }

  lookup(name) {
    let ctx = this;
    while (ctx) {
      if (ctx.hasOwnProperty(name)) {
        return ctx[name];
      }
      ctx = ctx.$$outer;
    }
    /* Rakudo depends on returning null when we can't lookup a lexical */
    return Null;
  }

  lookupFromOuter(name) {
    return this.$$outer.lookup(name);
  }

  $$getHLL() {
    let ctx = this;
    while (ctx) {
      if (ctx.$$hll) {
        return ctx.$$hll;
      }
      ctx = ctx.$$outer;
    }
  }

  $$atkey(name) {
    let ctx = this;
    while (ctx) {
      if (ctx.hasOwnProperty(name)) {
        return ctx[name];
      }
      ctx = ctx.$$outer;
    }
    throw new NQPException(`Lexical with name '${name}' does not exist in this frame`);
  }

  $$bindkey(key, value) {
    this[key] = value;
    return value;
  }

  $$existskey(key) {
    return (this.hasOwnProperty(key) ? 1 : 0);
  }

  $$skipHandlers() {
    return this;
  }

  bind(name, value) {
    let ctx = this;
    while (ctx) {
      if (ctx.hasOwnProperty(name)) {
        ctx[name] = value;
        return ctx[name];
      }
      ctx = ctx.$$outer;
    }
    throw `Can't bind: ${name}`;
  }

  bindDynamic(name, value) {
    let ctx = this;
    while (ctx) {
      if (ctx.hasOwnProperty(name)) {
        ctx[name] = value;
        return ctx[name];
      }
      ctx = ctx.$$caller;
    }
    throw `Can't bind dynamic: ${name}`;
  }

  $$iterator() {
    return new CtxIter(this);
  }

  $$elems() {
    return Object.keys(this).filter(key => key.substr(0, 2) != '$$').length;
  }

  $$toBool(ctx) {
    return 1;
  }
};

class CtxIter extends NQPObject {
  constructor(ctx) {
    super();
    this.$$ctx = ctx;
    this.$$keys = Object.keys(ctx).filter(key => key.substr(0, 2) != '$$');
    this.$$target = this.$$keys.length - 1;
    this.$$idx = -1;
  }

  $$shift() {
    this.$$idx++;
    return this;
  }

  $$iterval() {
    return this.$$ctx[this.$$keys[this.$$idx]];
  }

  $$iterkey_s() {
    return this.$$keys[this.$$idx];
  }

  $$toBool(ctx) {
    return this.$$idx < this.$$target;
  }

  Str(ctx, _NAMED, self) {
    return new NQPStr(this.$$iterkey_s());
  }

  key(ctx, _NAMED, self) {
    return new NQPStr(this.$$iterkey_s());
  }

  value(ctx, _NAMED, self) {
    return this.$$iterval();
  }
};

Ctx.prototype.$$atkey_i = Ctx.prototype.$$atkey_n = Ctx.prototype.$$atkey_s = Ctx.prototype.$$atkey;
Ctx.prototype.$$bindkey_i = Ctx.prototype.$$bindkey_n = Ctx.prototype.$$bindkey_s = Ctx.prototype.$$bindkey;

module.exports = Ctx;

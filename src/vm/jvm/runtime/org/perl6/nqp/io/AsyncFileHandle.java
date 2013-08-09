package org.perl6.nqp.io;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.channels.AsynchronousFileChannel;
import java.nio.channels.CompletionHandler;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CharsetEncoder;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.concurrent.LinkedBlockingQueue;

import org.perl6.nqp.runtime.CallSiteDescriptor;
import org.perl6.nqp.runtime.ExceptionHandling;
import org.perl6.nqp.runtime.Ops;
import org.perl6.nqp.runtime.ThreadContext;
import org.perl6.nqp.sixmodel.SixModelObject;

public class AsyncFileHandle implements IIOClosable, IIOEncodable, IIOAsyncReadable {
    private AsynchronousFileChannel chan;
    private CharsetEncoder enc;
    private CharsetDecoder dec;
    
    public AsyncFileHandle(ThreadContext tc, String filename, String mode) {
        try {
            Path p = new File(filename).toPath();
            if (mode.equals("r")) {
                chan = AsynchronousFileChannel.open(p, StandardOpenOption.READ);
            }
            else if (mode.equals("w")) {
                chan = AsynchronousFileChannel.open(p, StandardOpenOption.WRITE,
                                                       StandardOpenOption.CREATE);
            }
            else if (mode.equals("wa")) {
                chan = AsynchronousFileChannel.open(p, StandardOpenOption.WRITE,
                                                       StandardOpenOption.CREATE,
                                                       StandardOpenOption.APPEND);
            }
            else {
                ExceptionHandling.dieInternal(tc, "Unhandled file open mode '" + mode + "'");
            }
            setEncoding(tc, Charset.forName("UTF-8"));
        } catch (IOException e) {
            throw ExceptionHandling.dieInternal(tc, e);
        }
    }
    
    public void close(ThreadContext tc) {
        try {
            chan.close();
        } catch (IOException e) {
            throw ExceptionHandling.dieInternal(tc, e);
        }
    }
    
    public void setEncoding(ThreadContext tc, Charset cs) {
        enc = cs.newEncoder();
        dec = cs.newDecoder();
    }
    
    private class SlurpState {
        public ByteBuffer bb;
        public long expected;
    }
    private static final CallSiteDescriptor slurpResultCSD = new CallSiteDescriptor(
        new byte[] { CallSiteDescriptor.ARG_OBJ }, null);
    public void slurp(final ThreadContext tc, final SixModelObject Str,
                      final SixModelObject done, final SixModelObject error) {
        try {
            SlurpState ss = new SlurpState();
            ss.expected = chan.size();
            ss.bb = ByteBuffer.allocate((int)ss.expected);
            
            final CompletionHandler<Integer, SlurpState> ch = new CompletionHandler<Integer, SlurpState>() {
                public void completed(Integer bytes, SlurpState ss) {
                    if (ss.bb.position() == ss.expected) {
                        try {
                            /* We're done. Decode and box. */
                            ThreadContext curTC = tc.gc.getCurrentThreadContext();
                            ss.bb.flip();
                            String decoded = dec.decode(ss.bb).toString();
                            SixModelObject boxed = Ops.box_s(decoded, Str, curTC);
                            
                            /* Call done handler. */
                            Ops.invokeDirect(curTC, done, slurpResultCSD, new Object[] { boxed });
                        } catch (IOException e) {
                            failed(e, ss);
                        }
                    }
                    else {
                        /* Need to read some more. */
                        chan.read(ss.bb, 0, ss, this);
                    }
                }
                
                public void failed(Throwable exc, SlurpState ss) {
                    /* Box error. */
                    ThreadContext curTC = tc.gc.getCurrentThreadContext();
                    SixModelObject boxed = Ops.box_s(exc.toString(), Str, curTC);
                    
                    /* Call error handler. */
                    Ops.invokeDirect(curTC, error, slurpResultCSD, new Object[] { boxed });
                }
            };
            
            chan.read(ss.bb, 0, ss, ch);
        } catch (IOException e) {
            throw ExceptionHandling.dieInternal(tc, e);
        }
    }
    
    public void lines(ThreadContext tc, SixModelObject Str, boolean chomp,
                      LinkedBlockingQueue queue, SixModelObject done,
                      SixModelObject error) {
        throw new RuntimeException("Async lines NYI");
    }
}

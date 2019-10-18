package org.perl6.nqp.truffle.nodes.expression;
import com.oracle.truffle.api.frame.VirtualFrame;
import com.oracle.truffle.api.frame.MaterializedFrame;
import com.oracle.truffle.api.nodes.NodeInfo;
import org.perl6.nqp.truffle.runtime.NQPCodeRef;
import org.perl6.nqp.truffle.nodes.NQPNode;
import org.perl6.nqp.truffle.nodes.NQPObjNode;
import org.perl6.nqp.dsl.Deserializer;

@NodeInfo(shortName = "forceouterctx")
public final class NQPForceouterctxNode extends NQPObjNode {
    @Child private NQPNode codeNode;
    @Child private NQPNode ctxNode;

    @Deserializer
    public NQPForceouterctxNode(NQPNode codeNode, NQPNode ctxNode) {
        this.codeNode = codeNode;
        this.ctxNode = ctxNode;
    }

    @Override
    public Object execute(VirtualFrame frame) {
        NQPCodeRef code = (NQPCodeRef) codeNode.execute(frame);
        MaterializedFrame ctx = (MaterializedFrame) ctxNode.execute(frame);
        code.setOuterFrame(ctx);
        return code;
    }
}
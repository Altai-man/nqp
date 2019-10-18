package org.perl6.nqp.truffle.nodes.sixmodel;
import com.oracle.truffle.api.frame.VirtualFrame;
import com.oracle.truffle.api.nodes.NodeInfo;
import org.perl6.nqp.truffle.nodes.NQPNode;
import org.perl6.nqp.truffle.nodes.NQPObjNode;
import org.perl6.nqp.truffle.NQPScope;
import org.perl6.nqp.dsl.Deserializer;
import org.perl6.nqp.dsl.Global;

@NodeInfo(shortName = "knowhowattribute")
public final class NQPKnowhowattributeNode extends NQPObjNode {
    private final Object knowhowAttribute;

    @Deserializer
    public NQPKnowhowattributeNode(@Global Object knowhowAttribute) {
        this.knowhowAttribute = knowhowAttribute;
    }

    @Override
    public Object execute(VirtualFrame frame) {
        return knowhowAttribute;
    }
}
package org.perl6.nqp.sixmodel;
import org.perl6.nqp.runtime.ThreadContext;

/**
 * A scalar container has a ContainerSpec hung off its STable. It should be a
 * subclass of this abstract base class.
 */
public abstract class ContainerSpec {
    /* Fetches a value out of a container. Used for decontainerization. */
    public abstract SixModelObject fetch(ThreadContext tc, SixModelObject cont);
    
    /* Stores a value in a container. Used for assignment. */
    public abstract void store(ThreadContext tc, SixModelObject cont, SixModelObject obj);
    
    /* Stores a value in a container, without any checking of it (this
     * assumes an optimizer or something else already did it). Used for
     * assignment. */
    public abstract void storeUnchecked(ThreadContext tc, SixModelObject cont, SixModelObject obj);
    
    /* Name of this container specification. */
    public String name;
    
    /* Serializes the container data, if any. */
    public abstract void serialize(ThreadContext tc, STable st, SerializationWriter writer);
    
    /* Deserializes the container data, if any. */
    public abstract void deserialize(ThreadContext tc, STable st, SerializationReader reader);
}

class NQP::Optimizer {
    has @!block_stack;
    has @!local_var_stack;
    has $!no_grasp_on_lexicals;

    method optimize($ast, *%adverbs) {
        @!block_stack := [$ast[0]];
        @!local_var_stack := nqp::list();
        self.visit_children($ast);
        $ast;
    }

    method visit_block($block) {
        @!block_stack.push($block);
        my %*shallow_var_usages := nqp::hash();
        @!local_var_stack.push(%*shallow_var_usages);

        # Push all the lexically declared variables into our shallow vars hash.
        # Currently we limit ourselves to natives, because they are guaranteed
        # not to have some weird setup that we have to be careful about.
        if (nqp::istype($block[0], QAST::Stmts)
            || nqp::istype($block[1], QAST::Stmts) && nqp::istype($block[0], QAST::Var) && $block[0].decl eq 'param')
            && !($!no_grasp_on_lexicals) {

            my $stmts := $block[0];
            if nqp::istype($stmts, QAST::Var) {
                $stmts := $block[1];
            }
            my int $idx := 0;
            # before the $_ come the arguments. we must not turn these into locals,
            # otherwise our signature binding will explode.
            #say("THE BLOCK:::::::::::::::::::::::::::::::::::::::::::::::");
            #say($block.dump);
            #say(":::::::::::::::::::::::::::::::::::::::::::::::THE BLOCK");
            while $idx < +@($stmts) {
                my $var := $stmts[$idx];
                if nqp::istype($var, QAST::Op) && $var.op eq 'bind' {
                    # variables are initialised on the spot in nqp.
                    $var := $var[0]
                }
                if nqp::istype($var, QAST::Var) && $var.scope eq 'lexical' && $var.decl eq 'var' {
                    # also make sure we don't turn dynamic vars into locals
                    my $twigil := nqp::substr($var.name, 1, 1);
                    my $sigil := nqp::substr($var.name, 0, 1);
                    if $sigil eq '$'  && $twigil ne '*' && $twigil ne '?'
                            && $var.name ne '$_' && $var.name ne '$/' && $var.name ne '$!' && $var.name ne '$¢' {
                        %*shallow_var_usages{$var.name} := nqp::list($var);
                    }
                } elsif nqp::istype($var, QAST::Op) && $var.op eq 'bind' {
                    if nqp::existskey(%*shallow_var_usages, $var[0].name) {
                        nqp::push(%*shallow_var_usages{$var[0].name}, $var[0]);
                    }
                }
                $idx := $idx + 1;
            }
        }

        self.visit_children($block);

        my $succ;
        if !($!no_grasp_on_lexicals) {
            for %*shallow_var_usages {
                my $name := $_.key;
                my $newname := $block.unique('lex_to_loc_' ~ +@!block_stack);
                my @usages := $_.value;
                #say("found " ~ +@usages ~ " usages for $name");
                for @usages -> $var {
                    #say($var.scope ~ ": " ~ $var.name ~ " <- old");
                    $var.scope('local');
                    $var.name($newname);
                    #if $var.decl eq 'var' {
                        #$var.decl('static');
                    #}
                    $succ := 1;
                }
                #say("turned $name into a local ($newname), yippie");
            }
        }
        #if $succ {
            #say($block.dump);
        #}

        @!block_stack.pop();
        @!local_var_stack.pop();

        $block;
    }

    method lexical_depth($name) {
        my int $i := +@!block_stack;
        while $i > 0 {
            $i := $i - 1;
            my $block := @!block_stack[$i];
            my %sym := $block.symbol($name);
            if +%sym {
                return $i;
            }
        }
        -1
    }

    method find_lex($name) {
        my int $d := self.lexical_depth($name);
        if $d >= 0 {
            my $block := @!block_stack[$d];
            my %sym := $block.symbol($name);
            return %sym;
        } else {
            nqp::hash();
        }
    }

    method find_sym($name) {
        my %sym := self.find_lex($name);
        if !(%sym =:= NQPMu) && nqp::existskey(%sym, 'value') {
            return %sym<value>;
        }
        else {
            nqp::die("No compile-time value for $name");
        }
    }

    method visit_var($var) {
        if !($!no_grasp_on_lexicals) {
            if $var.scope eq 'lexical' {
                my int $lexdepth := self.lexical_depth($var.name);
                my int $vardepth := +@!block_stack - 1 - $lexdepth;
                if $lexdepth != -1 {
                    if $vardepth == 0 {
                        if nqp::existskey(%*shallow_var_usages, $var.name) {
                            #say("found a usage for " ~ $var.name);
                            nqp::push(%*shallow_var_usages{$var.name}, $var);
                            #say($var.dump);
                        }
                    } else {
                        #say("poisoned " ~ $var.name);
                        #say($var.dump);
                        #say("my local var stack is " ~ +@!local_var_stack ~ " deep, my lexdepth is $lexdepth");
                        #say(nqp::existskey(@!local_var_stack[$lexdepth-1], $var.name));
                        try {
                            nqp::deletekey(@!local_var_stack[$lexdepth-1], $var.name);
                        }
                    }
                }
            } elsif $var.scope eq 'contextual' {
                my int $lexdepth := self.lexical_depth($var.name);
                try {
                    nqp::deletekey(@!local_var_stack[$lexdepth-1], $var.name);
                    #say("poisoned " ~ $var.name ~ " due to contextual.");
                }
            }
        }

        if nqp::istype($var, QAST::VarWithFallback) {
            self.visit_children($var);
        }

        $var;
    }
    
    method visit_op($op) {
        sub returns_int($node) {
            if nqp::objprimspec($node.returns) == 1 {
                return 1
            }
            if nqp::istype($node, QAST::Op) {
                my $typeinfo := nqp::chars($node.op) >= 2
                                ?? nqp::substr($node.op, nqp::chars($node.op) - 2, 2)
                                !! "";
                if $typeinfo eq "_i" {
                    return 1
                } elsif $node.op eq 'chars' || $node.op eq 'ord' || $node.op eq 'elems' {
                    return 1
                }
            } elsif nqp::istype($node, QAST::IVal) {
                return 1
            } elsif nqp::istype($node, QAST::Var) && $node.scope eq 'lexical' {
                my %sym := self.find_lex($node.name);
                if nqp::existskey(%sym, 'type') && nqp::objprimspec(%sym<type>) == 1 {
                    return 1
                }
            }
            return 0;
        }

        #/[cur|ctx][get|set]?[lex[pad]?][dyn|caller|rel]*['_'[i|n|s]]?/;
        #if NQPCursor.parse($op.op, /[cur|ctx][get|set]?[lex[pad]?][dyn|caller|rel]*['_'[i|n|s]]?/, :c(0)) {
        if nqp::index($op.op, "lex") >= 0 ||
           nqp::index($op.op, "dyn") >= 0 ||
           nqp::index($op.op, "ctx") >= 0 {
            if $op.op ne 'lexotic' {
                $!no_grasp_on_lexicals := 1;
                #say("no hope for turning lex -> local: " ~ $op.op);
            }
        }

        self.visit_children($op);

        my $typeinfo := nqp::chars($op.op) >= 2
                        ?? nqp::substr($op.op, nqp::chars($op.op) - 2, 2)
                        !! "";
        my $asm := nqp::substr($op.op, 0, 3);

        try {
            if $typeinfo eq '_n' && ($asm eq 'add' || $asm eq 'sub' || $asm eq 'mul') {
                my $newopn := $asm ~ "_i";
                if returns_int($op[0]) && returns_int($op[1]) {
                    my $newopn := $asm ~ "_i";
                    $op.op($newopn);
                    $op.returns(self.find_sym("int"));
                } else {
                    $op.returns(self.find_sym("num"));
                }
            } elsif $typeinfo eq '_i' {
                $op.returns(self.find_sym("num"));
            } elsif $typeinfo eq '_s' {
                $op.returns(self.find_sym("str"));
            } elsif $op.op eq 'handle' {
                return self.visit_handle($op);
            } elsif $op.op eq 'numify' {
                # if we can establish that the argument is a list, we are good
                # to claim it returns an int.
                if nqp::istype($op[0], QAST::Var) {
                    my $sigil := nqp::substr($op[0].name, 0, 1);
                    if $sigil eq '@' || $sigil eq '%' {
                        $op.returns(self.find_sym("int"))
                    }
                }
            }
            CATCH {
            }
        }

        $op;
    }

    method visit_handle($handle) {
        self.visit_children($handle, :skip_selectors);
        $handle;
    }

    method visit_children($node, :$skip_selectors) {
        my int $i := 0;
        unless nqp::isstr($node) {
            while $i < +@($node) {
                unless $skip_selectors && $i % 2 {
                    my $visit := $node[$i];
                    if nqp::istype($visit, QAST::Op) {
                        $node[$i] := self.visit_op($visit)
                    } elsif nqp::istype($visit, QAST::Block) {
                        $node[$i] := self.visit_block($visit)
                    } elsif nqp::istype($visit, QAST::Var) {
                        $node[$i] := self.visit_var($visit);
                    } elsif nqp::istype($visit, QAST::Want) {
                        self.visit_children($visit, :skip_selectors)
                    } else {
                        self.visit_children($visit);
                    }
                }
                $i := $i + 1;
            }
        }
    }
}

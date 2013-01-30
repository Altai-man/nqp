class HLL::Actions {
    our sub string_to_int($src, $base) {
        my $res := nqp::radix($base, $src, 0, 2);
        $src.CURSOR.panic("'$src' is not a valid number")
            unless nqp::atkey($res, 2) == nqp::chars($src);
        nqp::atkey($res, 0);
    }

    method ints_to_string($ints) {
        if nqp::islist($ints) {
            my $result := '';
            for $ints {
                $result := $result ~ nqp::chr($_.ast);
            }
            $result;
        } else {
            nqp::chr($ints.ast);
        }
    }
    
    method CTXSAVE() {
        QAST::Stmts.new(
            QAST::Op.new(
                :op('bind'),
                QAST::Var.new( :name('ctxsave'), :scope('local'), :decl('var') ),
                QAST::Var.new( :name('$*CTXSAVE'), :scope('contextual') )
            ),
            QAST::Op.new(
                :op('unless'),
                QAST::Op.new(
                    :op('isnull'),
                    QAST::Var.new( :name('ctxsave'), :scope('local') )
                ),
                QAST::Op.new(
                    :op('if'),
                    QAST::Op.new(
                        :op('can'),
                        QAST::Var.new( :name('ctxsave'), :scope('local') ),
                        QAST::SVal.new( :value('ctxsave') )
                    ),
                    QAST::Op.new(
                        :op('callmethod'), :name('ctxsave'),
                        QAST::Var.new( :name('ctxsave'), :scope('local')
                    )))))
    }
   
    method SET_BLOCK_OUTER_CTX($block) {
        my $outer_ctx := %*COMPILING<%?OPTIONS><outer_ctx>;
        if nqp::defined($outer_ctx) {
            until nqp::isnull($outer_ctx) {
                my $pad := nqp::ctxlexpad($outer_ctx);
                unless nqp::isnull($pad) {
                    for $pad {
                        my str $key := ~$_;
                        unless $block.symbol($key) {
                            my $lextype := nqp::lexprimspec($pad, $key);
                            if $lextype == 0 {
                                $block.symbol($key, :scope<lexical>, :value(nqp::atkey($pad, $key)));
                            }
                            elsif $lextype == 1 {
                                $block.symbol($key, :scope<lexical>, :value(nqp::atkey_i($pad, $key)), :type(int));
                            }
                            elsif $lextype == 2 {
                                $block.symbol($key, :scope<lexical>, :value(nqp::atkey_n($pad, $key)), :type(num));
                            }
                            elsif $lextype == 3 {
                                $block.symbol($key, :scope<lexical>, :value(nqp::atkey_s($pad, $key)), :type(str));
                            }
                        }
                    }
                }
                $outer_ctx := nqp::ctxouter($outer_ctx);
            }
        }
    }

    method EXPR($/, $key?) {
        unless $key { return 0; }
        my $past := $/.ast // $<OPER>.ast;
        unless $past {
            $past := QAST::Op.new( :node($/) );
            if $<OPER><O><op> {
                $past.op( ~$<OPER><O><op> );
            }
            if $key eq 'LIST' { $key := 'infix'; }
            my $name := nqp::lc($key) ~ ':<' ~ $<OPER><sym> ~ '>';
            $past.name('&' ~ $name);
            unless $past.op {
                $past.op('call');
            }
        }
        if $key eq 'POSTFIX' {
            $past.unshift($/[0].ast);
        }
        else {
            for $/.list { if nqp::defined($_.ast) { $past.push($_.ast); } }
        }
        make $past;
    }

    method term:sym<circumfix>($/) { make $<circumfix>.ast }

    method termish($/) { make $<term>.ast; }
    method nullterm($/) { make pir::new__Ps('Undef') }
    method nullterm_alt($/) { make $<term>.ast; }

    method integer($/) { make $<VALUE>.ast; }

    method dec_number($/) { make +$/; }

    method decint($/) { make string_to_int( $/, 10); }
    method hexint($/) { make string_to_int( $/, 16); }
    method octint($/) { make string_to_int( $/, 8 ); }
    method binint($/) { make string_to_int( $/, 2 ); }

    method quote_EXPR($/) {
        my $past := $<quote_delimited>.ast;
        if %*QUOTEMOD<w> {
            if nqp::istype($past, QAST::SVal) {
                my @words := HLL::Grammar::split_words($/, $past.value);
                if +@words != 1 {
                    $past := QAST::Op.new( :op('list'), :node($/) );
                    for @words { $past.push(QAST::SVal.new( :value($_) )); }
                }
                else {
                    $past := QAST::SVal.new( :value(~@words[0]) );
                }
            }
            else {            
                $/.CURSOR.panic("Can't form :w list from non-constant strings (yet)");
            }
        }
        make $past;
    }

    method quote_delimited($/) {
        my @parts;
        my $lastlit := '';
        for $<quote_atom> {
            my $ast := $_.ast;
            if !nqp::istype($ast, QAST::Node) {
                $lastlit := $lastlit ~ $ast;
            }
            elsif nqp::istype($ast, QAST::SVal) {
                $lastlit := $lastlit ~ $ast.value;
            }
            else {
                if $lastlit gt '' {
                    @parts.push(QAST::SVal.new( :value($lastlit) ));
                }
                @parts.push(nqp::istype($ast, QAST::Node)
                    ?? $ast
                    !! QAST::SVal.new( :value($ast) ));
                $lastlit := '';
            }
        }
        if $lastlit gt '' { @parts.push(QAST::SVal.new( :value($lastlit) )); }
        my $past := @parts ?? @parts.shift !! QAST::SVal.new( :value('') );
        while @parts {
            $past := QAST::Op.new( $past, @parts.shift, :op('concat') );
        }
        make $past;
    }

    method quote_atom($/) {
        make $<quote_escape> ?? $<quote_escape>.ast !! ~$/;
    }

    method quote_escape:sym<backslash>($/) { make "\\"; }
    method quote_escape:sym<stopper>($/) { make ~$<stopper> }

    method quote_escape:sym<bs>($/)  { make "\b"; }
    method quote_escape:sym<nl>($/)  { make "\n"; }
    method quote_escape:sym<cr>($/)  { make "\r"; }
    method quote_escape:sym<tab>($/) { make "\t"; }
    method quote_escape:sym<ff>($/)  { make "\c[12]"; }
    method quote_escape:sym<esc>($/) { make "\c[27]"; }

    method quote_escape:sym<hex>($/) {
        make self.ints_to_string( $<hexint> ?? $<hexint> !! $<hexints><hexint> );
    }

    method quote_escape:sym<oct>($/) {
        make self.ints_to_string( $<octint> ?? $<octint> !! $<octints><octint> );
    }

    method quote_escape:sym<chr>($/) {
        make $<charspec>.ast;
    }

    method quote_escape:sym<0>($/) {
        make "\c[0]";
    }

    method quote_escape:sym<misc>($/) {
        make $<textq> ?? '\\' ~ $<textq>.Str !! $<textqq>.Str;
    }

    method charname($/) {
        my $codepoint := $<integer>
                         ?? $<integer>.ast
                         !! pir::find_codepoint__Is(
                                pir::trans_encoding__Ssi(~$/,
                                    pir::find_encoding__Is('utf8')) );
        $/.CURSOR.panic("Unrecognized character name $/") if $codepoint < 0;
        make nqp::chr($codepoint);
    }

    method charnames($/) {
        my $str := '';
        for $<charname> { $str := $str ~ $_.ast; }
        make $str;
    }

    method charspec($/) {
        make $<charnames> ?? $<charnames>.ast !! nqp::chr(string_to_int( $/, 10 ));
    }
}

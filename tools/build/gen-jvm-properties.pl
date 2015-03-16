#!/usr/bin/perl
# Copyright (C) 2008-2011, The Perl Foundation.

use strict;
use warnings;
use 5.008;

use Config;

binmode STDOUT, ':utf8';

my ($prefix, $thirdPartyJars) = @ARGV;

my $cpsep = $^O eq 'MSWin32' ? ';' : ':';
my $jardir = ".";
my $libdir = ".";

if ($prefix ne '.') {
    $jardir = "${prefix}/share/nqp/runtime";
    $libdir = "${prefix}/share/nqp/lib";
	my @jars = grep { s/^.*\/// } split($cpsep, $thirdPartyJars);
	$thirdPartyJars = join($cpsep, grep { s/^/${jardir}\// } @jars);
}

$thirdPartyJars .= "${cpsep}${jardir}/nqp-runtime.jar${cpsep}${libdir}/nqp.jar";

s/\\/\\\\/g for ($prefix, $thirdPartyJars, $libdir);

# We extract information from Perl's config to know how to compile shared
# libraries (which is needed for nativecall stuff). If this has to be tweaked
# in the future, I found this to be an invaluable reference:
# http://perl5.git.perl.org/perl.git/blob/HEAD:/Porting/Glossary
my $ccdlflags = "$Config{cccdlflags} $Config{ccdlflags}";
my $ldout = $^O eq 'MSWin32'? '-out:' : '-o';

print <<"END";
# This file automatically generated by $0

runtime.prefix=${prefix}
runtime.bootclasspath=-Xbootclasspath/a:.${cpsep}${thirdPartyJars}
runtime.classpath=${libdir}
runtime.jars=${thirdPartyJars}
nativecall.o=$Config{_o}
nativecall.so=$Config{so}
nativecall.cc=$Config{cc}
nativecall.ccflags=$Config{ccflags}
nativecall.ccdlflags=$ccdlflags
nativecall.ld=$Config{ld}
nativecall.ldout=$ldout
nativecall.ldflags=$Config{ldflags}
nativecall.lddlflags=$Config{lddlflags}
nativecall.libs=$Config{libs}
nativecall.perllibs=$Config{perllibs}
END

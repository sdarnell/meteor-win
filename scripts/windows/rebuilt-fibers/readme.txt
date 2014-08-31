This directory contains a rebuild version of fibers that works on Windows XP.
For some reason the pre-packaged fibers x86 build is not compatible
(seems to be linked with a runtime that has extra dependencies on kernel32.dll
that XP doesn't have).

It also increases the range when scanning thread locals.


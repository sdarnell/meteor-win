How to build Meteor for Windows
-------------------------------

Start git bash (mingw shell)

Build the dev_bundle
```
$ ./scripts/generate-dev-bundle.sh

```
This will extract the node MSI (but doesn't install it).
It also installs lots of NPM modules.
Some of these modules contain native components and will need
to be compiled. This requires visual studio and python 2.7.

There will probably be some warnings (at least with VS 2012).

Sometimes the NPM fetch will fail and NPM will retry, for example:
```
npm http GET https://github.com/sdarnell/gzippo/tarball/e824ae280d
npm ERR! fetch failed https://github.com/sdarnell/gzippo/tarball/e824ae280d
npm http GET https://github.com/sdarnell/gzippo/tarball/e824ae280d
npm ERR! fetch failed https://github.com/sdarnell/gzippo/tarball/e824ae280d
npm http GET https://github.com/sdarnell/gzippo/tarball/e824ae280d
npm ERR! fetch failed https://github.com/sdarnell/gzippo/tarball/e824ae280d
npm ERR! Error: connect ETIMEDOUT
```
This is believed to be a github issue (possibly their tarball servers get
 overloaded or confused). Things seem to recover after a while.
 Just retry later.

Once the dev_bundle has been built, there will be a tar.gz file in the root
 directory, and that should be expanded:
```
$ mkdir dev_bundle
$ cd dev_bundle
$ tar xvf ../dev_bundle_Windows_i386_0.3.0.tar.gz
$ cd ..
```

Then I switch to a regular command prompt window at the root.
The next step initialises some npm dependencies/versions:
```
C:\github\meteor>scripts\windows\meteor_get_ready.bat
coffeescript: updating npm dependencies -- coffee-script...
email: updating npm dependencies -- mailcomposer, simplesmtp, stream-buffers...
less: updating npm dependencies -- less...
livedata: updating npm dependencies -- sockjs, websocket...
mongo-livedata: updating npm dependencies -- mongodb...
stylus: updating npm dependencies -- stylus, nib...
```

Make sure you have WIX installed and on the PATH:
```
C:\github\meteor>set WIX
WIX=C:\Program Files (x86)\WiX Toolset v3.7\

C:\github\meteor>set PATH=%PATH%;%WIX%\bin
```

Generate the msi (```Meteor.msi```):
```
C:\github\meteor>dev_bundle\bin\node.exe scripts\windows\pack.js
... lots of files ...
Compiling...
Meteor.wxs

Linking...
Cleaning...
Packed!
```

Congratulations, you're done.

To install just run Meteor.msi.

Note that the MSI will upgrade earlier releases cleanly, but if you rebuild
 the installer you should make sure you uninstall the existing version first.

// Avoid a hard dependency on this module (not currently present on Windows)
NpmModuleNodeAesGcm = null;
try {
NpmModuleNodeAesGcm = Npm.require('node-aes-gcm');
} catch (e) {
}

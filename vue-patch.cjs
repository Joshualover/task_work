const path = require('path');
const Module = require('module');

const originalResolveFilename = Module._resolveFilename;
let patched = false;

Module._resolveFilename = function (request, parent, isMain, options) {
  const filename = originalResolveFilename.call(this, request, parent, isMain, options);
  
  if (!patched && filename.includes('coding-preset-vite-react/lib/index.js')) {
    patched = true;
    const originalExports = require(filename);
    const originalDefineConfig = originalExports.defineConfig;
    
    function patchedDefineConfig(overrides = {}, options = {}) {
      const result = originalDefineConfig(overrides, options);
      
      if (result.resolve && result.resolve.alias) {
        result.resolve.alias['@client'] = path.resolve(process.cwd(), 'client');
        result.resolve.alias['@shared'] = path.resolve(process.cwd(), 'shared');
        result.resolve.alias['@server'] = path.resolve(process.cwd(), 'server');
        result.resolve.alias['@'] = path.resolve(process.cwd(), 'client/src');
      } else if (result.resolve) {
        result.resolve.alias = {
          '@client': path.resolve(process.cwd(), 'client'),
          '@shared': path.resolve(process.cwd(), 'shared'),
          '@server': path.resolve(process.cwd(), 'server'),
          '@': path.resolve(process.cwd(), 'client/src'),
        };
      } else {
        result.resolve = {
          alias: {
            '@client': path.resolve(process.cwd(), 'client'),
            '@shared': path.resolve(process.cwd(), 'shared'),
            '@server': path.resolve(process.cwd(), 'server'),
            '@': path.resolve(process.cwd(), 'client/src'),
          },
        };
      }
      
      return result;
    }
    
    originalExports.defineConfig = patchedDefineConfig;
    if (originalExports.default) {
      originalExports.default = patchedDefineConfig;
    }
  }
  
  return filename;
};

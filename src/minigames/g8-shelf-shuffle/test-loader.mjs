// Local test loader: transpile the project's TypeScript with its installed compiler.
// No emitted files, test framework dependency, or production hooks are required.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const cache = new Map();
export function load(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  return loadFile(filename);
}
function loadFile(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const nativeRequire = createRequire(filename);
  const localRequire = (spec) => {
    if (spec.startsWith('.')) {
      let resolved = path.resolve(path.dirname(filename), spec);
      if (!path.extname(resolved)) resolved += '.ts';
      return loadFile(resolved);
    }
    return nativeRequire(spec);
  };
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      verbatimModuleSyntax: false,
    },
  });
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}

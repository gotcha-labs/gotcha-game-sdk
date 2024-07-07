import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig, type Plugin } from "rollup";
import copy from 'rollup-plugin-copy';

const sourcemap = true;

export default defineConfig({
  input: 'src/index.ts',
  output: [
    { dir: `dist`, format: 'esm', sourcemap, entryFileNames: 'esm/[name].js' },
    { dir: `dist`, format: 'cjs', sourcemap, entryFileNames: 'cjs/[name].js' },
  ],
  logLevel: 'info',
  plugins: [
    commonjs({
      sourceMap: sourcemap,
    }),
    resolve({
      browser: true,
    }),
    typescript({
      exclude: ['**/*.test.ts'],
    }),
    terser({
      sourceMap: sourcemap,
      parse: {
        html5_comments: false,
        shebang: false,
      },
      compress: {
        passes: 4,
        drop_console: ['log', 'info'],
        drop_debugger: true,
        ecma: 2020,
        // Warning: code cannot depend on `Function.length`
        keep_fargs: false,
      },
      format: {
        comments: false,
      }
    }),
    copy({
      targets: [
        {
          src: './package.json',
          dest: 'dist',
          transform: (contents, name) => {
            const pkgJson = JSON.parse(contents.toString('utf8'));
            delete pkgJson.devDependencies;
            delete pkgJson.scripts;
            delete pkgJson.type;
            delete pkgJson.packageManager;
            pkgJson.main = pkgJson.main.replace(/.\/dist\//, './');
            pkgJson.module = pkgJson.module.replace(/.\/dist\//, './');
            pkgJson.exports = {
              ".": {
                "types": "./index.d.ts",
                  "module": "./esm/index.js",
                  "require": "./cjs/index.js"
              }
            };
            return JSON.stringify(pkgJson, null, 2);
          }
        },
      ]
    })
  ],
  treeshake: {
    preset: 'smallest',
  }
});

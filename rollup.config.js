/*
 * @Date: 2024-05-23 10:01:00
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-12-17 19:22:36
 * @FilePath: \node-hiprint-transit\rollup.config.js
 */
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';

export default {
  input: {
    index: './index.js',
    init: './init.js',
    'src/config': './src/config.js',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    chunkFileNames: '[name]_chunk.js',
    exports: 'named',
  },
  plugins: [
    del({
      targets: 'dist/*',
      runOnce: true,
    }),
    commonjs(),
    resolve({
      exportConditions: ['node'],
      preferBuiltins: true,
    }),
    json(),
    copy({
      targets: [
        {
          src: 'src/locales',
          dest: 'dist/src',
        },
        {
          src: 'src/ssl.key',
          dest: 'dist/src',
        },
        {
          src: 'src/ssl.pem',
          dest: 'dist/src',
        },
        {
          src: './config.json',
          dest: 'dist',
        },
        {
          src: 'package.json',
          dest: 'dist',
          transform: (contents) => {
            const pkg = JSON.parse(contents.toString());
            // 只保留必要的字段
            return JSON.stringify(
              {
                name: pkg.name,
                version: pkg.version,
                main: pkg.main,
                type: pkg.type,
              },
              null,
              2,
            );
          },
        },
      ],
    }),
  ],
  onwarn: (warning, warn) => {
    if (warning.code !== 'CIRCULAR_DEPENDENCY') {
      warn(warning);
    }
  },
};

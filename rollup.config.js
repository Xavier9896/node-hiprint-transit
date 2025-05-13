/*
 * @Date: 2024-05-23 10:01:00
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2025-05-09 13:38:22
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
    start: './start.js',
    'src/config': './src/config.js',
  },
  output: [
    {
      dir: 'dist',
      format: 'esm',
      chunkFileNames: '[name]_chunk.js',
      exports: 'named',
    },
    {
      dir: 'out',
      format: 'cjs',
      chunkFileNames: '[name]_chunk.js',
      exports: 'named',
    },
  ],
  plugins: [
    del({
      targets: ['dist/*', 'out/*'],
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
                main: './index.js',
                type: 'module',
              },
              null,
              2,
            );
          },
        },
        {
          src: 'src/locales',
          dest: 'out/src',
        },
        {
          src: 'src/ssl.key',
          dest: 'out/src',
        },
        {
          src: 'src/ssl.pem',
          dest: 'out/src',
        },
        {
          src: './config.json',
          dest: 'out',
        },
        {
          src: './start.bat',
          dest: 'out',
        },
        {
          src: 'package.json',
          dest: 'out',
          transform: (contents) => {
            const pkg = JSON.parse(contents.toString());
            // 只保留必要的字段
            return JSON.stringify(
              {
                name: pkg.name,
                version: pkg.version,
                main: './index.js',
                type: 'commonjs',
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

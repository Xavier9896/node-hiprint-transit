/*
 * @Date: 2024-05-23 10:01:00
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-05-23 12:42:43
 * @FilePath: /node-hiprint-transit/rollup.config.js
 */
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import copy from "rollup-plugin-copy";
import del from "rollup-plugin-delete";
export default {
  input: {
    index: "./index.js",
    init: "./init.js",
    "src/config": "./src/config.js",
  },
  output: {
    dir: "dist",
    format: "cjs",
    chunkFileNames: "[name]_chunk.js",
    exports: "named",
  },
  plugins: [
    del({
      targets: "dist/*",
      runOnce: true,
    }),
    commonjs(),
    resolve({
      exportConditions: ["node"],
      preferBuiltins: true,
    }),
    json(),
    copy({
      targets: [
        {
          src: "src/locales",
          dest: "dist/src",
        },
        {
          src: "src/ssl.key",
          dest: "dist/src",
        },
        {
          src: "src/ssl.pem",
          dest: "dist/src",
        },
        {
          src: "./config.json",
          dest: "dist",
        },
      ],
    }),
  ],
  onwarn: (warning, warn) => {
    if (warning.code !== 'CIRCULAR_DEPENDENCY') {
      warn(warning);
    }
  }
};

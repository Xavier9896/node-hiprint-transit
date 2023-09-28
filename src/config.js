/*
 * @Date: 2023-09-28 19:32:35
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2023-10-03 10:39:47
 * @FilePath: \node-hiprint-transit\src\config.js
 */
import os from "node:os";
import path from "node:path";
import { readFile, writeFile } from "node:fs";
import { fileURLToPath } from "node:url";

// ES Module need use fileURLToPath to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "../", "config.json");

// Default config
const CONFIG = {
  port: "17521",
  token: "vue-plugin-hiprint",
  useSSL: false,
  lang: "en",
};

/**
 * @description: Read config from config.json
 * @return {Promise}
 */
export function readConfig() {
  return new Promise((resolve, reject) => {
    readFile(configPath, "utf-8", (err, data) => {
      if (err) {
        reject(err);
      } else if (data) {
        try {
          var _CONFIG = Object.assign({}, CONFIG, JSON.parse(data));
          // Check config
          // Check port need between 10000 and 65535
          if (_CONFIG.port < 10000 || _CONFIG.port > 65535)
            _CONFIG.port = "17521";
          CONFIG.port = _CONFIG.port;
          // Check token need more than 6 characters, and can't be empty
          if (_CONFIG.token && _CONFIG.token.length < 6) {
            _CONFIG.token = "vue-plugin-hiprint";
          }
          CONFIG.token = _CONFIG.token;
          CONFIG.useSSL = _CONFIG.useSSL || false;
          // Check lang need in ["zh", "en"]
          CONFIG.lang = ["zh", "en"].includes(_CONFIG.lang)
            ? _CONFIG.lang
            : "en";
          resolve(CONFIG);
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

/**
 * @description: Write config to config.json
 * @param {Object} _CONFIG
 * @return {Promise}
 */
export function writeConfig(_CONFIG) {
  // Check config
  // Check port need between 10000 and 65535
  if (_CONFIG.port < 10000 || _CONFIG.port > 65535) _CONFIG.port = "17521";
  // Check token need more than 6 characters, and can't be empty
  if ((_CONFIG.token || "").length < 6) {
    _CONFIG.token = "vue-plugin-hiprint";
  }
  _CONFIG.useSSL = Boolean(_CONFIG.useSSL) || false;
  // Check lang need in ["zh", "en"]
  _CONFIG.lang = ["zh", "en"].includes(_CONFIG.lang) ? _CONFIG.lang : "en";
  return new Promise((resolve, reject) => {
    writeFile(configPath, JSON.stringify(_CONFIG, null, 2), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * @description: Get local IP address
 * @return {String}
 */
export function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
}

export default {
  readConfig,
  writeConfig,
  getIPAddress,
};

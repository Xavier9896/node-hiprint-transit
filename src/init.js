/*
 * @Date: 2023-09-29 13:52:41
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2023-10-07 16:44:01
 * @FilePath: \node-hiprint-transit\src\init.js
 */
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { writeConfig } from "./config.js";
import { I18n } from "i18n";

// ES Module need use fileURLToPath to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Default config
const CONFIG = {
  port: 17521, // port
  token: "vue-plugin-hiprint", // TOKEN
  useSSL: false, // SSL on/off
  lang: "en", // language
};

// Setup i18n
const i18n = new I18n({
  locales: ["en", "zh"],
  directory: path.join(__dirname, "locales"),
  defaultLocale: "en",
});

/**
 * @description: Set language
 * @return {Promise}
 */
function setLang() {
  return new Promise((resolve) => {
    rl.question("Set language 设置语言\nen/zh(en): ", (input) => {
      if (input && ["zh", "ZH"].includes(input)) {
        CONFIG.lang = "zh";
      } else {
        CONFIG.lang = "en";
      }
      i18n.setLocale(CONFIG.lang);
      resolve();
    });
  });
}

/**
 * @description: Set port
 * @return {Promise}
 */
function setPort() {
  return new Promise((resolve) => {
    rl.question(
      i18n.__("Set serve port %s:", "10000~65535(17521)"),
      (input) => {
        if (input && /^\d+$/.test(input) && input >= 10000 && input <= 65535) {
          CONFIG.port = input * 1;
          resolve();
        } else if (!input) {
          CONFIG.port = 17521;
          resolve();
        } else {
          console.warn(
            i18n.__("Port must be set between %s", "10000 and 65535")
          );
          resolve(setPort());
        }
      }
    );
  });
}

/**
 * @description: Set token
 * @return {Promise}
 */
function setToken() {
  return new Promise((resolve) => {
    rl.question(
      i18n.__("Set service TOKEN (%s):", "vue-plugin-hiprint"),
      (input) => {
        if (input && input.length >= 6) {
          CONFIG.token = input;
          resolve();
        } else if (!input) {
          CONFIG.token = "vue-plugin-hiprint";
          resolve();
        } else {
          console.warn(
            i18n.__(
              "For security reasons, the TOKEN length must be greater than 5"
            )
          );
          resolve(setToken());
        }
      }
    );
  });
}

/**
 * @description: Set SSL
 * @return {Promise}
 */
function setSSL() {
  return new Promise((resolve) => {
    rl.question(i18n.__("Set SSL on or off y/n (%s):", "n"), (input) => {
      if (input && ["y", "Y"].includes(input)) {
        CONFIG.useSSL = true;
        resolve();
      } else {
        CONFIG.useSSL = false;
        resolve();
      }
    });
  });
}

setLang().then(() => {
  setPort().then(() => {
    setToken().then(() => {
      setSSL().then(() => {
        writeConfig(CONFIG)
          .then(() => {
            console.log(i18n.__("Configuration file written successfully"));
          })
          .catch(() => {
            console.error(i18n.__("Configuration file write failed"));
          })
          .finally(() => {
            rl.close();
          });
      });
    });
  });
});

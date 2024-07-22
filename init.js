/*
 * @Date: 2023-09-29 13:52:41
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-07-22 15:02:09
 * @FilePath: /node-hiprint-transit/init.js
 */
import path from "node:path";
import readline from "node:readline";
import inquirer from "inquirer";
import { fileURLToPath } from "node:url";
import { writeConfig } from "./src/config.js";
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
  directory: path.join(__dirname, "./src/locales"),
  defaultLocale: "en",
});

/**
 * @description: Set language
 * @return {Promise}
 */
function setLang() {
  return new Promise((resolve) => {
    inquirer
      .prompt([
        {
          name: "lang",
          type: "list",
          message: "Set language 设置语言 ",
          choices: [
            {
              name: "English",
              value: "en",
            },
            {
              name: "简体中文",
              value: "zh",
            },
          ],
        },
      ])
      .then((answers) => {
        CONFIG.lang = answers.lang;
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
    inquirer.prompt([{
      name: "port",
      type: "input",
      message: i18n.__("Set serve port %s:", "10000~65535"),
      default: 17521,
      validate: (input) => {
        if (input && /^\d+$/.test(input) && input >= 10000 && input <= 65535) {
          return true;
        } else if (!input) {
          return true;
        } else {
          return i18n.__("Port must be set between %s", "10000 and 65535");
        }
      },
    }]).then((answers) => {
      CONFIG.port = answers.port * 1;
      resolve();
    });
  });
}

/**
 * @description: Set token
 * @return {Promise}
 */
function setToken() {
  return new Promise((resolve) => {
    inquirer.prompt([{
      name: "token",
      type: "input",
      message: i18n.__("Set service TOKEN (Use the wildcard character (*) to match any character):"),
      default: "vue-plugin-hiprint",
      validate: (input) => {
        if (input && input.length >= 6) {
          return true;
        } else if (!input) {
          return true;
        } else {
          return i18n.__(
            "For security reasons, the TOKEN length must be greater than 5"
          );
        }
      },
    }]).then((answers) => {
      CONFIG.token = answers.token;
      resolve();
    });
  });
}

/**
 * @description: Set SSL
 * @return {Promise}
 */
function setSSL() {
  return new Promise((resolve) => {
    inquirer.prompt([{
      name: "ssl",
      type: "confirm",
      message: i18n.__("Use SSL:"),
      default: false,
    }]).then((answers) => {
      CONFIG.useSSL = answers.ssl;
      resolve();
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

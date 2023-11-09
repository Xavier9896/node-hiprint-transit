/*
 * @Date: 2023-09-29 20:50:59
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2023-11-09 14:35:40
 * @FilePath: \node-hiprint-transit\src\log.js
 */
import { access, appendFile, constants, mkdir, writeFile } from "node:fs";
import dayjs from "dayjs";

/**
 * @description: This function checks if the log directory exists. If it does not exist, a new directory will be created.
 * @return {Promise} A Promise object that resolves if the directory exists, or rejects if creating the directory fails.
 */
function checkDir() {
  const dirPath = "./logs";
  return new Promise((resolve, reject) => {
    access(dirPath, constants.F_OK, (err) => {
      if (err) {
        mkdir(dirPath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * This function checks if a log file exists. If it does not exist, a new log file will be created.
 * @returns {Promise} A Promise object that resolves if the file exists, or rejects if creating the file fails.
 */
function checkLogFile() {
  const filePath = `./logs/${dayjs().format("YYYY-MM-DD")}.log`;
  return new Promise((resolve, reject) => {
    checkDir()
      .then(() => {
        access(filePath, constants.F_OK, (err) => {
          if (err) {
            writeFile(filePath, "", (err) => {
              if (err) {
                reject(err);
              } else {
                resolve;
              }
            });
          } else {
            resolve();
          }
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
}

/**
 * Writes log message to log file.
 * @param {string} message - The log message to be written.
 * @returns {Promise} - A Promise object that resolves when writing is successful, or rejects when writing fails.
 */
function log(message) {
  const filePath = `./logs/${dayjs().format("YYYY-MM-DD")}.log`;
  return new Promise((resolve, reject) => {
    checkLogFile()
      .then(() => {
        const logMessage = `${dayjs().format(
          "YYYY/MM/DD HH:mm:ss"
        )}: ${message}\n`;
        appendFile(filePath, logMessage, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
}

export default log;

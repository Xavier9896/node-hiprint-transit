/*
 * @Date: 2023-09-29 20:50:59
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2023-10-02 11:29:49
 * @FilePath: /node-hiprint-transit/log.js
 */
import { appendFile } from "node:fs";
import dayjs from "dayjs";


function log(message) {
  return new Promise((resolve, reject) => {
    const logMessage = `${dayjs().format("YYYY/MM/DD HH:mm:ss")}: ${message}\n`;
    appendFile(
      `logs/${dayjs().format("YYYY-MM-DD")}.log`,
      logMessage,
      (err) => {
        if (err) reject(err);
        resolve();
      }
    );
  })
}

export default log;
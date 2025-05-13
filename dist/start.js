import readline from 'node:readline';
import { i as inquirer } from './inquirer_chunk.js';
import { b as chalk } from './index_chunk.js';
import { spawn } from 'node:child_process';
import 'node:process';
import 'assert';
import 'events';
import 'node:assert';
import 'tty';
import 'readline';
import 'stream';
import 'buffer';
import 'util';
import 'fs';
import 'child_process';
import 'string_decoder';
import 'path';
import 'crypto';
import 'node:os';
import 'node:tty';
import 'os';

const scripts = [
  {
    name: '启动服务',
    value: './index.js',
  },
  {
    name: '初始化配置',
    value: './init.js',
  },
];

// Setup readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(chalk.blue('欢迎使用 node-hiprint-transit'));

inquirer
  .prompt([
    {
      name: 'script',
      type: 'list',
      message: '请选择要执行的操作：',
      choices: scripts,
    },
  ])
  .then((answers) => {
    const script = scripts.find((s) => s.value === answers.script);

    console.log(chalk.green(`\n正在执行: ${script.name}\n`));

    const child = spawn('node', [answers.script], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.log(chalk.red(`\n执行失败，退出码: ${code}`));
      }
      rl.close();
    });
  });

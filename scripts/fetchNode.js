import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_VERSION = 'v16.20.2';
const PLATFORM = 'win-x64';
const MIRROR_URL = `https://cdn.npmmirror.com/binaries/node/${NODE_VERSION}/${PLATFORM}/node.exe`;
const OUTPUT_DIR = path.join(__dirname, '..', 'out');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const outputPath = path.join(OUTPUT_DIR, 'node.exe');

console.log(chalk.blue('🚀 开始下载 Node.js...'));
console.log(chalk.green(`📦 版本: ${NODE_VERSION}`));
console.log(chalk.green(`💻 平台: ${PLATFORM}`));
console.log(chalk.yellow(`🔗 下载地址: ${MIRROR_URL}`));

// 创建进度条
const progressBar = new cliProgress.SingleBar({
  format: '下载进度 |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} 字节',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

https
  .get(MIRROR_URL, (response) => {
    if (response.statusCode !== 200) {
      console.error(chalk.red(`❌ 下载失败: ${response.statusCode}`));
      return;
    }

    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;

    progressBar.start(totalSize, 0);

    const file = fs.createWriteStream(outputPath);
    
    response.on('data', (chunk) => {
      downloadedSize += chunk.length;
      progressBar.update(downloadedSize);
    });

    response.pipe(file);

    file.on('finish', () => {
      progressBar.stop();
      file.close();
      console.log(chalk.green(`✅ 下载完成: ${outputPath}`));
    });
  })
  .on('error', (err) => {
    progressBar.stop();
    console.error(chalk.red('❌ 下载出错:'), err.message);
  });

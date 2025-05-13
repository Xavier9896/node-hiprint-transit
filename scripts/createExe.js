import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import chalk from 'chalk';

// 将 exec 转换为 Promise 风格
const execAsync = promisify(exec);

// 获取当前文件路径和根目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * 主函数：创建自解压的 EXE 安装包
 */
async function createExe() {
  let tempDir = '';
  let temp7zFile = '';

  console.log(chalk.blue('🚀 开始打包 exe'));

  try {
    // 确保 `out` 目录存在
    const outDir = path.join(rootDir, 'out');
    if (!fs.existsSync(outDir)) {
      console.error('错误：out 目录不存在，请先运行构建命令');
      process.exit(1);
    }

    // 创建临时目录用于存放打包文件
    tempDir = path.join(rootDir, 'temp_package');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);

    // 复制 `out` 目录内容到临时目录
    fs.cpSync(outDir, tempDir, { recursive: true });

    // 使用 7z 压缩
    const sevenZipPath = path.join(rootDir, 'bin', '7za.exe');
    const sfxPath = path.join(rootDir, 'bin', '7z.sfx');
    const outputExe = path.join(rootDir, 'out', 'hiprint-transit-setup.exe');

    // 直接生成自解压文件
    const Command = `"${sevenZipPath}" a -sfx"${sfxPath}" "${outputExe}" "${tempDir}\\*"`;
    await execAsync(Command);

    console.log(chalk.green('✅ 打包成功！'));
    console.log(chalk.blue(`文件路径: ${outputExe}`));
  } catch (error) {
    console.error(chalk.red('❌ 打包失败！'));
    console.error('打包过程中发生错误：', error);
    process.exit(1);
  } finally {
    // 清理临时文件
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      if (temp7zFile && fs.existsSync(temp7zFile)) {
        fs.unlinkSync(temp7zFile);
      }
    } catch (cleanupError) {
      console.warn('清理临时文件时发生警告：', cleanupError);
    }
  }
}

// 执行主函数
createExe();

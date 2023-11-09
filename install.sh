
###
 # @Date: 2023-11-09 15:19:34
 # @LastEditors: admin@54xavier.cn
 # @LastEditTime: 2023-11-09 15:20:52
 # @FilePath: \node-hiprint-transit\install.sh
### 
# 下载仓库代码
wget https://github.com/Xavier9896/node-hiprint-transit/archive/refs/heads/main.zip

# 解压缩代码
unzip main.zip

# 进入代码目录
cd node-hiprint-transit-main

# 初始化项目
npm run init

# 启动项目
npm run serve
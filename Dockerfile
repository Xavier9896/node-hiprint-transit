# 使用官方的 Node.js 镜像作为基础镜像
FROM node:16

# 设置工作目录
WORKDIR /node-hiprint-transit

# 复制项目文件
COPY dist/ .

# 暴露应用运行的端口
EXPOSE 17521

# 启动应用
CMD ["node", "index.js"]
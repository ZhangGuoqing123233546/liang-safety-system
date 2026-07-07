# Render 联网版部署说明

当前版本已经包含后台和数据库同步能力：

- 前端页面：index.html、app.js、favicon.ico
- 后台服务：server.js
- 依赖配置：package.json
- Render 蓝图：render.yaml

## 推荐部署方式

1. 将本文件夹全部上传到 GitHub。
2. 打开 Render Dashboard。
3. 选择 New + -> Blueprint。
4. 连接 GitHub 仓库。
5. Render 会读取 render.yaml，自动创建：
   - 一个 Node Web Service
   - 一个 PostgreSQL 数据库
   - DATABASE_URL 环境变量
6. 部署成功后，打开 Web Service 生成的网址。

## 手动部署方式

如果不用 Blueprint，也可以手动创建：

1. New + -> PostgreSQL，创建数据库。
2. New + -> Web Service，选择 GitHub 仓库。
3. 设置：
   - Runtime: Node
   - Build Command: npm install
   - Start Command: npm start
4. 在 Web Service 的 Environment 中添加：
   - DATABASE_URL = PostgreSQL 的 Internal Database URL 或 Connection String
5. 部署完成后访问 Web Service 的 onrender.com 地址。

## 注意

现在不能再只用 Static Site，因为 Static Site 不能运行 server.js，也不能直接连接数据库。
手机和电脑都打开同一个 Web Service 网址，即可读取同一份后台数据。
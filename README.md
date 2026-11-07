# liuxiao-api

「刘骁是gay」的投稿 / 句子 API，跑在 **Deno Deploy + Deno KV** 上。

## 部署

1. 打开 <https://dash.deno.com>，用 GitHub 登录。
2. **New Project → Deploy from GitHub**，授权 Deno Deploy 访问本仓库，选择 `liuxiao-api`。
3. 入口文件填 `main.ts`，Deploy。
4. 项目 **Settings → Environment Variables** 添加：
   - `ADMIN_KEY` = 你自己的长随机串（40+ 位，字母数字符号混合）
5. 保存后会重新部署；记下项目地址 `https://xxxx.deno.dev`。

## 接口

公开：

- `GET /quotes` — 已上线的动态句子
- `POST /submit` — `{ "speaker": "可选", "text": "句子" }`

管理（请求头 `X-Admin-Key: <ADMIN_KEY>`）：

- `GET /pending`
- `POST /approve` — `{ "id": "..." }`
- `POST /delete-pending` — `{ "id": "..." }`
- `POST /add` — `{ "speaker": "可选", "text": "句子" }`
- `POST /delete-quote` — `{ "id": "..." }`

`GET /health` 用于检查服务是否活着。

## 说明

- 投稿先写入 `pending`，管理页通过后才进 `quotes`；公开接口只能读 `quotes`，读不到待审核内容。
- 管理键只存在 Deno 的环境变量里，不在代码里；前端管理页由用户在本机输入。
- 待审核上限 200 条，防止被无限灌入；超出返回 429。
- KV 为 Deno Deploy 自带；本地跑需要 `deno run -A main.ts` 并允许 KV。

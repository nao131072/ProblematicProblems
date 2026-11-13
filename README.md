# 知問｜公開問答社群

目前版本是以 Node.js 驅動的 Q&A 首頁 MVP，提供：

- 問題搜尋與熱門關鍵字
- 依問題狀態、領域篩選
- 依最新、活躍度或回答數排序
- 登入/登出（MVP session）
- 提出問題並寫入 JSON 資料
- 發布回答並更新問題狀態

啟動開發伺服器：

```powershell
npm start
```

然後開啟 <http://localhost:3000>。資料會在首次啟動時從 `data/questions.json` 匯入 `data/zhiwen.sqlite`，之後由 SQLite 儲存；登入是展示用的簡化 session，正式上線前應替換成具備密碼或 OAuth 的驗證系統。
# WikiTA 大師兄適性測驗系統 (Adaptive Learning System)

這是一款專為教育者與學生打造的 **AI 驅動適性測驗平台**。
透過整合 Google Gemini 的強大語意理解能力，系統能夠根據您輸入的任何概念（例如：光合作用、Python 變數、文藝復興...），自動依照 **Bloom's Taxonomy (布魯姆認知層次)** 產出不同難度的優質考題，並提供學生「動態適性爬塔」的測驗體驗。

## ✨ 核心特色 (Features)

### 👨‍🏫 教師端 (Teacher Dashboard)
- **跨學科 AI 命題**：突破學科限制，只要輸入知識點，AI 即可為您量身打造高品質題目與詳解。
- **Bloom's Tier 難度分級**：精準控制產出題目的認知難度（從最基礎的 `1 - Remember` 到最進階的 `6 - Create`）。
- **一鍵派發任務**：可設定測驗題數並派發給學生。
- **題庫管理**：支援雙重條件（概念 ＋ 難度）篩選、單題微調編輯，以及批次勾選刪除功能。
- **掌握度熱圖 (Class Heatmap)**：視覺化呈現全班學生對於不同知識點的掌握度（概念展示）。

### 👨‍🎓 學生端 (Student Quiz Engine)
- **動態適性測驗 (Adaptive Engine)**：
  - **暖身起手**：永遠從最簡單的 Level 1 開始測試基礎。
  - **遇強則強**：答對即可解鎖更高難度的題目（升級）。
  - **遇弱則補強**：答錯時不僅會給予詳解，下一題更會自動降低難度，鞏固觀念後再重新出發。
- **電玩級 UI 體驗**：流暢的動畫、即時星級難度顯示，讓枯燥的考試變成打怪爬塔。

---

## 🚀 快速開始 (Quick Start)

### 1. 安裝依賴套件
請確保您的系統已安裝 Python 3.8+，然後執行以下指令安裝必要的套件：
```bash
pip install flask google-genai python-dotenv
```

### 2. 設定環境變數
請複製 `.env.example` 檔案並重新命名為 `.env`：
```bash
cp .env.example .env
```
接著，打開 `.env` 檔案，填入您的 Gemini API 金鑰：
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. 啟動伺服器
執行以下指令啟動 Flask 伺服器：
```bash
python app.py
```
> **注意**：系統會在首次啟動時，自動為您建立一個全新的 `quiz.db` SQLite 資料庫。

### 4. 開始體驗
打開您的瀏覽器，前往：
[http://127.0.0.1:5000](http://127.0.0.1:5000)

---

## 🛠️ 技術棧 (Tech Stack)
- **AI 引擎 (AI Engine)**: Google Gemini API

---

## ☁️ 雲端部署至 Render (Cloud Deployment)

本專案支援一鍵部署至 [Render.com](https://render.com/)，並搭配 Render 免費提供的 PostgreSQL 資料庫，解決免費主機休眠會刪除資料的問題。

### 部署步驟：
1. **建立資料庫 (PostgreSQL)**：
   - 登入 Render，點擊 `New` -> `PostgreSQL`。
   - 名稱隨意填寫，選擇 `Free` 方案，點擊 `Create Database`。
   - 建立完成後，往下滑找到 **`Internal Database URL`**，將這串網址複製下來。
2. **部署應用程式 (Web Service)**：
   - 點擊 `New` -> `Web Service`。
   - 選擇綁定您的 GitHub，並選擇這個專案 (WikiTA-Adaptive-System)。
   - **Environment (環境)**：選擇 `Python 3`
   - **Build Command (建置指令)**：`pip install -r requirements.txt`
   - **Start Command (啟動指令)**：`gunicorn app:app`
   - 方案選擇 `Free`。
3. **設定環境變數 (Environment Variables)**：
   - 在部署頁面展開 `Advanced` 區塊，點擊 `Add Environment Variable`。
   - 新增第一個變數：
     - **Key**: `DATABASE_URL`
     - **Value**: `(剛剛複製的 Internal Database URL)`
   - 新增第二個變數：
     - **Key**: `GEMINI_API_KEY`
     - **Value**: `(您的 Gemini API 金鑰)`
4. 點擊 **`Create Web Service`**！

大約等待 3~5 分鐘，您的專案就會在雲端正式上線，並且擁有永久儲存題目的 PostgreSQL 資料庫了！

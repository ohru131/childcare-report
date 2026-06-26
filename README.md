# 👶 保育日報アプリ (Childcare Report App)

> **Gemini 3.5 / 3.0 Flash ＆ Firebase Emulator で動く、保育士のための業務支援・日報作成アシスタント**

保育現場における日報作成や事故報告書の作成、経費精算（領収書登録）といった事務作業を、最新の Gemini AI API を活用して極限まで効率化する Web アプリケーションです。
ローカルの Firebase Emulator 環境と Vite を使用し、安全かつ迅速に開発・プレビューが可能です。

---

## 📸 スクリーンショット

![アプリのメイン画面 (顧客一覧と領収書登録)](./docs/screenshot.png)

---

## 🌟 主な機能

### 1. 🔍 顧客一覧・検索・地域フィルタ
- 登録されている児童・保護者（顧客）の情報を一覧表示します。
- **京都の各行政区（中京区、東山区、伏見区、左京区、北区、上京区、下京区など）でのフィルタリング**に対応。
- アレルギー情報の有無を視認性の高いバッジ（「アレルギーあり」）で強調表示。
- 氏名やアレルギー情報のキーワードによる動的検索。

### 2. 📝 Gemini AI による「保育日報」の自動生成
- 保育士が入力した口語のメモや音声入力テキストから、プロフェッショナルな日報を自動生成します。
- **必須情報チェック機能**:
  - ① 訪問当日のサポート内容、② お客様情報（家庭環境や生活状況）、③ 保育士の振り返り の3つの要素がメモに含まれているかを自動判定。
  - 不足している要素がある場合は、警告（Warnings）として不足項目をリストアップしつつ、補完して生成します。

### 3. ⚠️ 事故報告書（アクシデントレポート）の構造化出力
- 発生したトラブルや怪我のメモから、事故報告書に必要な項目（発生時間、場所、事故内容、状況、応急処置、保護者対応、医師の診断・処置、今後の対策）を Gemini が整理・抽出してJSON形式でパースし、レポート化します。

### 4. 🧾 領収書 OCR (経費精算機能)
- 領収書や駐車精算書の画像をアップロード（またはカメラ撮影）すると、Gemini 3.5 Flash のマルチモーダル機能により、**金額、店舗名、取引日時**を瞬時に読み取り、自動で入力フォームを埋めます。

---

## 🛠 搭載テクノロジー

- **フロントエンド**: React 19, TypeScript, Tailwind CSS (Vite @tailwindcss/vite)
- **AI 連携**: `@google/genai` (Gemini API / `gemini-3-flash-preview`)
- **データベース & 認証**: Firebase SDK (Firestore, Firebase Authentication)
- **開発・シミュレーション**: Firebase Emulator Suite (ローカル環境で Firestore / Auth をシミュレート)
- **アイコン / アニメーション**: Lucide React, Motion (Framer Motion)

---

## 🚀 クイックスタート (ローカルでの起動方法)

### 前提条件
- [Node.js](https://nodejs.org/) がインストールされていること

### 1. リポジトリのクローンと依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
プロジェクトのルートディレクトリに `.env` ファイルを作成し、Gemini API キーを設定します。
` .env.example` をコピーして作成することも可能です。

```env
GEMINI_API_KEY=あなたのGEMINI_API_KEY
```

### 3. アプリケーションの起動

Windows 環境の場合は、以下の PowerShell スクリプトを実行するだけで、依存関係のチェック・環境変数のロード・Firebase Emulator の立ち上げ・開発サーバーの起動が全自動で行われます。

```powershell
./start.ps1
```

#### 手動で起動する場合 (PowerShell を使用しない場合)
以下のコマンドを順に実行してください。

1. **Firebase エミュレーターと開発サーバーの起動**:
   ```bash
   npx firebase emulators:exec --project=demo-childcare --ui --only auth,firestore --import=.emulator-data --export-on-exit=.emulator-data "npm run dev"
   ```
2. **ブラウザでアクセス**:
   - アプリケーション: [http://localhost:3000](http://localhost:3000)
   - Firebase エミュレーター UI: [http://localhost:4000](http://localhost:4000)

---

## 🔒 セキュリティとデータについて
- ローカル開発時、認証情報や Firestore のデータはすべて Firebase エミュレーター（メモリ上およびローカルエミュレーター内）で処理されるため、本番の Firebase プロジェクトを汚すことなく安全にテストできます。
- アプリ起動時に、デモ用の顧客データ（歴史上の人物を模したサンプルデータ：織田信長、豊臣秀吉など）が自動的にローカルの Firestore にシードされます。
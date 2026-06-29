# 新規 Firebase プロジェクト移行手順

このプロジェクトを新規 Firebase へ移すための実行手順。

## 0. 事前に決める値

- 新規プロジェクトID: `<NEW_PROJECT_ID>`
- 表示名: `Childcare Report App`
- Firestore Database ID: `childcare-report-main`
- リージョン: `asia-northeast1`

## 1. Firebase CLI の確認とログイン

```bash
npx -y firebase-tools@latest --version
npx -y firebase-tools@latest login
```

ブラウザログイン不可の環境:

```bash
npx -y firebase-tools@latest login --no-localhost
```

## 2. 新規プロジェクト作成と選択

```bash
npx -y firebase-tools@latest projects:create <NEW_PROJECT_ID> --display-name "Childcare Report App"
npx -y firebase-tools@latest use <NEW_PROJECT_ID>
```

## 3. Firestore データベース作成

```bash
npx -y firebase-tools@latest firestore:databases:create childcare-report-main --location=asia-northeast1 --project <NEW_PROJECT_ID>
```

## 4. Web アプリ作成と SDK 設定取得

```bash
npx -y firebase-tools@latest apps:create WEB "Childcare Report Web" --project <NEW_PROJECT_ID>
npx -y firebase-tools@latest apps:list WEB --project <NEW_PROJECT_ID>
```

`apps:list` で出た `App ID` を使って実行:

```bash
npx -y firebase-tools@latest apps:sdkconfig WEB <APP_ID> --project <NEW_PROJECT_ID>
```

## 5. ローカル設定ファイル更新

`apps:sdkconfig` の値で次を更新。

- `firebase-applet-config.json`
  - `projectId`
  - `appId`
  - `apiKey`
  - `authDomain`
  - `storageBucket`
  - `messagingSenderId`
  - `firestoreDatabaseId` は `childcare-report-main` を維持
- `.firebaserc`
  - `projects.default` を `<NEW_PROJECT_ID>`

`firebase.json` の `firestore.databaseId` は `childcare-report-main` を維持。

## 6. Firestore ルール適用

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --project <NEW_PROJECT_ID>
```

## 7. 動作確認

```bash
npm run lint
.\start.ps1
```

確認ポイント:

- 開発画面が起動する
- Firestore Emulator UI が開く
- TSV/CSV インポートが動く

## 8. 本番利用前チェック

- Firebase Console で Authentication を有効化
- 必要なら Google ログインを有効化
- Firestore 本番 DB 側に同じルールが適用されていることを確認
- API キーや構成値が新規プロジェクト値になっていることを確認

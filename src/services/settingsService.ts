import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { AppSettings } from "../types";

const SETTINGS_DOC_ID = "app";

const DEFAULT_PROMPTS = {
  generateWithWarnings: `
あなたは保育士の業務を支援するAIアシスタントです。
以下の「保育日報のメモ（口語）」をもとに、日報を作成してください。

# 必須情報チェック
以下の3点が入力テキストに含まれているか確認してください。
1. 訪問当日のサポート内容 (具体的に何をしたか)
2. お客様情報 (家庭内の状況や家族との会話から見えた生活状況など)
3. 振り返り (自分のサポートに対しての内省・今回どうだったか)

# 指示
- 不足している必須情報があれば、その項目名を "warnings" 配列にリストアップしてください。
- 不足情報の有無に関わらず、入力された情報を元に可能な範囲でレポートを作成してください。

# 入力テキスト
{inputText}

# 時間情報
{timeInfo}

# 出力フォーマット (JSON)
{
  "warnings": ["不足項目名1", "不足項目名2"],
  "internal": "社内向けレポート内容",
  "customer": "保護者向けレポート内容"
}
`.trim(),
  generateAccident: `
あなたは保育園の事故報告書作成を支援するAIです。
入力された状況説明（メモ）から、以下の項目に整理・分解してJSON形式で出力してください。

# 入力テキスト
{inputText}

# 時間情報
{timeInfo}

# 出力項目とルール
- occurrenceTime: 発生日時（不明なら「要確認」）
- location: 発生場所
- accidentContent: 事故内容（端的な見出し）
- situation: 発生状況（時系列、事実のみ）
- immediateResponse: 発生時の対応（時系列）
- parentCorrespondence: 保護者への対応
- diagnosisTreatment: 診断名および処置状況
- prevention: 事故防止に向けた今後の対応

# 出力フォーマット (JSON)
{
  "occurrenceTime": "...",
  "location": "...",
  "accidentContent": "...",
  "situation": "...",
  "immediateResponse": "...",
  "parentCorrespondence": "...",
  "diagnosisTreatment": "...",
  "prevention": "..."
}
`.trim(),
  placeholderDaily: `①訪問当日のサポート内容
（実際に実施した保育・家事・対応内容など）
②お客様情報
（家庭内の状況、保護者や子どもの様子、会話から見えた生活状況・要望・健康面など）
③振り返り
（支援中の状況→対応→結果、気づき、改善点、次回への申し送りなど）`,
  placeholderAccident: `①事実を時系列で、客観的に
感情的な表現や推測は避け、見聞きした事実のみを時系列に並べます。

②5W1H＋初動対応を意識
いつ・どこで・誰が・何をしていて・何が起こり・どう対処したかを押さえます。

③ヒヤリハットも記録
ヒヤリハットも重大事故と同じ視点で記録し、要因分析と再発防止策を残します。`,
  hintAccident: `事故報告書 記載項目と記載要領

発生日時: 分単位まで記載。発見時刻と発生時刻が異なる場合は両方記載。
発生場所: 施設名＋部屋名／屋外ならエリアまで具体化。
事故内容: 端的な見出し語で記載。
発生状況: 環境・子どもの行動・職員配置・事故発生の瞬間を1文1事実で記録。
発生時の対応: 誰が、何分後に、何をしたかを時系列で記載。
保護者への対応: 連絡手段・時刻・反応・受診予定を記録。
診断名および処置状況: 受診後は医師診断を転記。未受診なら「診療前」。
事故防止に向けた対応: 原因分析、一次対策、恒久対策を明記。`,
  placeholderHiyari: `ヒヤリハット記入時の留意点
- 重大事故に至る可能性まで含めて原因を書く
- 再発防止策を具体化（配置変更、備品、声かけ、期限、担当）`,
};

const DEFAULT_MODELS = {
  dailyReport: "gemini-2.5-flash",
  accidentReport: "gemini-2.5-flash",
  receiptOcr: "gemini-2.5-flash",
};

export const DEFAULT_SETTINGS: AppSettings = {
  models: DEFAULT_MODELS,
  prompts: DEFAULT_PROMPTS,
};

export async function getAppSettings(): Promise<AppSettings> {
  const ref = doc(db, "settings", SETTINGS_DOC_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      ...DEFAULT_SETTINGS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return DEFAULT_SETTINGS;
  }

  const data = snap.data() as Partial<AppSettings>;
  return {
    models: {
      ...DEFAULT_MODELS,
      ...(data.models || {}),
    },
    prompts: {
      ...DEFAULT_PROMPTS,
      ...(data.prompts || {}),
    },
  };
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const ref = doc(db, "settings", SETTINGS_DOC_ID);
  await setDoc(
    ref,
    {
      models: settings.models,
      prompts: settings.prompts,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

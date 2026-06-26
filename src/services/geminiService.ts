import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface DailyReportResponse {
  warnings: string[];
  internal: string;
  customer: string;
}

export interface AccidentReportResponse {
  occurrenceTime: string;
  location: string;
  accidentContent: string;
  situation: string;
  immediateResponse: string;
  parentCorrespondence: string;
  diagnosisTreatment: string;
  prevention: string;
}

export interface ReceiptOcrResponse {
  amount: number;
  storeName: string;
  receiptDate: string;
}

export async function generateDailyReport(text: string, timeInfo: string): Promise<DailyReportResponse> {
  const prompt = `
あなたは保育士の業務を支援するAIアシスタントです。
以下の「保育日報のメモ（口語）」をもとに、日報を作成してください。

# 必須情報チェック
以下の3点が入力テキストに含まれているか確認してください。
1. **訪問当日のサポート内容** (具体的に何をしたか)
2. **お客様情報** (家庭内の状況や家族との会話から見えた生活状況など)
3. **振り返り** (自分のサポートに対しての内省・今回どうだったか)

# 指示
- 不足している必須情報があれば、その項目名を "warnings" 配列にリストアップしてください。
- 不足情報の有無に関わらず、入力された情報を元に可能な範囲でレポートを作成してください。

# 入力テキスト
${text}

# 時間情報
${timeInfo}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          internal: { type: Type.STRING },
          customer: { type: Type.STRING },
        },
        required: ["warnings", "internal", "customer"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function generateAccidentReport(text: string, timeInfo: string): Promise<AccidentReportResponse> {
  const prompt = `
あなたは保育園の事故報告書作成を支援するAIです。
入力された状況説明（メモ）から、以下の項目に整理・分解してJSON形式で出力してください。

# 入力テキスト
${text}

# 時間情報
${timeInfo}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          occurrenceTime: { type: Type.STRING },
          location: { type: Type.STRING },
          accidentContent: { type: Type.STRING },
          situation: { type: Type.STRING },
          immediateResponse: { type: Type.STRING },
          parentCorrespondence: { type: Type.STRING },
          diagnosisTreatment: { type: Type.STRING },
          prevention: { type: Type.STRING },
        },
        required: ["occurrenceTime", "location", "accidentContent", "situation", "immediateResponse", "parentCorrespondence", "diagnosisTreatment", "prevention"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function extractReceiptInfo(base64Image: string): Promise<ReceiptOcrResponse> {
  const prompt = `
    Analyze the image of this receipt.
    Identify the following information:
    1. Total Amount (Total, 合計, 支払い金額)
    2. Store Name or Parking Name (店舗名や駐車場名など、発行元の名称)
    3. Date and Time of transaction (取引日時や精算日時). Format as "yyyy/MM/dd HH:mm".

    Return the result in JSON format.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: base64Image.split(",")[1] } },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER },
          storeName: { type: Type.STRING },
          receiptDate: { type: Type.STRING },
        },
        required: ["amount", "storeName", "receiptDate"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}

import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getApiKey() {
  const key = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini API key is missing. Set VITE_GEMINI_API_KEY in .env");
  }
  return key;
}

function getAiClient() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return aiClient;
}

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

type DailyOptions = {
  model: string;
  promptTemplate: string;
  onPartialText?: (text: string) => void;
};

type AccidentOptions = {
  model: string;
  promptTemplate: string;
  onPartialText?: (text: string) => void;
};

type OcrOptions = {
  model: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || "";
  return (
    message.includes('"status":"UNAVAILABLE"') ||
    message.includes('"code":503') ||
    message.includes('"status":"RESOURCE_EXHAUSTED"') ||
    message.includes('"code":429')
  );
}

function buildPrompt(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{${key}}`, value);
  }, template);
}

function parseJsonResponse<T>(text: string | undefined): T {
  const raw = (text || "{}").trim();
  if (!raw) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]) as T;
    }
    throw new Error("Gemini response was not valid JSON");
  }
}

async function generateJsonWithStream<T>(params: {
  model: string;
  prompt: string;
  responseSchema: any;
  onPartialText?: (text: string) => void;
}): Promise<T> {
  const stream = await getAiClient().models.generateContentStream({
    model: params.model,
    contents: params.prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: params.responseSchema,
    },
  });

  let fullText = "";
  for await (const chunk of stream) {
    const partial = chunk.text || "";
    if (!partial) continue;
    fullText += partial;
    params.onPartialText?.(fullText);
  }

  return parseJsonResponse<T>(fullText);
}

export async function generateDailyReport(
  text: string,
  timeInfo: string,
  options: DailyOptions,
): Promise<DailyReportResponse> {
  const prompt = buildPrompt(options.promptTemplate, { inputText: text, timeInfo });
  return generateJsonWithStream<DailyReportResponse>({
    model: options.model,
    prompt,
    onPartialText: options.onPartialText,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        internal: { type: Type.STRING },
        customer: { type: Type.STRING },
      },
      required: ["warnings", "internal", "customer"],
    },
  });
}

export async function generateAccidentReport(
  text: string,
  timeInfo: string,
  options: AccidentOptions,
): Promise<AccidentReportResponse> {
  const prompt = buildPrompt(options.promptTemplate, { inputText: text, timeInfo });
  return generateJsonWithStream<AccidentReportResponse>({
    model: options.model,
    prompt,
    onPartialText: options.onPartialText,
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
  });
}

export async function extractReceiptInfo(base64Image: string, options: OcrOptions): Promise<ReceiptOcrResponse> {
  const prompt = `
    Analyze the image of this receipt.
    Identify the following information:
    1. Total Amount (Total, 合計, 支払い金額)
    2. Store Name or Parking Name (店舗名や駐車場名など、発行元の名称)
    3. Date and Time of transaction (取引日時や精算日時). Format as "yyyy/MM/dd HH:mm".

    Return the result in JSON format.
  `;
  const fallbackModels = [options.model, "gemini-2.5-flash"].filter(
    (v, i, a) => !!v && a.indexOf(v) === i,
  );

  let lastError: unknown;
  for (const model of fallbackModels) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await getAiClient().models.generateContent({
          model,
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

        return parseJsonResponse<ReceiptOcrResponse>(response.text);
      } catch (error) {
        lastError = error;
        if (!isTransientGeminiError(error) || attempt === 3) {
          break;
        }
        await sleep(attempt * 700);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OCR request failed");
}

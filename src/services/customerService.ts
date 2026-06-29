import { collection, deleteDoc, doc, getDocs, setDoc, query, limit, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Customer, FamilyMember } from "../types";

export interface CustomerImportResult {
  processed: number;
  upserted: number;
  skipped: number;
  errors: string[];
}

export interface CustomerImportProgress {
  total: number;
  completed: number;
  upserted: number;
  skipped: number;
  stage: "importing" | "done";
}

const FAMILY_FIELD_KEY = "世帯全員の情報（名前・生年月日・職業/所属・アレルギー・その他共有事項）";

export async function fetchCustomers(): Promise<Customer[]> {
  const querySnapshot = await getDocs(collection(db, "customers"));
  const customers = await Promise.all(
    querySnapshot.docs.map(async (customerDoc) => {
      const data = customerDoc.data() as Omit<Customer, "id" | "family">;
      const familySnapshot = await getDocs(collection(db, "customers", customerDoc.id, "family"));
      const family = familySnapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const toText = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

        return {
          id: d.id,
          name: toText(raw.name) || toText(raw["家族氏名"]),
          dob: toText(raw.dob) || toText(raw["生年月日"]),
          job: toText(raw.job) || toText(raw["職業"]),
          allergy: toText(raw.allergy) || toText(raw["アレルギー情報"]),
          info: toText(raw.info) || toText(raw["備考"]),
        } as FamilyMember;
      });

      return {
        id: customerDoc.id,
        ...data,
        family,
      };
    }),
  );

  return customers;
}

async function runWithConcurrency<T>(items: T[], worker: (item: T, index: number) => Promise<void>, concurrency = 8): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

function detectDelimiter(headerLine: string): "\t" | "," {
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return tabCount >= commaCount ? "\t" : ",";
}

function parseDelimitedText(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeDocId(rawId: string, fallbackIndex: number): string {
  const normalized = (rawId || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^0-9a-zA-Z_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);

  return normalized || `import_${fallbackIndex}`;
}

function extractCity(address: string): string {
  if (!address) return "";
  const cityWardMatch = address.match(/([^\s\d]+市[^\s\d]+区)/);
  if (cityWardMatch?.[1]) {
    return cityWardMatch[1].replace(/^[^\s\d]+市/, "");
  }
  const wardMatch = address.match(/([^\s\d]+区)/);
  if (wardMatch?.[1]) return wardMatch[1];
  const cityMatch = address.match(/([^\s\d]+市)/);
  return cityMatch?.[1] || "";
}

function parseLatLng(raw: string): { lat?: number; lng?: number } {
  const text = (raw || "").trim();
  if (!text) return {};

  const parts = text.split(/[\s,、]+/).filter(Boolean);
  if (parts.length < 2) return {};

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  return { lat, lng };
}

function normalizeDateStr(dateStr: string): string {
  if (!dateStr) return "";

  let str = dateStr.replace(/生$/, "").trim();

  if (/^\d{8}$/.test(str)) {
    return `${str.substring(0, 4)}/${str.substring(4, 6)}/${str.substring(6, 8)}`;
  }

  const eraMatch = str.match(/^(明治|大正|昭和|平成|令和)\s*([0-9元]+)\s*年\s*([0-9]+)\s*月\s*([0-9]+)\s*日?$/);
  if (eraMatch) {
    const era = eraMatch[1];
    let year = eraMatch[2] === "元" ? 1 : parseInt(eraMatch[2], 10);
    const month = parseInt(eraMatch[3], 10);
    const day = parseInt(eraMatch[4], 10);

    if (era === "明治") year += 1867;
    else if (era === "大正") year += 1911;
    else if (era === "昭和") year += 1925;
    else if (era === "平成") year += 1988;
    else if (era === "令和") year += 2018;

    return `${year}/${month}/${day}`;
  }

  const abbrevMatch = str.match(/^([MTSHRmtshr])(\d{1,2})[\.\\/](\d{1,2})[\.\\/](\d{1,2})$/i);
  if (abbrevMatch) {
    const era = abbrevMatch[1].toUpperCase();
    let year = parseInt(abbrevMatch[2], 10);
    const month = parseInt(abbrevMatch[3], 10);
    const day = parseInt(abbrevMatch[4], 10);

    if (era === "M") year += 1867;
    else if (era === "T") year += 1911;
    else if (era === "S") year += 1925;
    else if (era === "H") year += 1988;
    else if (era === "R") year += 2018;

    return `${year}/${month}/${day}`;
  }

  const kanjiDotMatch = str.match(/^(明治|大正|昭和|平成|令和)(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/);
  if (kanjiDotMatch) {
    const era = kanjiDotMatch[1];
    let year = parseInt(kanjiDotMatch[2], 10);
    const month = parseInt(kanjiDotMatch[3], 10);
    const day = parseInt(kanjiDotMatch[4], 10);

    if (era === "明治") year += 1867;
    else if (era === "大正") year += 1911;
    else if (era === "昭和") year += 1925;
    else if (era === "平成") year += 1988;
    else if (era === "令和") year += 2018;

    return `${year}/${month}/${day}`;
  }

  const westernMatch = str.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (westernMatch) {
    return `${westernMatch[1]}/${westernMatch[2]}/${westernMatch[3]}`;
  }

  str = str.replace(/[年月\.\-]/g, "/").replace(/日/g, "");
  return str;
}

interface ParsedFamilyInfo {
  name: string;
  dob: string;
  info: string;
}

function parseFamilyInfo(rawText: string): ParsedFamilyInfo[] {
  const results: ParsedFamilyInfo[] = [];
  if (!rawText) return results;

  const lines = rawText.split(/[\r\n]+/);
  const reDate = /((?:19|20)\d{2}[\.\\/\-]\d{1,2}[\.\\/\-]\d{1,2}|(?:明治|大正|昭和|平成|令和)\s*[0-9元]+\s*[\.\-年]\s*[0-9]+\s*[\.\-月]\s*[0-9]+\s*日?|(?:19|20)\d{2}年\d{1,2}月\d{1,2}日?|[MTSHRmtshr]\d{1,2}[\.\\/]\d{1,2}[\.\\/]\d{1,2}(?:生)?|(?:19|20)\d{6})/gi;

  type WorkingFamilyInfo = { name: string; dob: string; infoList: string[]; justStarted: boolean };
  let current: WorkingFamilyInfo = { name: "", dob: "", infoList: [], justStarted: false };

  const flush = () => {
    if (current && (current.name || current.dob)) {
      const cleanedName = current.name ? current.name.replace(/^\([^)]+\)\s*/, "").trim() : "";
      results.push({
        name: cleanedName,
        dob: current.dob,
        info: current.infoList.join(" ").trim(),
      });
    }
    current = { name: "", dob: "", infoList: [], justStarted: false };
  };

  lines.forEach((line) => {
    let clean = line.trim();
    if (!clean) return;

    if (clean.startsWith("・")) {
      clean = clean.substring(1).trim();
    }

    let inParens = false;
    if (clean.includes("（") && clean.includes("）")) {
      const parenMatch = clean.match(/^([^（]+)（([^）]+)）$/);
      if (parenMatch) {
        const name = parenMatch[1].trim();
        const content = parenMatch[2].trim();
        clean = `${name} ${content.replace(/、/g, " ")}`;
        inParens = true;
      }
    }

    if (!inParens) {
      clean = clean.replace(/、/g, " ");
    }

    reDate.lastIndex = 0;
    const match = reDate.exec(clean);

    if (match) {
      const dateStr = match[0];
      const idx = match.index;
      let pre = clean.substring(0, idx).trim();
      let post = clean.substring(idx + dateStr.length).trim();

      pre = pre.replace(/^\([^)]+\)\s*/, "").trim();

      if (pre.includes("・")) {
        pre = pre.split("・")[0].trim();
      }
      if (post.startsWith("・")) post = post.substring(1).trim();
      if (post.includes("・")) post = post.replace(/・/g, " ");

      const isProperty = /生年月日|誕生日|DOB|Date/.test(pre) || pre.endsWith(":") || pre.endsWith("：");

      if (isProperty) {
        if (current.dob && !current.justStarted) {
          flush();
        }
        current.dob = normalizeDateStr(dateStr);
        if (post) current.infoList.push(post);
        current.justStarted = false;
      } else if (current.name && !current.dob && pre === "") {
        current.dob = normalizeDateStr(dateStr);
        if (post) current.infoList.push(post);
        current.justStarted = false;
      } else {
        if (current.name || current.dob) flush();

        current.name = pre;
        current.dob = normalizeDateStr(dateStr);
        if (post) current.infoList.push(post);
        current.justStarted = true;
      }
      return;
    }

    const infoKeywords = ["職業", "勤務", "園", "学校", "社", "アレルギー", "疾患", "病", "薬", "申請", "検討", "利用", "金額", "備考", "共有", "男児", "女児", "時", "分", "保育園", "幼稚園", "未就学児", "母乳", "発達", "クラス", "理学療法士", "作業療法士", "公務員", "役員", "落花生", "いわし", "整備士", "医師"];
    const isInfoKey = infoKeywords.some((keyword) => clean.includes(keyword));
    const isLong = clean.length > 20;
    const isLikelyName = !isInfoKey && !isLong;

    if (current.dob) {
      const blockedWords = ["主婦", "夫", "妻", "パート", "学生", "無職", "会社員", "自営業", "ケアマネージャー", "介護職", "教員", "医師", "整備士", "保育士"];
      if (isLikelyName && !blockedWords.includes(clean)) {
        flush();
        current.name = clean;
        current.justStarted = true;
      } else {
        current.infoList.push(clean);
      }
      return;
    }

    if (!current.name) {
      if (isLikelyName) {
        current.name = clean;
        current.justStarted = true;
      } else {
        current.infoList.push(clean);
      }
      return;
    }

    if (current.name.length < 5 && isLikelyName) {
      current.name += ` ${clean}`;
    } else {
      current.infoList.push(clean);
    }
  });

  flush();
  return results;
}

function parseFamilyMembers(rawFamily: string): FamilyMember[] {
  const parsed = parseFamilyInfo(rawFamily);

  return parsed
    .map((item) => {
      const parts = item.info.split(/[\s　]+/).filter(Boolean);
      const job = parts.length > 0 ? parts[0] : "";
      const allergy = parts.length > 1 ? parts[1] : "";
      const info = parts.length > 2 ? parts.slice(2).join(" ") : "";

      return {
        name: item.name,
        dob: item.dob,
        job,
        allergy,
        info,
      };
    })
    .filter((item) => item.name || item.dob || item.job || item.allergy || item.info);
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }

  const utf8Text = new TextDecoder("utf-8").decode(bytes);
  if (utf8Text.includes("\u0000")) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  return utf8Text;
}

export async function upsertCustomersFromSeparatedText(
  rawText: string,
  onProgress?: (progress: CustomerImportProgress) => void,
): Promise<CustomerImportResult> {
  const text = (rawText || "").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const rows = parseDelimitedText(text, delimiter);

  if (rows.length <= 1) {
    return {
      processed: 0,
      upserted: 0,
      skipped: 0,
      errors: ["ヘッダーまたはデータ行が見つかりませんでした。"],
    };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  let completed = 0;
  let upserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  onProgress?.({
    total: dataRows.length,
    completed,
    upserted,
    skipped,
    stage: "importing",
  });

  await runWithConcurrency(dataRows, async (rawRow, rowIndex) => {
    const rowNumber = rowIndex + 2;

    try {
      const details: Record<string, string> = {};
      headers.forEach((header, colIndex) => {
        if (!header) return;
        details[header] = (rawRow[colIndex] || "").trim();
      });

      const idCandidate = details["顧客ID"] || details["Customer ID"] || details["customerId"];
      const customerId = normalizeDocId(idCandidate, rowIndex + 1);

      const explicitName = details["氏名"] || "";
      const familyName = details["姓"] || "";
      const givenName = details["名"] || "";
      const name = explicitName || [familyName, givenName].filter(Boolean).join(" ").trim();

      if (!name) {
        skipped += 1;
        errors.push(`行${rowNumber}: 氏名の解釈に失敗したためスキップしました。`);
        return;
      }

      const address = details["住所"] || "";
      const city = extractCity(address);
      const latLngText = details["緯度・経度"] || [details["緯度"], details["経度"]].filter(Boolean).join(",");
      const { lat, lng } = parseLatLng(latLngText);

      const customerPayload: Omit<Customer, "id" | "family"> = {
        name,
        address,
        city,
        details,
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
      };

      const customerRef = doc(db, "customers", customerId);
      await setDoc(customerRef, customerPayload, { merge: true });

      const familyMembers = parseFamilyMembers(details[FAMILY_FIELD_KEY] || details["世帯全員の情報"] || "");
      const familyCollectionRef = collection(customerRef, "family");
      const existingFamilySnapshot = await getDocs(familyCollectionRef);

      const desiredIds = new Set<string>();
      await Promise.all(
        familyMembers.map(async (member, i) => {
          const memberId = `member_${i + 1}`;
          desiredIds.add(memberId);
          await setDoc(
            doc(customerRef, "family", memberId),
            {
              ...member,
              "家族氏名": member.name,
              "生年月日": member.dob,
              "職業": member.job,
              "アレルギー情報": member.allergy,
              "備考": member.info,
            },
            { merge: true },
          );
        }),
      );

      await Promise.all(
        existingFamilySnapshot.docs
          .filter((existing) => !desiredIds.has(existing.id))
          .map((existing) => deleteDoc(existing.ref)),
      );

      upserted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`行${rowNumber}: ${message}`);
    } finally {
      completed += 1;
      onProgress?.({
        total: dataRows.length,
        completed,
        upserted,
        skipped,
        stage: "importing",
      });
    }
  }, 8);

  if (errors.some((message) => /permission|unauth|auth|token/i.test(message))) {
    errors.unshift("認証エラーが含まれます。再ログイン後に再実行してください。");
  }

  onProgress?.({
    total: dataRows.length,
    completed: dataRows.length,
    upserted,
    skipped,
    stage: "done",
  });

  return {
    processed: dataRows.length,
    upserted,
    skipped,
    errors,
  };
}

export async function importCustomersFromFile(
  file: File,
  onProgress?: (progress: CustomerImportProgress) => void,
): Promise<CustomerImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const text = decodeText(bytes);
  return upsertCustomersFromSeparatedText(text, onProgress);
}

export async function seedSampleData() {
  const customersCollection = collection(db, "customers");
  const snapshot = await getDocs(query(customersCollection, limit(1)));
  
  if (!snapshot.empty) return; // Already seeded

  const sampleCustomers = [
    {
      id: "cust_001",
      name: "織田 信長",
      address: "京都府京都市中京区本能寺町522",
      city: "中京区",
      details: { "電話番号": "090-1234-5678", "メール": "nobunaga@example.com" },
      family: [
        { name: "織田 信忠", dob: "2020/05/15", job: "保育園", allergy: "卵", info: "元気な男の子" },
        { name: "織田 奇妙丸", dob: "2022/10/01", job: "自宅", allergy: "なし", info: "おっとりしている" }
      ]
    },
    {
      id: "cust_002",
      name: "豊臣 秀吉",
      address: "京都府京都市東山区茶屋町528",
      city: "東山区",
      details: { "電話番号": "080-9876-5432", "メール": "hideyoshi@example.com" },
      family: [
        { name: "豊臣 秀頼", dob: "2019/02/20", job: "幼稚園", allergy: "小麦", info: "活発で走り回るのが好き" }
      ]
    },
    {
      id: "cust_003",
      name: "徳川 家康",
      address: "京都府京都市中京区二条城町541",
      city: "中京区",
      details: { "電話番号": "070-1111-2222", "メール": "ieyasu@example.com" },
      family: [
        { name: "徳川 秀忠", dob: "2021/08/12", job: "保育園", allergy: "牛乳", info: "人見知りがある" }
      ]
    },
    {
      id: "cust_004",
      name: "坂本 龍馬",
      address: "京都府京都市伏見区南浜町263",
      city: "伏見区",
      details: { "電話番号": "090-3333-4444", "メール": "ryoma@example.com" },
      family: [
        { name: "坂本 おりょう", dob: "2020/12/30", job: "保育園", allergy: "そば", info: "元気いっぱいに遊ぶ" }
      ]
    },
    {
      id: "cust_005",
      name: "源 義経",
      address: "京都府京都市左京区鞍馬本町1074",
      city: "左京区",
      details: { "電話番号": "080-5555-6666", "メール": "yoshitsune@example.com" },
      family: [
        { name: "源 牛若丸", dob: "2022/03/10", job: "自宅", allergy: "なし", info: "よく笑う" }
      ]
    },
    {
      id: "cust_006",
      name: "足利 義満",
      address: "京都府京都市北区金閣寺町1",
      city: "北区",
      details: { "電話番号": "070-7777-8888", "メール": "yoshimitsu@example.com" },
      family: [
        { name: "足利 義持", dob: "2018/06/25", job: "小学校1年", allergy: "ピーナッツ", info: "お兄ちゃん気質" }
      ]
    },
    {
      id: "cust_007",
      name: "紫 式部",
      address: "京都府京都市上京区京都御苑3",
      city: "上京区",
      details: { "電話番号": "090-9999-0000", "メール": "shikibu@example.com" },
      family: [
        { name: "藤原 賢子", dob: "2021/01/05", job: "保育園", allergy: "エビ", info: "おままごとが好き" }
      ]
    },
    {
      id: "cust_008",
      name: "清少納言",
      address: "京都府京都市下京区烏丸通塩小路下ル",
      city: "下京区",
      details: { "電話番号": "080-1212-3434", "メール": "shonagon@example.com" },
      family: [
        { name: "橘 則季", dob: "2023/07/20", job: "自宅", allergy: "なし", info: "離乳食開始" }
      ]
    },
    {
      id: "cust_009",
      name: "平 清盛",
      address: "京都府京都市下京区西八条通",
      city: "下京区",
      details: { "電話番号": "070-5656-7878", "メール": "kiyomori@example.com" },
      family: [
        { name: "平 重盛", dob: "2019/11/11", job: "幼稚園", allergy: "なし", info: "恐竜に詳しい" }
      ]
    },
    {
      id: "cust_010",
      name: "明智 光秀",
      address: "京都府京都市右京区嵯峨小倉山堂ノ前町",
      city: "右京区",
      details: { "電話番号": "090-2424-6868", "メール": "mitsuhide@example.com" },
      family: [
        { name: "細川 ガラシャ", dob: "2020/04/01", job: "保育園", allergy: "フルーツ", info: "絵本が大好き" }
      ]
    }
  ];

  for (const sample of sampleCustomers) {
    const { family, ...customerData } = sample;
    const customerRef = doc(db, "customers", sample.id);
    await setDoc(customerRef, customerData);
    
    for (const member of family) {
      await addDoc(collection(customerRef, "family"), member);
    }
  }
}
